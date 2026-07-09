#!/usr/bin/env python3
"""CLI entry point for dabarat.

Usage:
  python3 -m dabarat <file.md> [file2.md ...] [--port PORT] [--author NAME]
  python3 -m dabarat --workspace <path.dabarat-workspace>
  python3 -m dabarat --add <file.md> [--port PORT]
  python3 -m dabarat --annotate <file.md> --text "..." --comment "..." [--author NAME]
  --max-instances N   Limit concurrent server instances (default 5)
"""

import atexit
import datetime
import json
import os
import signal
import sys
import threading
import uuid

from . import annotations
from . import bookmarks
from . import workspace
from .server import PreviewHandler, start

DEFAULT_PORT = 3031
MAX_INSTANCES = 5
_INSTANCE_DIR = os.path.join(os.path.expanduser("~"), ".dabarat", "instances")


def _migrate_config_dir():
    """One-time migration: ~/.mdpreview/ → ~/.dabarat/"""
    old = os.path.expanduser("~/.mdpreview")
    new = os.path.expanduser("~/.dabarat")
    if not os.path.isdir(old):
        return
    os.makedirs(new, exist_ok=True)
    # Move individual items that don't already exist in new dir
    for name in os.listdir(old):
        src = os.path.join(old, name)
        dst = os.path.join(new, name)
        if not os.path.exists(dst):
            try:
                os.rename(src, dst)
            except OSError:
                import shutil
                try:
                    if os.path.isdir(src):
                        shutil.copytree(src, dst)
                    else:
                        shutil.copy2(src, dst)
                except OSError:
                    pass


def _flag_value(argv, flag, default=""):
    """Safely get the value following a --flag, or return default."""
    if flag in argv:
        idx = argv.index(flag)
        if idx + 1 < len(argv):
            return argv[idx + 1]
    return default


def _ensure_instance_dir():
    os.makedirs(_INSTANCE_DIR, exist_ok=True)


def _pid_alive(pid):
    """Check if a process with the given PID is still running."""
    try:
        os.kill(pid, 0)
        return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


def _live_instances():
    """Return list of (port, pid) for all live instances, cleaning stale ones.

    PID files are JSON {pid, port, started} (legacy plain-int files still
    parse). A PID being alive is not proof it is dabarat — PIDs get reused —
    so instances must also answer /api/tabs, with a 30s startup grace period
    before an unresponsive one is declared stale.
    """
    _ensure_instance_dir()
    live = []
    for fname in os.listdir(_INSTANCE_DIR):
        if not fname.endswith(".pid"):
            continue
        fpath = os.path.join(_INSTANCE_DIR, fname)
        try:
            # The filename is authoritative for the port; JSON contents are
            # advisory and bounded (a malformed file must never abort the
            # scan or fabricate a permanently-live instance)
            port = int(fname[: -len(".pid")])
            with open(fpath) as f:
                raw = f.read(4096).strip()
            started = None
            try:
                data = json.loads(raw)
                if not isinstance(data, dict):
                    raise ValueError("not an object")
                pid = int(data["pid"])
                s = data.get("started")
                started = s if isinstance(s, str) else None
            except (json.JSONDecodeError, ValueError, TypeError, KeyError):
                pid = int(raw)  # legacy plain-int format
            if pid <= 1:
                raise ValueError("implausible pid")

            if _pid_alive(pid):
                if _server_running(port):
                    live.append((port, pid))
                    continue
                # Alive but not serving: PID reuse, or still starting up.
                # Grace only for a valid, non-future, recent timestamp.
                if started:
                    try:
                        age = (
                            datetime.datetime.now(datetime.timezone.utc)
                            - datetime.datetime.fromisoformat(started)
                        ).total_seconds()
                        if 0 <= age < 30:
                            live.append((port, pid))
                            continue
                    except (ValueError, TypeError):
                        pass
            os.remove(fpath)
        except (ValueError, TypeError, OSError):
            try:
                os.remove(fpath)
            except OSError:
                pass
    return live


def _tab_state_path(port):
    return os.path.join(_INSTANCE_DIR, f"{port}.tabs.json")


_tab_state_lock = threading.Lock()  # orders snapshot→write so stale state never wins
_tab_state_warned = False


