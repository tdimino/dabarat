#!/usr/bin/env python3
"""Phase 16 verification — annotation sidecar integrity (V1-V5).

Guards the 2026-09-06 rework of dabarat/annotations.py: per-file locking
around every read-modify-write, atomic tempfile+os.replace writes, a
sidecar that fails to parse is quarantined (not read as empty and then
overwritten) and surfaced once as `corruptBackup`, and orphan cleanup
runs after an external rewrite rather than on every poll tick.

Private stores via phase12's launch_code; the user's ~/.dabarat is never
touched. No Chrome needed.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
for p in (str(ROOT), str(HERE)):
    if p not in sys.path:
        sys.path.insert(0, p)

from dabarat import pdf_export                                    # noqa: E402
from phase12_instances_tabs import (                              # noqa: E402
    http_json, launch_code, report, wait_http)
import phase12_instances_tabs as p12                              # noqa: E402


def main() -> int:
    server = None
    try:
        port = pdf_export._find_free_port()
    except Exception as exc:
        report(False, "Harness setup/runtime", str(exc))
        print(f"PASS={p12.PASS} FAIL={p12.FAIL}")
        return 1

    print("Phase 16 — annotation sidecar integrity V1-V5")
    try:
        with tempfile.TemporaryDirectory(
                prefix="dabarat-p16-", ignore_cleanup_errors=True) as work_name:
            work = Path(work_name)
            doc = work / "alpha.md"
            body = "# Alpha\n\n" + "\n\n".join(f"passage number {i} lives here" for i in range(30)) + "\n"
            doc.write_text(body, encoding="utf-8")
            sidecar = work / "alpha.md.annotations.json"

            server = subprocess.Popen(
                [sys.executable, "-u", "-c", launch_code(work, work / "instances", None),
                 str(doc), "--port", str(port), "--max-instances", "99"],
                cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            base = f"http://127.0.0.1:{port}"
            wait_http(base + "/api/tabs")
            _, tab_list = http_json(base + "/api/tabs")
            tab_id = tab_list[0]["id"]

            # V1: 24 concurrent annotate POSTs — every one must persist
            errors = []

            def annotate(i):
                try:
                    status, data = http_json(base + "/api/annotate", {
                        "tab": tab_id,
                        "anchor": {"text": f"passage number {i} lives here", "heading": "", "offset": 0},
                        "author": {"name": "harness", "type": "ai"},
                        "body": f"note {i}", "type": "comment"})
                    if status != 200 or not data.get("ok"):
                        errors.append((i, status, data))
                except Exception as exc:
                    errors.append((i, repr(exc)))

            threads = [threading.Thread(target=annotate, args=(i,)) for i in range(24)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=30)
            _, fetched = http_json(f"{base}/api/annotations?tab={tab_id}")
            n = len(fetched.get("annotations", []))
            report(not errors and n == 24,
                   "V1 24 concurrent annotate POSTs all persist (no lost writes)",
                   f"stored={n} errors={len(errors)}")

            # V2: atomic write — no stray temp files beside the sidecar
            strays = [p.name for p in work.iterdir() if p.name.startswith(".ann-")]
            report(not strays and sidecar.exists(),
                   "V2 atomic write leaves no temp files", f"strays={strays}")

            # V3: orphan cleanup after an external rewrite (not on idle ticks)
            before_mtime = sidecar.stat().st_mtime_ns
            time.sleep(0.05)
            http_json(f"{base}/api/annotations?tab={tab_id}")
            http_json(f"{base}/api/annotations?tab={tab_id}")
            idle_mtime = sidecar.stat().st_mtime_ns
            # drop passages 0-4 from the document → those five anchors are orphans
            doc.write_text("# Alpha\n\n" + "\n\n".join(
                f"passage number {i} lives here" for i in range(5, 30)) + "\n", encoding="utf-8")
            http_json(f"{base}/api/content?tab={tab_id}")   # poll refreshes + marks dirty
            _, after = http_json(f"{base}/api/annotations?tab={tab_id}")
            n_after = len(after.get("annotations", []))
            report(idle_mtime == before_mtime and n_after == 19,
                   "V3 idle polls do not rewrite the sidecar; external edit prunes 5 orphans",
                   f"idle rewrite={idle_mtime != before_mtime} remaining={n_after}")

            # V4: corrupt sidecar → quarantined, surfaced once, then fresh
            sidecar.write_text("{ this is not json", encoding="utf-8")
            _, first = http_json(f"{base}/api/annotations?tab={tab_id}")
            _, second = http_json(f"{base}/api/annotations?tab={tab_id}")
            backups = sorted(work.glob("alpha.md.annotations.json.corrupt-*"))
            report(first.get("corruptBackup") and len(backups) == 1
                   and first.get("annotations") == []
                   and "corruptBackup" not in second,
                   "V4 unparseable sidecar quarantined as .corrupt-<ts>, reported once, read as empty",
                   f"backup={[b.name for b in backups]} first={list(first)} second={list(second)}")

            # V5: a write after quarantine starts a fresh, valid sidecar
            status, data = http_json(base + "/api/annotate", {
                "tab": tab_id,
                "anchor": {"text": "passage number 7 lives here", "heading": "", "offset": 0},
                "author": {"name": "harness", "type": "ai"},
                "body": "after quarantine", "type": "comment"})
            fresh = json.loads(sidecar.read_text(encoding="utf-8"))
            report(status == 200 and len(fresh.get("annotations", [])) == 1
                   and backups[0].read_text(encoding="utf-8").startswith("{ this"),
                   "V5 next write creates a valid sidecar; the quarantined file is untouched",
                   f"annotations={len(fresh.get('annotations', []))}")
    except Exception as exc:
        report(False, "Harness setup/runtime", repr(exc))
    finally:
        if server is not None and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()

    print(f"PASS={p12.PASS} FAIL={p12.FAIL}")
    return 0 if p12.FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
