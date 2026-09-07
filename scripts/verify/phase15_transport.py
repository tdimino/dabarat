#!/usr/bin/env python3
"""Phase 15 verification — transport layer (V1-V9).

Guards the HTTP/1.1 keep-alive contract introduced with the 2026-09-06
optimization pass: every body path carries Content-Length, the origin
check runs before the POST body is read and a rejection closes the
socket (an unread body would otherwise poison the next request on a
reused connection), JSON and the shell gzip above 1400 B,
/api/content?since= short-circuits to {unchanged:true}, the shell
carries a weak ETag and answers 304, a hidden window slows its poll,
and /api/shutdown exits promptly with idle keep-alive sockets open.

Private INSTANCE_DIR + history/recent stores (phase12 launch_code); the
user's real ~/.dabarat state is never touched. Requires Chrome for V6.
"""

from __future__ import annotations

import gzip
import http.client
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
for p in (str(ROOT), str(HERE)):
    if p not in sys.path:
        sys.path.insert(0, p)

from dabarat import pdf_export                                    # noqa: E402
from phase12_instances_tabs import (                              # noqa: E402
    Browser, http_json, launch_code, report, wait_http)
import phase12_instances_tabs as p12                              # noqa: E402


def raw_get(conn: http.client.HTTPConnection, path: str, headers=None):
    conn.request("GET", path, headers=headers or {})
    r = conn.getresponse()
    body = r.read()
    return r, body


