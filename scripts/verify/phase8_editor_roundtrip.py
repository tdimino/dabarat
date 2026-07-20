#!/usr/bin/env python3
"""Phase 8 verification — WYSIWYG round-trip preserves links and images (V1-V9).

Regression guard for the Tiptap schema-miss bug: without the Link/Image
extensions registered, tiptap-markdown silently drops link marks and image
nodes on parse, so an edit+save destroys them on disk. Requires network on
first run (Tiptap loads from esm.sh).

Uses only stdlib plus dabarat's in-repository CDP/WebSocket primitives.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dabarat import pdf_export


PASS = 0
FAIL = 0


def report(ok: bool, name: str, detail: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✓ {name}" + (f" — {detail}" if detail else ""))
    else:
        FAIL += 1
        print(f"  ✗ {name}" + (f" — {detail}" if detail else ""))


def http_json(url: str, timeout: float = 3.0):
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read())


def wait_http(url: str, timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            http_json(url, timeout=1.0)
            return
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            time.sleep(0.1)
    raise RuntimeError(f"server did not become ready: {url}")


class Browser:
    def __init__(self, debug_port: int):
        self.debug_port = debug_port

    def command(self, method: str, params=None):
        return pdf_export._cdp_request(self.debug_port, method, params or {})

    def evaluate(self, expression: str):
        result = self.command(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": True,
                "userGesture": True,
            },
        )
        if result.get("exceptionDetails"):
            details = result["exceptionDetails"]
            description = details.get("exception", {}).get("description") or details.get("text")
            raise RuntimeError(f"JavaScript exception: {description}")
        return result.get("result", {}).get("value")

    def wait(self, expression: str, timeout: float = 10.0, interval: float = 0.08):
        deadline = time.monotonic() + timeout
        last_error = None
        while time.monotonic() < deadline:
            try:
                value = self.evaluate(expression)
                if value:
                    return value
            except Exception as exc:
                last_error = exc
            time.sleep(interval)
        suffix = f"; last error: {last_error}" if last_error else ""
        raise RuntimeError(f"browser condition timed out: {expression}{suffix}")


FIXTURE = """---
title: Round-Trip Fixture
variables:
  - name: traveler
    type: string
---

# Bibliography Round-Trip

