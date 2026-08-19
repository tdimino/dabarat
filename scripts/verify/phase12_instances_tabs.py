#!/usr/bin/env python3
"""Phase 12 verification — instance monitoring + tab management (V1-V12).

Guards the /api/instances discovery contract (self row parity, sibling
rows), the close-bulk batch semantics (one tabs.json write per batch),
the shutdown endpoints (self + server-to-server proxy), and the client
surfaces: Ctrl+Tab cycling, the overflow menu's filter and per-row close.

Both server subprocesses get a private INSTANCE_DIR (shared between them
so they discover each other) plus private history/recent stores — the
user's real ~/.dabarat state and live instances are never touched.
Requires Chrome for the CDP checks (V2-V4).
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


def wait_down(url: str, timeout: float = 5.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            http_json(url, timeout=1.0)
            time.sleep(0.15)
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            return True
    return False


class Browser:
    def __init__(self, debug_port: int):
        self.debug_port = debug_port

    def evaluate(self, expression: str):
        result = pdf_export._cdp_request(
            self.debug_port, "Runtime.evaluate",
            {"expression": expression, "returnByValue": True,
             "awaitPromise": True, "userGesture": True})
        if result.get("exceptionDetails"):
            details = result["exceptionDetails"]
            description = (details.get("exception", {}).get("description")
                           or details.get("text"))
            raise RuntimeError(f"JavaScript exception: {description}")
        return result.get("result", {}).get("value")

    def wait(self, expression: str, timeout: float = 10.0,
             interval: float = 0.08):
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


def launch_code(work: Path, inst_dir: Path, writes_log: Path | None) -> str:
    """Server bootstrap with private stores and a shared test INSTANCE_DIR.

    _INSTANCE_DIR is an import-time string copy in __main__, so both the
    instances module global and the __main__ alias must be redirected.
    _save_tab_state is looked up from module globals at call time, so the
    counting wrapper installed before cmd_serve() sees every write.
    """
    counter = ""
    if writes_log is not None:
        counter = (
            "_orig_save = m._save_tab_state\n"
            "def _counted_save(port):\n"
            f"    open({str(writes_log)!r}, 'a').write('w\\n')\n"
            "    return _orig_save(port)\n"
            "m._save_tab_state = _counted_save\n"
        )
    return (
        "import sys, webbrowser\n"
        "import dabarat.instances as inst\n"
        f"inst.INSTANCE_DIR = {str(inst_dir)!r}\n"
        "import dabarat.__main__ as m\n"
        f"m._INSTANCE_DIR = {str(inst_dir)!r}\n"
        "import dabarat.history as h\n"
        f"h.HISTORY_DIR = {str(work / 'history')!r}\n"
        f"h.DB_PATH = {str(work / 'versions.db')!r}\n"
        "import dabarat.recent as r\n"
        f"r.RECENT_FILE = {str(work / 'recent.json')!r}\n"
        + counter +
        "m._find_chrome = lambda: None\n"
        # The reuse dialog must never fire in a harness (phase7/8/11 rule);
        # /api/instances uses inst.discover_instances, which stays live
        "m._live_instances = lambda: []\n"
        "webbrowser.open = lambda *a, **k: True\n"
        "sys.argv = ['dabarat'] + sys.argv[1:]\n"
        "m.cmd_serve(sys.argv)\n"
    )


def main() -> int:
    server_a = None
    server_b = None
    chrome = None
    try:
        port_a = pdf_export._find_free_port()
        port_b = pdf_export._find_free_port()
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

    print("Phase 12 — instance monitoring + tab management V1-V12")

    try:
        with tempfile.TemporaryDirectory(
                prefix="dabarat-p12-", ignore_cleanup_errors=True) as work_name:
            work = Path(work_name)
            inst_dir = work / "instances"
            writes_log = work / "writes.log"
            docs = {}
            for name in ("alpha", "beta", "gamma", "delta"):
                doc = work / f"{name}.md"
                doc.write_text(f"# {name.title()}\n\nbody of {name}\n",
                               encoding="utf-8")
                docs[name] = doc

            server_a = subprocess.Popen(
                [sys.executable, "-u", "-c",
                 launch_code(work, inst_dir, writes_log),
                 *(str(docs[n]) for n in ("alpha", "beta", "gamma", "delta")),
                 "--port", str(port_a), "--max-instances", "99"],
                cwd=ROOT, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True)
            base_a = f"http://127.0.0.1:{port_a}"
            wait_http(base_a + "/api/tabs")
            _, tab_list = http_json(base_a + "/api/tabs")

            # V1: /api/instances shape — self row with in-memory tab parity
            _, inst = http_json(base_a + "/api/instances")
            rows = inst.get("instances", [])
            self_rows = [r for r in rows if r.get("isSelf")]
            self_paths = ({t["filepath"] for t in self_rows[0]["tabs"]}
                          if self_rows else set())
            report(
                len(rows) == 1 and len(self_rows) == 1
                and self_rows[0]["port"] == port_a
                and self_paths == {t["filepath"] for t in tab_list}
                and isinstance(inst.get("maxInstances"), int),
                "V1 /api/instances self row: port, isSelf, tab parity",
                f"{len(rows)} row(s), {len(self_paths)} tabs")

            # ── CDP checks against server A ──
            chrome = subprocess.Popen(
                [chrome_path, "--headless=new",
                 f"--remote-debugging-port={debug_port}",
                 f"--user-data-dir={work / 'chrome-profile'}",
                 "--disable-gpu", "--no-first-run",
                 "--no-default-browser-check", "--disable-extensions",
                 "--window-size=1200,800", base_a],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            browser = Browser(debug_port)
            browser.wait(
                "document.readyState === 'complete' && "
                "typeof tabs !== 'undefined' && Object.keys(tabs).length >= 4",
                timeout=30.0)

            # V2: Ctrl+Tab cycles forward, Ctrl+Shift+Tab cycles back
            cycled = browser.evaluate(
                "(() => {"
                "  const before = activeTabId;"
                "  const ids = Object.keys(tabs);"
                "  const next = ids[(ids.indexOf(before) + 1) % ids.length];"
                "  document.dispatchEvent(new KeyboardEvent('keydown',"
                "    {key: 'Tab', ctrlKey: true, bubbles: true}));"
                "  const forward = activeTabId === next;"
                "  document.dispatchEvent(new KeyboardEvent('keydown',"
                "    {key: 'Tab', ctrlKey: true, shiftKey: true, bubbles: true}));"
                "  return {forward, back: activeTabId === before};"
                "})()")
            report(bool(cycled and cycled.get("forward") and cycled.get("back")),
                   "V2 Ctrl+Tab / Ctrl+Shift+Tab cycling", str(cycled))

            # V3: overflow menu filter narrows rows by filename
            filtered = browser.evaluate(
                "(() => {"
                "  showTabOverflowMenu(document.body);"
                "  const menu = document.querySelector('.tab-overflow-menu');"
                "  const rowCount = () => menu.querySelectorAll("
                "    '.tab-overflow-list .tab-context-item').length;"
                "  const all = rowCount();"
                "  const f = menu.querySelector('.tab-overflow-filter');"
                "  f.value = 'beta';"
                "  f.dispatchEvent(new Event('input'));"
                "  const narrowed = rowCount();"
                "  const count = menu.querySelector('.tab-overflow-count')"
                "    .textContent;"
                "  return {all, narrowed, count};"
                "})()")
            report(bool(filtered and filtered.get("all") == 4
                        and filtered.get("narrowed") == 1
                        and filtered.get("count") == "4 tabs"),
                   "V3 overflow filter narrows 4 rows to the match",
                   str(filtered))

            # V4: per-row close × removes the tab server-side, list re-renders
            browser.evaluate(
                "(() => {"
                "  const menu = document.querySelector('.tab-overflow-menu');"
                "  const f = menu.querySelector('.tab-overflow-filter');"
                "  f.value = ''; f.dispatchEvent(new Event('input'));"
                "  const row = [...menu.querySelectorAll('.tab-context-item')]"
                "    .find(r => r.textContent.includes('delta.md'));"
                "  row.querySelector('[data-action=\"close\"]').click();"
                "})()")
            deadline = time.monotonic() + 8
            remaining = None
            while time.monotonic() < deadline:
                _, remaining = http_json(base_a + "/api/tabs")
                if len(remaining) == 3:
                    break
                time.sleep(0.15)
            rows_left = browser.evaluate(
                "document.querySelectorAll('.tab-overflow-menu"
                " .tab-context-item').length")
            report(len(remaining) == 3
                   and all(t["filename"] != "delta.md" for t in remaining)
                   and rows_left == 3,
                   "V4 overflow per-row close removes the tab",
                   f"server tabs={len(remaining)}, menu rows={rows_left}")

            chrome.terminate()
            chrome.wait(timeout=5)
            chrome = None

            # V5: close-bulk others — one tabs.json write for the whole batch
            _, tab_list = http_json(base_a + "/api/tabs")
            keep = tab_list[0]["id"]
            writes_before = len(writes_log.read_text().splitlines())
            status, data = http_json(base_a + "/api/close-bulk",
                                     {"mode": "others", "keep": [keep]})
            writes_after = len(writes_log.read_text().splitlines())
            _, remaining = http_json(base_a + "/api/tabs")
            report(status == 200 and data.get("closed") == 2
                   and len(remaining) == 1 and remaining[0]["id"] == keep
                   and writes_after - writes_before == 1,
                   "V5 close-bulk others: batch semantics, one tabs.json write",
                   f"closed={data.get('closed')}, "
                   f"writes +{writes_after - writes_before}")

            # V6: close-bulk ids closes exactly the named tabs
            for name in ("beta", "gamma"):
                http_json(base_a + "/api/add", {"filepath": str(docs[name])})
            _, tab_list = http_json(base_a + "/api/tabs")
            beta_id = next(t["id"] for t in tab_list
                           if t["filename"] == "beta.md")
            status, data = http_json(base_a + "/api/close-bulk",
                                     {"mode": "ids", "ids": [beta_id]})
            _, remaining = http_json(base_a + "/api/tabs")
            report(status == 200 and data.get("closed") == 1
                   and len(remaining) == 2
                   and all(t["id"] != beta_id for t in remaining),
                   "V6 close-bulk ids closes exactly the named tabs")

            # V7: invalid mode rejected
            status, data = http_json(base_a + "/api/close-bulk",
                                     {"mode": "everything"})
            report(status == 400, "V7 close-bulk invalid mode → 400",
                   f"status={status}")

            # V8: close-bulk all empties the tab set
            status, data = http_json(base_a + "/api/close-bulk",
                                     {"mode": "all"})
            _, remaining = http_json(base_a + "/api/tabs")
            report(status == 200 and data.get("closed") == 2
                   and len(remaining) == 0,
                   "V8 close-bulk all empties the tab set")

            # ── Sibling instance ──
            work_b = work / "b"
            work_b.mkdir()
            server_b = subprocess.Popen(
                [sys.executable, "-u", "-c",
                 launch_code(work_b, inst_dir, None), str(docs["alpha"]),
                 "--port", str(port_b), "--max-instances", "99"],
                cwd=ROOT, stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True)
            base_b = f"http://127.0.0.1:{port_b}"
            wait_http(base_b + "/api/tabs")

            # V9: sibling discovered with its tabs
            _, inst = http_json(base_a + "/api/instances")
            sibling = next((r for r in inst["instances"]
                            if r["port"] == port_b), None)
            report(sibling is not None and not sibling["isSelf"]
                   and {t["filename"] for t in sibling["tabs"]} == {"alpha.md"}
                   and sibling.get("started"),
                   "V9 sibling instance discovered with tab list")

            # V10: proxy shutdown validation — self port and bad ports rejected
            s_self, _ = http_json(base_a + "/api/instances/shutdown",
                                  {"port": port_a})
            s_bad, _ = http_json(base_a + "/api/instances/shutdown",
                                 {"port": "nonsense"})
            report(s_self == 400 and s_bad == 400,
                   "V10 proxy shutdown rejects self and malformed ports",
                   f"self={s_self}, malformed={s_bad}")

            # V11: proxy shutdown stops the sibling and cleans its PID file
            status, data = http_json(base_a + "/api/instances/shutdown",
                                     {"port": port_b})
            down = wait_down(base_b + "/api/tabs", timeout=6)
            try:
                server_b.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
            pid_gone = not (inst_dir / f"{port_b}.pid").exists()
            tabs_gone = not (inst_dir / f"{port_b}.tabs.json").exists()
            report(status == 200 and data.get("ok") and down
                   and pid_gone and tabs_gone,
                   "V11 proxy shutdown stops sibling, cleans PID + tabs.json",
                   f"down={down}, pidGone={pid_gone}, tabsGone={tabs_gone}")
            if server_b.poll() is not None:
                server_b = None

            # V12: self shutdown — responds, exits cleanly, cleans PID file
            status, data = http_json(base_a + "/api/shutdown", {})
            try:
                exited = server_a.wait(timeout=6) is not None
            except subprocess.TimeoutExpired:
                exited = False
            report(status == 200 and data.get("ok") and exited
                   and not (inst_dir / f"{port_a}.pid").exists(),
                   "V12 self shutdown exits cleanly and cleans PID file")
            if server_a.poll() is not None:
                server_a = None
    except Exception as exc:
        report(False, "Harness setup/runtime", str(exc))
    finally:
        for proc in (chrome, server_a, server_b):
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
