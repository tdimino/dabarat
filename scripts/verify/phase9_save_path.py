#!/usr/bin/env python3
"""Phase 9 verification — save-path correctness for version history (V1-V8).

Guards the Phase 2 fixes: pre-save snapshot of unrecorded disk state
(external edits, forced conflict overwrites), lock-scoped commit of the
exact saved content, atomic restore, and honest backedUp reporting.

Stdlib only; no browser. The server subprocess gets a private HISTORY_DIR
so the user's real ~/.dabarat/history is never touched.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import threading
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
        # POST endpoints enforce same-origin
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

    print("Phase 9 — save-path correctness V1-V8")

    try:
        with tempfile.TemporaryDirectory(prefix="dabarat-p9-") as work_name:
            work = Path(work_name)
            doc = work / "doc.md"
            original = "# Doc\n\noriginal disk state\n"
            doc.write_text(original, encoding="utf-8")
            history_dir = work / "history"

            launch_code = (
                "import sys, webbrowser\n"
                "import dabarat.history as h\n"
                f"h.HISTORY_DIR = {str(history_dir)!r}\n"
                f"h.DB_PATH = {str(work / 'versions.db')!r}\n"
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
            _, tabs = http_json(base + "/api/tabs")
            tab_id = tabs[0]["id"]

            def versions():
                _, data = http_json(f"{base}/api/versions?tab={tab_id}")
                return data["versions"]

            def version_content(commit_hash):
                _, data = http_json(f"{base}/api/version?tab={tab_id}&hash={commit_hash}")
                return data.get("content")

            # V1: ordinary save reports backedUp and records exact content
            content_a = "# Doc\n\nsave A\n"
            status, data = http_json(f"{base}/api/save",
                                     {"tab": tab_id, "content": content_a})
            hash_a = data.get("version", "")
            report(status == 200 and data.get("ok") and data.get("backedUp") is True
                   and bool(hash_a),
                   "V1 save succeeds with backedUp=true and a version hash")
            report(version_content(hash_a) == content_a,
                   "V2 recorded version matches saved content exactly")

            # V3: the pre-first-save disk state was snapshotted before overwrite
            all_contents = [version_content(v["hash"]) for v in versions()]
            report(original in all_contents,
                   "V3 pre-save disk state captured before first overwrite")

            # V4/V5: external edit + forced overwrite — external content must
            # be versioned before it is clobbered
            stale_key = data["changeKey"]
            external = "# Doc\n\nEXTERNAL EDIT never saved via dabarat\n"
            doc.write_text(external, encoding="utf-8")
            content_c = "# Doc\n\nsave C after conflict\n"
            status, conflict = http_json(f"{base}/api/save",
                                         {"tab": tab_id, "content": content_c,
                                          "baseChangeKey": stale_key})
            report(status == 409 and conflict.get("error") == "conflict",
                   "V4 stale baseChangeKey 409s after external edit")
            status, data = http_json(f"{base}/api/save",
                                     {"tab": tab_id, "content": content_c})
            all_contents = [version_content(v["hash"]) for v in versions()]
            report(status == 200 and external in all_contents,
                   "V5 forced overwrite snapshots external content first")

            # V6: restore appends — disk matches restored version, history grows
            count_before = len(versions())
            status, data = http_json(f"{base}/api/restore",
                                     {"tab": tab_id, "hash": hash_a})
            on_disk = doc.read_text(encoding="utf-8")
            report(status == 200 and data.get("ok") and on_disk == content_a
                   and len(versions()) > count_before,
                   "V6 restore rewrites disk atomically and appends a version")

            # V7: no temp-file residue from atomic writes
            residue = list(work.glob(".dabarat-*")) + list(work.glob("*.tmp"))
            report(not residue, "V7 no temp-file residue in document directory",
                   "" if not residue else str(residue))

            # V8: concurrent saves attribute the right content to each version
            payloads = [f"# Doc\n\nconcurrent {i}\n" for i in range(4)]
            results = {}

            def do_save(i):
                _, d = http_json(f"{base}/api/save",
                                 {"tab": tab_id, "content": payloads[i]})
                results[i] = d.get("version", "")

            threads = [threading.Thread(target=do_save, args=(i,)) for i in range(4)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            # Each save's reported hash must contain that save's exact payload.
            # Concurrent identical-ordering isn't required — attribution is.
            mismatches = [i for i, h in results.items()
                          if h and version_content(h) != payloads[i]]
            report(not mismatches,
                   "V8 concurrent saves attribute correct content per version",
                   "" if not mismatches else f"mismatched: {mismatches}")
    except Exception as exc:
        report(False, "Harness setup/runtime", str(exc))
    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()

    print(f"PASS={PASS} FAIL={FAIL}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