def _save_tab_state(port):
    """Persist current tab filepaths for crash recovery (atomic write).

    Snapshot and replace happen under one lock: without it, a delayed
    writer holding an older snapshot could overwrite a newer close and
    resurrect deliberately-closed tabs after a crash.
    """
    global _tab_state_warned
    import tempfile
    _ensure_instance_dir()
    with _tab_state_lock:
        with PreviewHandler._tabs_lock:
            filepaths = [t["filepath"] for t in PreviewHandler._tabs.values()]
        data = {
            "port": port,
            "pid": os.getpid(),
            "started": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "tabs": filepaths,
        }
        try:
            fd, tmp = tempfile.mkstemp(dir=_INSTANCE_DIR, suffix=".tmp", prefix=".tabs-")
            try:
                os.write(fd, json.dumps(data).encode())
            finally:
                os.close(fd)
            os.replace(tmp, _tab_state_path(port))
        except Exception as e:
            if not _tab_state_warned:
                _tab_state_warned = True
                print(
                    f"Warning: cannot persist tab session ({e!r}) — "
                    "crash recovery will not reflect this session",
                    file=sys.stderr,
                )


def _load_tab_state(port):
    """Return surviving tab filepaths from an uncleanly-dead instance, or [].

    Consume-once: the state file is removed after reading so stale state
    can never re-trigger. Entries are validated (string paths, regular
    non-symlink files) and corruption is reported instead of hidden.
    """
    path = _tab_state_path(port)
    if not os.path.lexists(path):
        return []
    paths = []
    try:
        if os.path.islink(path):
            raise ValueError("tab-state file is a symlink")
        with open(path) as f:
            data = json.load(f)
        tabs_list = data.get("tabs") if isinstance(data, dict) else None
        if not isinstance(tabs_list, list):
            raise ValueError("malformed tabs list")
        paths = [
            p for p in tabs_list
            if isinstance(p, str) and os.path.isfile(p) and not os.path.islink(p)
        ]
    except Exception as e:
        print(
            f"Warning: ignoring unreadable tab-session file {path} ({e!r})",
            file=sys.stderr,
        )
        paths = []
    try:
        os.remove(path)
    except OSError:
        pass
    return paths


def _clear_tab_state(port):
    try:
        os.remove(_tab_state_path(port))
    except OSError:
        pass


def _register_instance(port, server=None):
    """Write a PID file for this instance (atomic) and register cleanup."""
    import tempfile
    _ensure_instance_dir()
    pidfile = os.path.join(_INSTANCE_DIR, f"{port}.pid")
    payload = json.dumps({
        "pid": os.getpid(),
        "port": port,
        "started": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    })
    # Atomic write — concurrent _live_instances scans must never read a
    # partial file and clean up a healthy instance
    fd, tmp = tempfile.mkstemp(dir=_INSTANCE_DIR, suffix=".tmp", prefix=".pid-")
    try:
        os.write(fd, payload.encode())
    finally:
        os.close(fd)
    os.replace(tmp, pidfile)

    def _cleanup(*_args):
        try:
            os.remove(pidfile)
        except OSError:
            pass
        _clear_tab_state(port)

    atexit.register(_cleanup)

    def _sigterm_handler(*_args):
        _cleanup()
        if server:
            # shutdown() must not run on the signal-handling (serve_forever)
            # thread — it would deadlock waiting on the serve loop to stop.
            import threading
            threading.Thread(target=server.shutdown, daemon=True).start()
        else:
            sys.exit(0)

    signal.signal(signal.SIGTERM, _sigterm_handler)


