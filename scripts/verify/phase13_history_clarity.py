#!/usr/bin/env python3
"""Phase 13 verification — version-history clarity (V1-V6).

Guards the /api/version/summary excerpt contract (predecessor diff,
empty-predecessor first version, truncation, error codes) and the
source-level panel-identity wiring the client relies on — the filename
slot, mode icons, and the retry-safe excerpt cache.

Stdlib only; no browser. The server subprocess gets a private DB so the
user's real ~/.dabarat/versions.db is never touched.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import urllib.error
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


def http_json(url: str, payload=None, timeout: float = 10.0):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        headers["Origin"] = url.split("/api/")[0]
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def wait_http(url: str, timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            http_json(url, timeout=1.0)
            return
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            time.sleep(0.1)
    raise RuntimeError(f"server did not become ready: {url}")


def main() -> int:
    server = None
    try:
        server_port = pdf_export._find_free_port()
    except Exception as exc:
        report(False, "Harness setup/runtime", str(exc))
        print(f"PASS={PASS} FAIL={FAIL}")
        return 1

    print("Phase 13 — version-history clarity V1-V6")

    try:
        with tempfile.TemporaryDirectory(prefix="dabarat-p13-") as work_name:
            work = Path(work_name)
            doc = work / "chronicle.md"
            v1_body = "# Chronicle\n\nline one\nline two\nline three\n"
            doc.write_text(v1_body, encoding="utf-8")

            launch_code = (
                "import sys, webbrowser\n"
                "import dabarat.history as h\n"
                f"h.HISTORY_DIR = {str(work / 'history')!r}\n"
                f"h.DB_PATH = {str(work / 'versions.db')!r}\n"
                "import dabarat.recent as r\n"
                f"r.RECENT_FILE = {str(work / 'recent.json')!r}\n"
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
                cwd=ROOT, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True)
            base = f"http://127.0.0.1:{server_port}"
            wait_http(base + "/api/tabs")
            _, tabs = http_json(base + "/api/tabs")
            tab = tabs[0]["id"]

            def save(content):
                return http_json(base + "/api/save",
                                 {"tab": tab, "content": content})

            def versions():
                _, data = http_json(f"{base}/api/versions?tab={tab}")
                return data["versions"]  # newest first

            def summary(ref):
                return http_json(
                    f"{base}/api/version/summary?tab={tab}&hash={ref}")

            save(v1_body)                                       # v1
            time.sleep(0.02)
            save("# Chronicle\n\nline one\nline 2\nline three\n")  # v2
            time.sleep(0.02)
            save("A\nB\nC\nD\nE\n")                             # v3: all changed

            refs = [v["hash"] for v in versions()]              # [v3, v2, v1]
            v3_ref, v2_ref, v1_ref = refs[0], refs[1], refs[2]

            # V1: v2 vs v1 — the single changed line, prefixed, untruncated
            status, data = summary(v2_ref)
            lines = data.get("lines", [])
            report(status == 200
                   and "-line two" in lines and "+line 2" in lines
                   and any(l.startswith(" ") for l in lines)
                   and data.get("truncated") is False,
                   "V1 excerpt diffs a version against its predecessor",
                   f"{len(lines)} lines")

            # V2: first version diffs against empty — all additions
            status, data = summary(v1_ref)
            lines = data.get("lines", [])
            report(status == 200 and lines
                   and all(l.startswith("+") for l in lines)
                   and "+# Chronicle" in lines,
                   "V2 first version diffs against empty",
                   f"{len(lines)} added, truncated={data.get('truncated')}")

            # V3: rewrite beyond max_changed → truncated excerpt
            status, data = summary(v3_ref)
            changed = [l for l in data.get("lines", [])
                       if l.startswith(("+", "-"))]
            report(status == 200 and data.get("truncated") is True
                   and 0 < len(changed) <= 2,
                   "V3 excerpt truncates past the changed-line cap",
                   f"{len(changed)} changed lines shown")

            # V4: error contract — malformed ref 400, missing version 404
            s_bad, _ = summary("not-a-ref")
            s_missing, _ = summary("999999")
            s_notab, _ = http_json(
                f"{base}/api/version/summary?tab=nope&hash={v1_ref}")
            report(s_bad == 400 and s_missing == 404 and s_notab == 404,
                   "V4 summary error codes: 400 malformed, 404 missing",
                   f"bad={s_bad}, missing={s_missing}, badTab={s_notab}")
    except Exception as exc:
        report(False, "Harness setup/runtime", str(exc))
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()

    # V5: panel-identity wiring — filename slot, mode icons, dir suffix
    tmpl = (ROOT / "dabarat/template.py").read_text(encoding="utf-8")
    hist_js = (ROOT / "dabarat/static/js/history-ui.js").read_text(
        encoding="utf-8")
    hist_css = (ROOT / "dabarat/static/css/history-ui.css").read_text(
        encoding="utf-8")
    report('id="version-panel-filename"' in tmpl
           and 'id="version-panel-icon"' in tmpl
           and "ph-pulse" in hist_js and "ph-clock-counter-clockwise" in hist_js
           and "version-file-dir" in hist_js
           and "#version-panel-filename:empty" in hist_css,
           "V5 panel identity: filename slot, mode icons, dir suffix")

    # V6: excerpt cache is retry-safe — loading sentinel, success-only
    # cache, detached-DOM guard, and the labeled float toggles
    report("'loading'" in hist_js and "delete v._excerpt" in hist_js
           and "entry.isConnected" in hist_js
           and "version-excerpt-toggle" in hist_js
           and tmpl.count("float-btn-label") >= 4,
           "V6 retry-safe excerpt cache + labeled float toggles")

    print(f"PASS={PASS} FAIL={FAIL}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
