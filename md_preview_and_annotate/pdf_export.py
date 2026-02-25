"""PDF export via Chrome DevTools Protocol (CDP).

Uses headless Chrome with --remote-debugging-port, connects via WebSocket
to call Page.printToPDF with explicit margin control. Zero dependencies
(stdlib only — uses http.client and json for CDP, no websocket library needed).
"""

import base64
import http.client
import json
import os
import subprocess
import time


def _find_chrome():
    """Return the first available Chrome-family binary path, or None."""
    paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ]
    return next((p for p in paths if os.path.exists(p)), None)


def _find_free_port():
    """Find an available port on localhost."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _cdp_request(debug_port, method, params=None):
    """Send a CDP command via HTTP JSON API and return the result."""
    conn = http.client.HTTPConnection("127.0.0.1", debug_port, timeout=10)
    conn.request("GET", "/json")
    resp = conn.getresponse()
    targets = json.loads(resp.read())
    conn.close()

    if not targets:
        raise RuntimeError("No Chrome targets found")

    # Find a page target
    page_target = None
    for t in targets:
        if t.get("type") == "page":
            page_target = t
            break
    if not page_target:
        page_target = targets[0]

    ws_url = page_target.get("webSocketDebuggerUrl", "")
    if not ws_url or not ws_url.startswith("ws://"):
        raise RuntimeError(
            f"Chrome target has no WebSocket debugger URL "
            f"(another DevTools client may be connected). "
            f"Target: {page_target.get('url', 'unknown')}"
        )

    return _cdp_ws_command(ws_url, method, params or {})


def _cdp_ws_command(ws_url, method, params):
    """Minimal WebSocket CDP command using stdlib socket + struct."""
    import socket

    # Parse ws://host:port/path
    url_body = ws_url.replace("ws://", "")
    host_port, path = url_body.split("/", 1)
    host, port_str = host_port.split(":")
    port = int(port_str)

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(60)
    try:
        sock.connect((host, port))

        # WebSocket handshake
        key = base64.b64encode(os.urandom(16)).decode()
        handshake = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"\r\n"
        )
        sock.sendall(handshake.encode())

        # Read handshake response
        response = b""
        while b"\r\n\r\n" not in response:
            chunk = sock.recv(4096)
            if not chunk:
                raise RuntimeError("WebSocket handshake failed")
            response += chunk

        if b"101" not in response.split(b"\r\n")[0]:
            raise RuntimeError(f"WebSocket handshake rejected: {response[:200]}")

        # Send CDP command as WebSocket text frame
        msg = json.dumps({"id": 1, "method": method, "params": params}).encode()
        _ws_send(sock, msg)

        # Read response frames until we get our command result
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            frame_data = _ws_recv(sock)
            if frame_data is None:
                continue
            try:
                parsed = json.loads(frame_data)
                if parsed.get("id") == 1:
                    sock.close()
                    if "error" in parsed:
                        raise RuntimeError(f"CDP error: {parsed['error']}")
                    return parsed.get("result", {})
            except json.JSONDecodeError:
                continue

        sock.close()
        raise RuntimeError("CDP command timed out waiting for Chrome response")

    except Exception:
        sock.close()
        raise


def _ws_send(sock, data, opcode=0x81):
    """Send a WebSocket frame (masked, as required by client)."""
    import struct
    mask_key = os.urandom(4)
    masked = bytes(b ^ mask_key[i % 4] for i, b in enumerate(data))

    header = bytearray()
    header.append(0x80 | (opcode & 0x0F))  # FIN + opcode
    length = len(data)
    if length < 126:
        header.append(0x80 | length)  # MASK bit set
    elif length < 65536:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", length))
    header.extend(mask_key)
    sock.sendall(bytes(header) + masked)


def _ws_recv(sock):
    """Receive a WebSocket frame, return payload bytes or None for control frames."""
    import struct

    def _read_exact(n):
        buf = b""
        while len(buf) < n:
            chunk = sock.recv(n - len(buf))
            if not chunk:
                raise RuntimeError("WebSocket connection closed")
            buf += chunk
        return buf

    header = _read_exact(2)
    opcode = header[0] & 0x0F
    masked = bool(header[1] & 0x80)
    length = header[1] & 0x7F

    if length == 126:
        length = struct.unpack("!H", _read_exact(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _read_exact(8))[0]

    mask_key = _read_exact(4) if masked else None
    payload = _read_exact(length)

    if masked and mask_key:
        payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))

    if opcode == 0x8:  # close
        raise RuntimeError("WebSocket closed by remote")
    if opcode == 0x9:  # ping — send pong
        _ws_send(sock, payload, opcode=0x0A)
        return None

    return payload


def print_to_pdf(page_url, output_path, chrome_path=None,
                 margin_top=0.6, margin_bottom=0.6,
                 margin_left=0.6, margin_right=0.6,
                 print_background=True, timeout=30):
    """Export a page to PDF via CDP with explicit margin control.

    Args:
        page_url: URL to render (e.g. http://127.0.0.1:3031?theme=mocha&export=1)
        output_path: Where to write the PDF file
        chrome_path: Path to Chrome binary (auto-detected if None)
        margin_top/bottom/left/right: Page margins in inches
        print_background: Whether to print background colors/images
        timeout: Max seconds to wait for Chrome

    Returns:
        True on success, raises RuntimeError on failure.
    """
    chrome = chrome_path or _find_chrome()
    if not chrome:
        raise RuntimeError("Chrome/Chromium not found")

    debug_port = _find_free_port()

    # Launch headless Chrome with remote debugging
    # stderr→DEVNULL to prevent pipe buffer deadlock
    proc = subprocess.Popen(
        [
            chrome,
            "--headless=new",
            f"--remote-debugging-port={debug_port}",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--window-size=1200,800",
            page_url,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        # Wait for Chrome's debug endpoint to be ready
        deadline = time.monotonic() + timeout
        ready = False
        while time.monotonic() < deadline:
            try:
                conn = http.client.HTTPConnection("127.0.0.1", debug_port, timeout=2)
                conn.request("GET", "/json")
                resp = conn.getresponse()
                targets = json.loads(resp.read())
                conn.close()
                # Wait until a page target exists and has a URL (not about:blank)
                for t in targets:
                    if t.get("type") == "page" and "about:blank" not in t.get("url", "about:blank"):
                        ready = True
                        break
                if ready:
                    break
            except (ConnectionError, OSError, http.client.HTTPException):
                pass
            time.sleep(0.3)

        if not ready:
            raise RuntimeError("Chrome failed to load the page")

        # Give the page time to render (JS execution, font loading)
        time.sleep(2)

        # Call Page.printToPDF via CDP
        result = _cdp_request(debug_port, "Page.printToPDF", {
            "printBackground": print_background,
            "preferCSSPageSize": True,
            "displayHeaderFooter": False,
            "marginTop": margin_top,
            "marginBottom": margin_bottom,
            "marginLeft": margin_left,
            "marginRight": margin_right,
            "paperWidth": 8.5,    # letter
            "paperHeight": 11,
            "scale": 1,
        })

        # Write the PDF
        if "data" not in result:
            raise RuntimeError(
                f"Chrome did not return PDF data. CDP result keys: {list(result.keys())}"
            )
        pdf_data = base64.b64decode(result["data"])
        if len(pdf_data) == 0:
            raise RuntimeError("Chrome produced an empty PDF")

        with open(output_path, "wb") as f:
            f.write(pdf_data)

        return True

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