def cmd_annotate(argv):
    """Write an annotation directly to the sidecar JSON (no server needed)."""
    _migrate_config_dir()
    idx = argv.index("--annotate")
    if idx + 1 >= len(argv):
        print("Error: --annotate requires a filepath")
        sys.exit(1)
    filepath = os.path.abspath(argv[idx + 1])

    text = _flag_value(argv, "--text")
    comment = _flag_value(argv, "--comment")
    author_name = _flag_value(argv, "--author", "Claude")
    ann_type = _flag_value(argv, "--type", "comment")

    data, _ = annotations.read(filepath)

    ann = {
        "id": uuid.uuid4().hex[:6],
        "anchor": {"text": text, "heading": "", "offset": 0},
        "author": {
            "name": author_name,
            "type": "ai" if author_name.lower() in ("claude", "ai", "assistant") else "human",
        },
        "created": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "body": comment,
        "type": ann_type,
        "resolved": False,
        "replies": [],
    }
    data["annotations"].append(ann)
    annotations.write(filepath, data)

    if ann_type == "bookmark":
        bookmarks.save(
            anchor_text=text,
            body=comment,
            author=author_name,
            source_file=filepath,
            ann_id=ann["id"],
        )

    print(f"\033[38;2;166;227;161m\u2713\033[0m Annotation by {author_name} on \"{text}\"")


def cmd_add(argv):
    """POST a file to a running server, then exit."""
    import urllib.request

    idx = argv.index("--add")
    if idx + 1 >= len(argv):
        print("Error: --add requires a filepath")
        sys.exit(1)
    filepath = os.path.abspath(argv[idx + 1])
    port = int(_flag_value(argv, "--port", str(DEFAULT_PORT)))

    req_data = json.dumps({"filepath": filepath}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/add",
        data=req_data,
        headers={
            "Content-Type": "application/json",
            "Origin": f"http://127.0.0.1:{port}",
        },
    )
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        print(f"\033[38;2;166;227;161m\u2713\033[0m Added: {result['filename']}")
    except Exception as e:
        print(f"\033[38;2;243;139;168m\u2717\033[0m Failed to add: {e}")
        sys.exit(1)


_CHROME_PATHS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
]

_VALID_THEMES = ["mocha", "latte", "rose-pine", "rose-pine-dawn", "tokyo-storm", "tokyo-light"]


def _find_chrome():
    """Return the first available Chrome-family binary path, or None."""
    return next((p for p in _CHROME_PATHS if os.path.exists(p)), None)


def _clear_pyc():
    """Remove stale .pyc files so template/static changes take effect."""
    cache_dir = os.path.join(os.path.dirname(__file__), "__pycache__")
    if os.path.isdir(cache_dir):
        for f in os.listdir(cache_dir):
            if f.endswith(".pyc"):
                os.remove(os.path.join(cache_dir, f))


def _port_listeners(port):
    """Return PIDs holding a TCP LISTEN on the port, or None if unknowable."""
    import subprocess
    try:
        result = subprocess.run(
            ["lsof", "-nP", f"-tiTCP:{port}", "-sTCP:LISTEN"],
            capture_output=True, text=True, timeout=3,
        )
        return [int(p) for p in result.stdout.strip().split() if p]
    except FileNotFoundError:
        print("Warning: lsof not found — cannot inspect port holders", file=sys.stderr)
        return None
    except Exception:
        return None


def _recorded_pid(port):
    """PID recorded by a previous dabarat instance for this port, or None."""
    try:
        with open(os.path.join(_INSTANCE_DIR, f"{port}.pid")) as f:
            raw = f.read(4096).strip()
        try:
            return int(json.loads(raw)["pid"])
        except Exception:
            return int(raw)
    except Exception:
        return None


def _kill_pids(pids, port):
    """SIGTERM then SIGKILL the given PIDs; clear the port's PID file."""
    import time

    # Graceful first — lets atexit/SIGTERM handlers clean up PID files
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except (ProcessLookupError, ValueError):
            pass
    time.sleep(0.5)
    # Escalate for any survivors
    for pid in pids:
        if _pid_alive(pid):
            try:
                os.kill(pid, signal.SIGKILL)
            except (ProcessLookupError, ValueError):
                pass
    time.sleep(0.3)
    try:
        os.remove(os.path.join(_INSTANCE_DIR, f"{port}.pid"))
    except OSError:
        pass


def _server_running(port):
    """Check if a mark server is already running on the given port."""
    import urllib.request
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/tabs", method="GET")
        urllib.request.urlopen(req, timeout=1)
        return True
    except Exception:
        return False