- Astour, M. C. (1965). *Hellenosemitica*. [JSTOR](https://www.jstor.org/stable/599001)
- Gordon, C. H. (1966). *Evidence for the Minoan Language*. [academia.edu](https://www.academia.edu/example)
- Owens, G. A. (1998). "Late Minoan II Knossos." [Talanta](https://talanta.nl/xxx-2)

Autolink: <https://example.com/auto>

![Semitic Family Tree](assets/tree.png)

A footnote reference[^1] survives the editor.

[^1]: Footnote body text.
"""


def main() -> int:
    server = None
    chrome = None
    try:
        server_port = pdf_export._find_free_port()
        debug_port = pdf_export._find_free_port()
        chrome_path = pdf_export._find_chrome()
    except Exception as exc:
        report(False, "Harness setup/runtime", str(exc))
        print(f"PASS={PASS} FAIL={FAIL}")
        return 1

    if not chrome_path:
        report(False, "Chrome availability", "Chrome/Chromium not found")
        print(f"PASS={PASS} FAIL={FAIL}")
        return 1

    print("Phase 8 — WYSIWYG round-trip V1-V9")

    try:
        with tempfile.TemporaryDirectory(prefix="dabarat-p8-", ignore_cleanup_errors=True) as work_name:
            work = Path(work_name)
            doc = work / "roundtrip.md"
            doc.write_text(FIXTURE, encoding="utf-8")

            launch_code = (
                "import sys, webbrowser\n"
                "import dabarat.__main__ as m\n"
                "m._find_chrome = lambda: None\n"
                "m._live_instances = lambda: []\n"
                "webbrowser.open = lambda *a, **k: True\n"
                "sys.argv = ['dabarat'] + sys.argv[1:]\n"
                "m.cmd_serve(sys.argv)\n"
            )
            server = subprocess.Popen(
                [sys.executable, "-u", "-c", launch_code, str(doc),
                 "--port", str(server_port), "--max-instances", "99"],
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            base = f"http://127.0.0.1:{server_port}"
            wait_http(base + "/api/tabs")
            tab_id = http_json(base + "/api/tabs")[0]["id"]

            chrome = subprocess.Popen(
                [
                    chrome_path,
                    "--headless=new",
                    f"--remote-debugging-port={debug_port}",
                    f"--user-data-dir={work / 'chrome-profile'}",
                    "--disable-gpu",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-extensions",
                    "--window-size=1200,800",
                    f"{base}/?tab={urllib.parse.quote(tab_id)}",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            browser = Browser(debug_port)
            browser.wait("document.readyState === 'complete' && !!document.getElementById('content')", timeout=30.0)
            # Tiptap loads as an async ES module from esm.sh
            browser.wait("!!window.Tiptap && !!window.Tiptap.Editor", timeout=30.0)

            report(
                bool(browser.evaluate("!!window.Tiptap.Link && !!window.Tiptap.Image")),
                "V1 Link and Image extensions loaded on window.Tiptap",
            )

            browser.evaluate("enterEditMode()")
            browser.wait("editState.active", timeout=10.0)
            tiptap_live = browser.wait("_tiptapEditor !== null", timeout=10.0)
            report(bool(tiptap_live), "V2 Tiptap editor initialized (not textarea fallback)")

            # Make a real edit so the save path serializes the whole document
            browser.evaluate(
                "_tiptapEditor.chain().focus('end').insertContent(' EDITMARK').run()"
            )
            browser.wait("editState.dirty", timeout=5.0)

            # Insert a NEW link through the toolbar command (prompt stubbed)
            browser.evaluate(
                "(() => {"
                "window.prompt = () => 'https://minoanmystery.org/new';"
                "_tiptapEditor.chain().focus('end').insertContent(' NEWLINK').run();"
                "const end = _tiptapEditor.state.selection.to;"
                "_tiptapEditor.chain().setTextSelection({ from: end - 7, to: end }).run();"
                "_CMD_MAP.link(_tiptapEditor);"
                "return true;"
                "})()"
            )

            browser.evaluate("saveEdit()")
            browser.wait("!editState.dirty", timeout=10.0)

            saved = doc.read_text(encoding="utf-8")

            report("](https://www.jstor.org/stable/599001)" in saved,
                   "V3 markdown link survives edit+save (JSTOR)")
            report("](https://www.academia.edu/example)" in saved
                   and "](https://talanta.nl/xxx-2)" in saved,
                   "V4 remaining bibliography links survive")
            autolink_ok = bool(re.search(
                r"<https://example\.com/auto>|\]\(https://example\.com/auto\)", saved))
            report(autolink_ok, "V5 autolink survives as a link construct")
            report(re.search(r"!\[[^\]]*\]\(assets/tree\.png\)", saved) is not None,
                   "V6 inline image survives")
            report("[^1]" in saved and "[^1]: Footnote body text." in saved,
                   "V7 footnote reference and definition survive")
            report(saved.startswith("---\ntitle: Round-Trip Fixture"),
                   "V8 frontmatter preserved")
            v9_ok = ("EDITMARK" in saved
                     and "[NEWLINK](https://minoanmystery.org/new)" in saved)
            report(v9_ok, "V9 edit landed and toolbar-inserted link serialized",
                   "" if v9_ok else f"tail={saved[-160:]!r}")
    except Exception as exc:
        report(False, "Harness setup/runtime", str(exc))
    finally:
        for proc in (chrome, server):
            if proc is not None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()

    print(f"PASS={PASS} FAIL={FAIL}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