def main() -> int:
    server = None
    chrome = None
    try:
        port = pdf_export._find_free_port()
        debug_port = pdf_export._find_free_port()
        chrome_path = pdf_export._find_chrome()
    except Exception as exc:
        report(False, "Harness setup/runtime", str(exc))
        print(f"PASS={p12.PASS} FAIL={p12.FAIL}")
        return 1

    print("Phase 15 — transport V1-V9")

    try:
        with tempfile.TemporaryDirectory(
                prefix="dabarat-p15-", ignore_cleanup_errors=True) as work_name:
            work = Path(work_name)
            inst_dir = work / "instances"
            doc = work / "alpha.md"
            doc.write_text("# Alpha\n\nbody of alpha\n" * 200, encoding="utf-8")
            doc2 = work / "beta.md"
            doc2.write_text("# Beta\n\nbody of beta\n", encoding="utf-8")

            server = subprocess.Popen(
                [sys.executable, "-u", "-c", launch_code(work, inst_dir, None),
                 str(doc), str(doc2), "--port", str(port), "--max-instances", "99"],
                cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            base = f"http://127.0.0.1:{port}"
            wait_http(base + "/api/tabs")
            _, tab_list = http_json(base + "/api/tabs")
            tab_id = next(t["id"] for t in tab_list if t["filepath"] == str(doc))

            # V1: keep-alive — two GETs on one connection, HTTP/1.1, no close
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            r1, _ = raw_get(conn, "/api/tabs")
            r2, _ = raw_get(conn, "/api/tabs")
            report(
                r1.version == 11 and r2.version == 11
                and (r1.getheader("Connection") or "").lower() != "close"
                and r1.status == 200 and r2.status == 200,
                "V1 keep-alive: two GETs on one socket, HTTP/1.1, no Connection: close",
                f"version={r1.version} connection={r1.getheader('Connection')!r}")

            # V2: Content-Length == len(body) on every body path
            checks = []
            for path in ("/", "/api/tabs", f"/api/content?tab=nope",
                         "/some/missing/path.md"):
                r, body = raw_get(conn, path, {"Accept-Encoding": "identity"})
                checks.append((path, r.status, r.getheader("Content-Length"), len(body)))
            conn.request("POST", "/api/add", body=json.dumps({"filepath": "x"}),
                         headers={"Content-Type": "application/json",
                                  "Origin": "http://evil.example"})
            r = conn.getresponse()
            body = r.read()
            checks.append(("POST foreign origin", r.status,
                           r.getheader("Content-Length"), len(body)))
            ok = all(cl is not None and int(cl) == n for _, _, cl, n in checks)
            report(ok, "V2 Content-Length matches body on shell, JSON, 404, 403, shell fallback",
                   "; ".join(f"{p}:{s}:{cl}/{n}" for p, s, cl, n in checks))

            # V3: origin check runs BEFORE the body is read; the 403 closes
            # the socket (an unread body can't poison a reused connection,
            # and a foreign page can't make the thread buffer its payload)
            report(r.status == 403 and (r.getheader("Connection") or "").lower() == "close",
                   "V3a foreign-Origin POST answers 403 + Connection: close (body unread)",
                   f"status={r.status} connection={r.getheader('Connection')}")
            r3, body3 = raw_get(conn, "/api/tabs")   # http.client reconnects
            report(r3.status == 200 and json.loads(body3),
                   "V3b a following request on a fresh socket is clean",
                   f"status={r3.status}")
            # V3c: over-cap Content-Length with a valid origin → 413 without
            # reading (headers only are sent; a draining server would hang
            # for the 30 s idle timeout waiting for 20 MB that never comes)
            t0 = time.perf_counter()
            conn.putrequest("POST", "/api/add")
            conn.putheader("Origin", base)
            conn.putheader("Content-Type", "application/json")
            conn.putheader("Content-Length", str(20 * 1024 * 1024))
            conn.endheaders()
            r4 = conn.getresponse(); r4.read()
            dt = time.perf_counter() - t0
            report(r4.status == 413 and dt < 2.0
                   and (r4.getheader("Connection") or "").lower() == "close",
                   "V3c 20 MB Content-Length → 413 + close in <2 s, body never read",
                   f"status={r4.status} in {dt:.2f}s")
            # V3d: negative Content-Length → 400 + close (never rfile.read(-1))
            t0 = time.perf_counter()
            conn.putrequest("POST", "/api/add")
            conn.putheader("Origin", base)
            conn.putheader("Content-Length", "-1")
            conn.endheaders()
            r5 = conn.getresponse(); r5.read()
            dt = time.perf_counter() - t0
            report(r5.status == 400 and dt < 2.0,
                   "V3d negative Content-Length → 400 + close in <2 s",
                   f"status={r5.status} in {dt:.2f}s")
            # V3e/V3f: non-numeric length and chunked encoding are both
            # refused up front (400 + close) — never a blocking read
            outcomes = []
            for hdrs in ({"Content-Length": "abc"},
                         {"Transfer-Encoding": "chunked"}):
                t0 = time.perf_counter()
                conn.putrequest("POST", "/api/add")
                conn.putheader("Origin", base)
                for k, v in hdrs.items():
                    conn.putheader(k, v)
                conn.endheaders()
                r6 = conn.getresponse(); r6.read()
                outcomes.append((r6.status, (r6.getheader("Connection") or "").lower(),
                                 time.perf_counter() - t0))
            report(all(st == 400 and c == "close" and dt < 2.0 for st, c, dt in outcomes),
                   "V3e/f non-numeric Content-Length and Transfer-Encoding → 400 + close",
                   "; ".join(f"{st}/{c}/{dt:.2f}s" for st, c, dt in outcomes))

            # V4: gzip — shell compressed, decompressed == identity, small JSON not
            r_id, body_id = raw_get(conn, "/", {"Accept-Encoding": "identity"})
            r_gz, body_gz = raw_get(conn, "/", {"Accept-Encoding": "gzip"})
            r_small, body_small = raw_get(conn, "/api/tabs", {"Accept-Encoding": "gzip"})
            report(
                r_gz.getheader("Content-Encoding") == "gzip"
                and "Accept-Encoding" in (r_gz.getheader("Vary") or "")
                and gzip.decompress(body_gz) == body_id
                and int(r_gz.getheader("Content-Length")) == len(body_gz)
                and r_small.getheader("Content-Encoding") is None,
                "V4 gzip on the shell (deterministic, Vary set), small JSON stays identity",
                f"shell {len(body_id)} → {len(body_gz)} B; /api/tabs {len(body_small)} B")

            # V5: conditional /api/content?since=
            _, full = http_json(f"{base}/api/content?tab={tab_id}")
            key = full["changeKey"]
            _, cond = http_json(f"{base}/api/content?tab={tab_id}&since={key}")
            report(cond.get("unchanged") is True and "content" not in cond
                   and cond.get("changeKey") == key,
                   "V5a since=<current key> → {unchanged:true}, no content",
                   json.dumps(cond))
            time.sleep(0.02)
            doc.write_text("# Alpha rewritten\n\nnew body\n", encoding="utf-8")
            _, after = http_json(f"{base}/api/content?tab={tab_id}&since={key}")
            report(not after.get("unchanged") and after.get("content", "").startswith("# Alpha rewritten")
                   and after.get("changeKey") != key,
                   "V5b rewrite → full body and a new changeKey",
                   f"key {key} → {after.get('changeKey')}")
            key2 = after["changeKey"]
            doc.unlink()
            _, missing = http_json(f"{base}/api/content?tab={tab_id}&since={key2}")
            report(missing.get("unchanged") is True and missing.get("fileMissing") is True,
                   "V5c deleted file: fileMissing rides along with unchanged",
                   json.dumps(missing))
            doc.write_text("# Alpha back\n\nrestored\n", encoding="utf-8")

            # V7: ETag / 304 on the shell, identity and gzip
            etag = r_id.getheader("ETag")
            r304, b304 = raw_get(conn, "/", {"If-None-Match": etag,
                                            "Accept-Encoding": "identity"})
            r304g, b304g = raw_get(conn, "/", {"If-None-Match": etag,
                                              "Accept-Encoding": "gzip"})
            r_after, _ = raw_get(conn, "/api/tabs")
            report(
                bool(etag) and etag.startswith('W/"')
                and r304.status == 304 and b304 == b""
                and r304g.status == 304 and b304g == b""
                and r304.getheader("ETag") == etag
                and r_after.status == 200,
                "V7 weak ETag → 304 with empty body (identity + gzip), socket still usable",
                f"etag={etag}")
            conn.close()

            # V6: hidden gating in the real page (CDP)
            if chrome_path:
                chrome = subprocess.Popen(
                    [chrome_path, "--headless=new",
                     f"--remote-debugging-port={debug_port}",
                     f"--user-data-dir={work / 'chrome-profile'}",
                     "--disable-gpu", "--no-first-run",
                     "--no-default-browser-check", "--disable-extensions",
                     "--window-size=1200,800", base],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                browser = Browser(debug_port)
                browser.wait(
                    "document.readyState === 'complete' && "
                    "typeof poll === 'function' && "
                    "typeof tabs !== 'undefined' && Object.keys(tabs).length >= 2",
                    timeout=30.0)
                # Count content fetches while "hidden" for 2 s, then unhide
                # and time the first fetch. document.hidden is simulated
                # in-page — CDP emulation does not survive the one-command
                # WebSocket sessions pdf_export uses.
                result = browser.evaluate(
                    "(async () => {"
                    "  window.__fetches = [];"
                    "  const orig = window.fetch;"
                    "  window.fetch = function(u, o) {"
                    "    if (String(u).startsWith('/api/content')) window.__fetches.push(Date.now());"
                    "    return orig.apply(this, arguments);"
                    "  };"
                    "  let hidden = true;"
                    "  Object.defineProperty(document, 'hidden', {get: () => hidden, configurable: true});"
                    "  document.dispatchEvent(new Event('visibilitychange'));"
                    "  await new Promise(r => setTimeout(r, 800));"   # let an in-flight tick land
                    "  const start = window.__fetches.length;"
                    "  await new Promise(r => setTimeout(r, 2000));"
                    "  const hiddenFetches = window.__fetches.length - start;"
                    "  hidden = false;"
                    "  const t0 = Date.now();"
                    "  document.dispatchEvent(new Event('visibilitychange'));"
                    "  await new Promise(r => setTimeout(r, 400));"
                    "  const first = window.__fetches.slice(start + hiddenFetches)[0];"
                    "  return {hiddenFetches, resumeMs: first ? first - t0 : null};"
                    "})()")
                report(
                    isinstance(result, dict) and result.get("hiddenFetches", 99) <= 1
                    and result.get("resumeMs") is not None and result["resumeMs"] <= 300,
                    "V6 hidden window: ≤1 content fetch in 2 s, immediate poll on unhide",
                    json.dumps(result))
                # Sanity: the page polls with since= and gets unchanged replies
                since_used = browser.evaluate(
                    "(async () => {"
                    "  await new Promise(r => setTimeout(r, 1200));"
                    "  const res = await fetch(_contentUrl(activeTabId));"
                    "  const d = await res.json();"
                    "  return {url: _contentUrl(activeTabId).includes('since='), unchanged: d.unchanged === true};"
                    "})()")
                report(isinstance(since_used, dict) and since_used.get("url") and since_used.get("unchanged"),
                       "V6b live page polls with since= and receives {unchanged:true}",
                       json.dumps(since_used))
            else:
                report(False, "V6 hidden gating (Chrome)", "Chrome/Chromium not found")

            # V9: source guard — wfile.write only in _send_bytes + the two static handlers
            src = (ROOT / "dabarat" / "server.py").read_text(encoding="utf-8")
            writes = len(re.findall(r"self\.wfile\.write\(", src))
            report(writes == 3, "V9 source guard: three wfile.write sites (helper + 2 static)",
                   f"found {writes}")

            # V8: shutdown with two idle keep-alive connections parked
            idle_a = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            idle_b = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            raw_get(idle_a, "/api/tabs")
            raw_get(idle_b, "/api/tabs")
            status, data = http_json(base + "/api/shutdown", {})
            t0 = time.monotonic()
            try:
                server.wait(timeout=3)
                exited = True
            except subprocess.TimeoutExpired:
                exited = False
            elapsed = time.monotonic() - t0
            report(status == 200 and data.get("ok") and exited and elapsed < 2.0,
                   "V8 /api/shutdown exits within 2 s with idle keep-alive sockets open",
                   f"status={status} exited={exited} in {elapsed:.2f}s")
            idle_a.close()
            idle_b.close()
    except Exception as exc:
        report(False, "Harness setup/runtime", repr(exc))
    finally:
        if chrome is not None:
            chrome.terminate()
            try:
                chrome.wait(timeout=5)
            except subprocess.TimeoutExpired:
                chrome.kill()
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