def _find_free_port():
    """Ask the OS for a free port (same pattern as cmd_export_pdf)."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _kill_zombie_on_port(port):
    """Clear a dead dabarat's listener from the port — never anything else.

    Kills only PIDs matching the PID a previous dabarat recorded for this
    port AND only when the port no longer answers /api/tabs. A responsive
    dabarat or an unidentified holder aborts the launch with an
    explanation instead of being terminated.
    """
    pids = _port_listeners(port)
    if not pids:
        return  # Free — or lsof unavailable, in which case bind() will say so
    if _server_running(port):
        print(f"\033[38;2;243;139;168m✗\033[0m Port {port} is held by a live dabarat instance")
        sys.exit(1)
    recorded = _recorded_pid(port)
    unknown = [p for p in pids if p != recorded]
    if unknown:
        print(f"\033[38;2;243;139;168m✗\033[0m Port {port} is held by non-dabarat process(es): {unknown}")
        print(f"\033[38;2;88;91;112m  Stop that process or launch with --port <other>.\033[0m")
        sys.exit(1)
    _kill_pids(pids, port)


def _get_open_filepaths(port):
    """Get list of filepaths currently open in the running server."""
    import urllib.request
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/tabs")
        resp = urllib.request.urlopen(req, timeout=2)
        tab_list = json.loads(resp.read())
        return [t["filepath"] for t in tab_list]
    except Exception:
        return []


def _ask_reuse_dialog(already_open, new_files):
    """Show macOS native dialog asking what to do with a running instance.

    Returns "add", "new_window", or "cancel". Every failure mode maps to a
    non-destructive outcome — the running server is never killed from here.
    """
    import platform
    import subprocess

    if platform.system() != "Darwin":
        return "add"

    parts = []
    if already_open:
        names = ", ".join(os.path.basename(f) for f in already_open)
        parts.append(f"Already open: {names}")
    if new_files:
        names = ", ".join(os.path.basename(f) for f in new_files)
        parts.append(f"New: {names}")
    msg = "\\n".join(parts) if parts else "Dabarat is already running."

    script = (
        f'display dialog "{msg}" '
        f'with title "Dabarat is already running" '
        f'buttons {{"Cancel", "Open New Window", "Add to Existing"}} '
        f'default button "Add to Existing" '
        f'cancel button "Cancel"'
    )
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return "cancel"  # Escape / Cancel button / dialog not shown
        if "Add to Existing" in result.stdout:
            return "add"
        if "Open New Window" in result.stdout:
            return "new_window"
        return "cancel"
    except Exception:
        print("\033[38;2;88;91;112mNote: dialog unavailable — adding to the running instance\033[0m")
        return "add"


def _add_to_running(port, files):
    """Add files to a running server as new tabs."""
    import urllib.request
    added = []
    for fp in files:
        try:
            req_data = json.dumps({"filepath": fp}).encode()
            req = urllib.request.Request(
                f"http://127.0.0.1:{port}/api/add",
                data=req_data,
                headers={
                    "Content-Type": "application/json",
                    "Origin": f"http://127.0.0.1:{port}",
                },
            )
            resp = urllib.request.urlopen(req, timeout=3)
            result = json.loads(resp.read())
            label = "already open" if result.get("existing") else "added"
            added.append((result.get("filename", os.path.basename(fp)), label))
        except Exception as e:
            added.append((os.path.basename(fp), f"failed: {e}"))
    return added


def cmd_export_pdf(argv):
    """Export a markdown file to PDF via headless Chrome."""
    import socket
    import subprocess
    import threading
    import time
    import urllib.request

    _migrate_config_dir()

    idx = argv.index("--export-pdf")
    if idx + 1 >= len(argv) or argv[idx + 1].startswith("--"):
        print("Error: --export-pdf requires a filepath")
        sys.exit(1)
    filepath = os.path.abspath(argv[idx + 1])
    if not os.path.isfile(filepath):
        print(f"\033[38;2;243;139;168m\u2717\033[0m File not found: {filepath}")
        sys.exit(1)

    # Parse options
    output = _flag_value(argv, "-o") or _flag_value(argv, "--output")
    theme = _flag_value(argv, "--theme", "mocha")
    if theme not in _VALID_THEMES:
        print(f"\033[38;2;243;139;168m\u2717\033[0m Invalid theme: {theme}")
        print(f"  Valid themes: {', '.join(_VALID_THEMES)}")
        sys.exit(1)

    if not output:
        stem = os.path.splitext(filepath)[0]
        output = stem + ".pdf"
    output = os.path.abspath(output)

    # Find Chrome
    chrome = _find_chrome()
    if not chrome:
        print("\033[38;2;243;139;168m\u2717\033[0m Chrome/Chromium not found")
        sys.exit(1)

    # Find a free port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    _clear_pyc()

    # Start ephemeral server in background thread
    PreviewHandler.add_tab(filepath)
    server = start(port)

    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    # Wait for server to be ready
    for _ in range(50):
        if not server_thread.is_alive():
            print("\033[38;2;243;139;168m\u2717\033[0m Server thread terminated unexpectedly")
            sys.exit(1)
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/tabs")
            urllib.request.urlopen(req, timeout=1)
            break
        except Exception:
            time.sleep(0.1)
    else:
        print("\033[38;2;243;139;168m\u2717\033[0m Server failed to start")
        server.shutdown()
        sys.exit(1)

    # Export via CDP (Chrome DevTools Protocol) for reliable margin control
    from .pdf_export import print_to_pdf

    date = _flag_value(argv, "--date")
    url = f"http://127.0.0.1:{port}?theme={theme}&export=1"
    if date:
        from urllib.parse import quote
        url += f"&date={quote(date)}"

    try:
        print_to_pdf(
            page_url=url,
            output_path=output,
            chrome_path=chrome,
        )
        size_kb = os.path.getsize(output) / 1024
        print(f"\033[38;2;166;227;161m\u2713\033[0m {os.path.basename(output)} ({size_kb:.0f} KB)")
        print(f"\033[38;2;88;91;112m  Theme: {theme} \u00b7 {output}\033[0m")
    except Exception as e:
        if os.path.isfile(output):
            try:
                os.remove(output)
            except OSError:
                pass
        print(f"\033[38;2;243;139;168m\u2717\033[0m PDF export failed: {e}")
        sys.exit(1)
    finally:
        server.shutdown()


def cmd_serve(argv):
    """Start the preview server with one or more files."""
    import subprocess
    import webbrowser

    _migrate_config_dir()

    port = int(_flag_value(argv, "--port", str(DEFAULT_PORT)))
    default_author = _flag_value(argv, "--author", "Tom")
    max_inst = int(_flag_value(argv, "--max-instances", str(MAX_INSTANCES)))
    ws_path = _flag_value(argv, "--workspace", "")

    # Collect file paths
    files = []
    skip_next = False
    for i, arg in enumerate(argv[1:], 1):
        if skip_next:
            skip_next = False
            continue
        if arg.startswith("--"):
            if arg in ("--port", "--author", "--max-instances", "--workspace"):
                skip_next = True
            continue
        files.append(os.path.abspath(arg))

    # Load workspace if specified
    if ws_path:
        ws_path = os.path.abspath(ws_path)
        ws_data = workspace.read_workspace(ws_path)
        if ws_data is None:
            print(f"\033[38;2;243;139;168m\u2717\033[0m Invalid workspace: {ws_path}")
            sys.exit(1)
        # Set server-side workspace state
        import dabarat.server as _srv
        _srv._active_workspace_path = ws_path
        _srv._active_workspace = ws_data
        workspace.add_recent(ws_path, ws_data.get("name"))

    # No files: attempt crash recovery from a persisted tab session
    recovered = []
    if not files and not ws_path:
        recovered = _load_tab_state(port)
        if not recovered:
            print("Error: no files specified")
            sys.exit(1)

    # Tab reuse: if a server is already running, ask what to do.
    # Every outcome here is non-destructive \u2014 the running server is never killed.
    if _server_running(port):
        open_paths = _get_open_filepaths(port)
        already_open = [f for f in files if f in open_paths]
        new_files = [f for f in files if f not in open_paths]

        choice = _ask_reuse_dialog(already_open, new_files)
        if choice == "add":
            results = _add_to_running(port, files)
            for name, status in results:
                icon = "\033[38;2;166;227;161m\u2713\033[0m" if "fail" not in status else "\033[38;2;243;139;168m\u2717\033[0m"
                print(f"{icon} {name} ({status})")
            print(f"\033[38;2;88;91;112mServer already running at http://127.0.0.1:{port}\033[0m")
            sys.exit(0)
        elif choice == "cancel":
            print("\033[38;2;88;91;112mCancelled.\033[0m")
            sys.exit(0)
        else:  # new_window \u2014 leave the running instance alone, take a free port
            port = _find_free_port()
            print(f"\033[38;2;88;91;112mOpening new window on port {port}\033[0m")

    # Instance limit: refuse to start if too many are already running
    live = _live_instances()
    if len(live) >= max_inst:
        print(f"\033[38;2;243;139;168m\u2717 Instance limit reached ({len(live)}/{max_inst})\033[0m")
        for p, pid in sorted(live):
            print(f"  \033[38;2;137;180;250m\u25cf\033[0m http://127.0.0.1:{p}  (pid {pid})")
        print(f"\n\033[38;2;88;91;112mUse --add to open files in an existing instance,")
        print(f"or --max-instances N to raise the limit.\033[0m")
        sys.exit(1)

    _clear_pyc()
    _kill_zombie_on_port(port)

    PreviewHandler.default_author = default_author
    for fp in files:
        if os.path.isfile(fp):
            PreviewHandler.add_tab(fp)
        else:
            print(f"Warning: {fp} not found, skipping")

    for fp in recovered:
        PreviewHandler.add_tab(fp)
    if recovered:
        print(f"\033[38;2;166;227;161m✓\033[0m Restored {len(recovered)} tab(s) from previous session")

    if not PreviewHandler._tabs and not ws_path:
        print("Error: no valid files to open")
        sys.exit(1)

    server = start(port)
    _register_instance(port, server)

    # Persist the tab session for crash recovery; updated on every add/close/rename
    import dabarat.server as _srv
    _srv._on_tabs_changed = lambda: _save_tab_state(port)
    _save_tab_state(port)

    if PreviewHandler._tabs:
        filenames = [os.path.basename(t["filepath"]) for t in PreviewHandler._tabs.values()]
        print(f"\033[38;2;137;180;250m\U0001f4c4 {', '.join(filenames)}\033[0m")
    elif ws_path:
        ws_name = ws_data.get("name", os.path.basename(ws_path))
        n_folders = len(ws_data.get("folders", []))
        n_files = len(ws_data.get("files", []))
        print(f"\033[38;2;137;180;250m\U0001f4c1 {ws_name} ({n_folders} folders, {n_files} files)\033[0m")
    print(f"\033[38;2;166;227;161m\U0001f310 http://127.0.0.1:{port}\033[0m")
    inst_count = len(_live_instances())
    features = "Live reload \u00b7 Catppuccin \u00b7 Tabs \u00b7 Annotations"
    if ws_path:
        features += " \u00b7 Workspace"
    print(f"\033[38;2;88;91;112m\u26a1 {features} \u00b7 Instance {inst_count}/{max_inst}\033[0m")
    print("\nCtrl+C to stop")

    # Launch in Chrome --app mode
    url = f"http://127.0.0.1:{port}"
    chrome = _find_chrome()
    if chrome:
        subprocess.Popen(
            [chrome, f"--app={url}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\033[38;2;88;91;112mStopped.\033[0m")
        server.server_close()


def main():
    if "--annotate" in sys.argv:
        cmd_annotate(sys.argv)
        sys.exit(0)

    if "--add" in sys.argv:
        cmd_add(sys.argv)
        sys.exit(0)

    if "--export-pdf" in sys.argv:
        cmd_export_pdf(sys.argv)
        sys.exit(0)

    if len(sys.argv) < 2:
        print("Usage:")
        print("  dabarat <file.md> [file2.md ...] [--port PORT] [--author NAME]")
        print("  dabarat --workspace <path.dabarat-workspace> [--port PORT]")
        print("  dabarat --add <file.md> [--port PORT]")
        print("  dabarat --export-pdf <file.md> [-o output.pdf] [--theme mocha]")
        print('  dabarat --annotate <file.md> --text "..." --comment "..." [--author NAME]')
        print(f"  --max-instances N  (default {MAX_INSTANCES})")
        sys.exit(1)

    cmd_serve(sys.argv)


if __name__ == "__main__":
    main()
