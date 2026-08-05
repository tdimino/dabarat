#!/usr/bin/env python3
"""Phase 11 verification — home/history surfacing (V1-V7).

Guards the global activity feed and its home-page wiring: the
/api/versions/recent endpoint (cross-file, newest-first, limit-clamped),
headVersion metadata on recent entries, and the source-level contracts the
client relies on — the home-mode toggle hide rule, the Activity button,
and the version-counter deep link.

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

    print("Phase 11 — home/history surfacing V1-V7")

    try:
        with tempfile.TemporaryDirectory(prefix="dabarat-p11-") as work_name:
            work = Path(work_name)
            doc_a = work / "alpha.md"
            doc_b = work / "beta.md"
            doc_a.write_text("# Alpha\n\nfirst\n", encoding="utf-8")
            doc_b.write_text("# Beta\n\nsecond\n", encoding="utf-8")

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
                [sys.executable, "-u", "-c", launch_code, str(doc_a), str(doc_b),
                 "--port", str(server_port), "--max-instances", "99"],
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            base = f"http://127.0.0.1:{server_port}"
            wait_http(base + "/api/tabs")
            _, tabs = http_json(base + "/api/tabs")
            tab_a = next(t["id"] for t in tabs if t["filepath"] == str(doc_a))
            tab_b = next(t["id"] for t in tabs if t["filepath"] == str(doc_b))

            def save(tab_id, content):
                return http_json(base + "/api/save",
                                 {"tab": tab_id, "content": content})

            def recent_versions(query=""):
                _, data = http_json(base + "/api/versions/recent" + query)
                return data["versions"]

            # Interleaved saves across both files
            save(tab_a, "# Alpha\n\nfirst edit\n")
            time.sleep(0.02)
            save(tab_b, "# Beta\n\nsecond edit\n")
            time.sleep(0.02)
            save(tab_a, "# Alpha\n\nthird edit\n")

            # V1: global feed spans both files
            feed = recent_versions()
            paths = {v["path"] for v in feed}
            report({str(doc_a), str(doc_b)} <= paths,
                   "V1 activity feed spans multiple files",
                   f"got {len(feed)} versions across {len(paths)} files")

            # V2: newest-first ordering with full row shape
            dates = [v["date"] for v in feed]
            shape_ok = all(
                {"hash", "path", "name", "date", "added", "removed",
                 "label", "pinned", "source"} <= set(v) for v in feed)
            report(dates == sorted(dates, reverse=True) and shape_ok,
                   "V2 newest-first ordering with path/name/source fields")

            # V3: newest entry is the last save
            report(feed and feed[0]["path"] == str(doc_a)
                   and feed[0]["source"] in ("save", "external"),
                   "V3 head of feed is the most recent save",
                   f"head={feed[0]['name']} ({feed[0]['source']})" if feed else "empty")

            # V4: limit respected and clamped
            limited = recent_versions("?limit=2")
            oversized = recent_versions("?limit=9999")
            report(len(limited) == 2 and len(oversized) <= 50,
                   "V4 limit parameter respected and clamped",
                   f"limit=2 → {len(limited)}, limit=9999 → {len(oversized)}")

            # V5: identical save dedups — feed does not grow. before > 0
            # guards the vacuous 0 == 0 pass on a broken feed
            before = len(recent_versions())
            save(tab_a, "# Alpha\n\nthird edit\n")
            after = len(recent_versions())
            report(before > 0 and after == before,
                   "V5 identical consecutive save does not grow the feed",
                   f"{before} → {after}")

            # V6: recent entries carry headVersion matching per-file head
            http_json(base + "/api/add", {"filepath": str(doc_a)})
            _, recent_data = http_json(base + "/api/recent")
            entry = next((e for e in recent_data.get("entries", [])
                          if e["path"] == str(doc_a)), None)
            _, per_file = http_json(f"{base}/api/versions?tab={tab_a}")
            # head must exist — None == None would let two broken systems agree
            head = per_file["versions"][0]["hash"] if per_file["versions"] else None
            report(head is not None and entry is not None
                   and entry.get("headVersion") == head,
                   "V6 recent entry headVersion matches per-file head",
                   f"headVersion={entry.get('headVersion') if entry else None}")
    except Exception as exc:
        report(False, "Harness setup/runtime", str(exc))
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()

    # V7: source-level client wiring contracts
    css = (ROOT / "dabarat/static/css/history-ui.css").read_text(encoding="utf-8")
    home_js = (ROOT / "dabarat/static/js/home.js").read_text(encoding="utf-8")
    hist_js = (ROOT / "dabarat/static/js/history-ui.js").read_text(encoding="utf-8")
    tmpl = (ROOT / "dabarat/template.py").read_text(encoding="utf-8")
    wired = (
        "body.home-active #history-toggle" in css
        and 'data-action="open-activity"' in home_js
        and "openHistory" in home_js
        and "loadGlobalActivity" in hist_js
        and 'id="version-panel-title"' in tmpl
    )
    report(wired, "V7 client wiring: toggle hidden on home, Activity button, deep link")

    print(f"PASS={PASS} FAIL={FAIL}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
