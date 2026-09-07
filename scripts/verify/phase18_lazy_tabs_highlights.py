#!/usr/bin/env python3
"""Phase 18 — lazy inactive tabs + batched annotation highlights (CDP).

Born of the 2026-09-06 review pass: init.js stopped fetching content for
inactive tabs, which broke two "render if we have the document"
fall-throughs (closeTab, the server-removed-active path) and let edit
mode open on an empty body; and the index-once highlight walker
collapsed nested / adjacent / duplicate anchors. Both fixed; this net
keeps them fixed.

V1 inactive tabs start unloaded (changeKey only), the active one loaded
V2 overlapping anchors (outer, nested, duplicate, straddling, disjoint)
   all render a non-empty, non-zero-width mark; every bubble present
V3 closing the active tab loads and renders the never-activated successor
V4 the active tab removed server-side → unloaded successor is fetched
V5 switchTab loads on first activation
V6 enterEditMode on an unloaded tab fetches first — the editor never
   opens on an empty body
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts" / "verify"))
from dabarat import pdf_export  # noqa: E402
from phase12_instances_tabs import Browser, launch_code, wait_http  # noqa: E402

PASS = FAIL = 0


def report(ok: bool, name: str, detail: str = "") -> None:
    global PASS, FAIL
    PASS += ok
    FAIL += (not ok)
    print(f"  {'✓' if ok else '✗'} {name}" + (f" — {detail}" if detail else ""))


def post(base: str, path: str, payload: dict):
    req = urllib.request.Request(
        base + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Origin": base})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


ANCHORS = [("A", "quick brown fox jumps"), ("B", "brown fox"),
           ("C", "quick brown fox jumps"), ("D", "lazy dog"),
           ("E", "fox jumps over the lazy")]


def main() -> int:
    chrome_path = pdf_export._find_chrome()
    if not chrome_path:
        report(False, "Chrome availability", "Chrome/Chromium not found")
        print(f"PASS={PASS} FAIL={FAIL}")
        return 1
    print("Phase 18 — lazy tabs + batched highlights V1-V6")
    server = chrome = None
    try:
        with tempfile.TemporaryDirectory(prefix="dabarat-p18-",
                                         ignore_cleanup_errors=True) as work_name:
            work = Path(work_name)
            docs = {}
            for name in ("alpha", "beta", "gamma", "delta"):
                body = ("# Fox\n\nThe quick brown fox jumps over the lazy dog.\n\nSecond paragraph stands alone.\n"
                        if name == "alpha" else f"# {name.title()}\n\nbody of {name}\n")
                docs[name] = work / f"{name}.md"
                docs[name].write_text(body, encoding="utf-8")
            (work / "alpha.md.annotations.json").write_text(json.dumps({
                "version": 1, "annotations": [
                    {"id": i, "anchor": {"text": t, "heading": "", "offset": 0},
                     "author": {"name": "p18", "type": "ai"},
                     "created": "2026-09-06T00:00:00+00:00", "body": "note " + i,
                     "type": "comment", "resolved": False, "replies": []}
                    for i, t in ANCHORS]}), encoding="utf-8")

            port = pdf_export._find_free_port()
            dbg = pdf_export._find_free_port()
            server = subprocess.Popen(
                [sys.executable, "-u", "-c", launch_code(work, work / "instances", None),
                 *(str(docs[n]) for n in ("alpha", "beta", "gamma", "delta")),
                 "--port", str(port), "--max-instances", "99"],
                cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            base = f"http://127.0.0.1:{port}"
            wait_http(base + "/api/tabs")
            with urllib.request.urlopen(base + "/api/tabs") as r:
                tab_list = json.load(r)
            ids = {Path(t["filepath"]).stem: t["id"] for t in tab_list}

            chrome = subprocess.Popen(
                [chrome_path, "--headless=new", f"--remote-debugging-port={dbg}",
                 f"--user-data-dir={work / 'profile'}", "--disable-gpu", "--no-first-run",
                 "--no-default-browser-check", "--disable-extensions",
                 "--window-size=1200,800", base],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            b = Browser(dbg)
            b.wait("document.readyState === 'complete' && typeof tabs !== 'undefined' "
                   "&& Object.keys(tabs).length === 4 && !!document.querySelector('#content h1')",
                   timeout=30)

            # V1 lazy start
            st = b.evaluate(f"""(() => {{
              const a = tabs[{ids['alpha']!r}], g = tabs[{ids['gamma']!r}];
              return {{aLoaded: _tabLoaded(a), gLoaded: _tabLoaded(g),
                       gKey: !!g.changeKey, gContent: g.content, active: activeTabId}};
            }})()""")
            report(st["aLoaded"] and not st["gLoaded"] and st["gKey"] and st["gContent"] == ""
                   and st["active"] == ids["alpha"],
                   "V1 active tab loaded, inactive tabs carry a changeKey and no content",
                   json.dumps(st))

            # V2 overlapping anchors
            b.wait("document.querySelectorAll('mark.annotation-highlight').length >= 5", timeout=10)
            marks = b.evaluate("""(() => Array.from(document.querySelectorAll('mark.annotation-highlight'))
              .map(m => ({id: m.dataset.annotationId, len: m.textContent.length,
                          w: Math.round(m.getBoundingClientRect().width)})))()""")
            bubbles = b.evaluate("""Array.from(document.querySelectorAll('.ann-bubble[data-annotation-id]'))
              .map(x => x.dataset.annotationId)""")
            got = {m["id"] for m in marks}
            report(got == {i for i, _ in ANCHORS} and all(m["len"] > 0 and m["w"] > 0 for m in marks)
                   and set(bubbles) == got,
                   "V2 nested/duplicate/straddling anchors all get a visible mark",
                   "; ".join(f"{m['id']}:{m['len']}ch/{m['w']}px" for m in marks))

            # V3 close the active tab → never-activated successor loads
            b.evaluate("closeTab(activeTabId)")
            ok = False
            try:
                b.wait("document.querySelector('#content h1') && "
                       "document.querySelector('#content h1').textContent.trim() === 'Beta'"
                       " && _tabLoaded(tabs[activeTabId])", timeout=8)
                ok = True
            except Exception:
                pass
            sp = b.evaluate("document.getElementById('status-filepath').textContent")
            report(ok and sp == str(docs["beta"]),
                   "V3 closeTab: successor fetched and rendered, status bar follows",
                   f"h1={b.evaluate('document.querySelector(\"#content h1\").textContent')} path_ok={sp == str(docs['beta'])}")

            # V4 server removes the active tab → unloaded successor fetched
            post(base, "/api/close", {"id": ids["beta"]})
            ok = False
            try:
                b.wait("document.querySelector('#content h1') && "
                       "document.querySelector('#content h1').textContent.trim() === 'Gamma'"
                       " && _tabLoaded(tabs[activeTabId])", timeout=8)
                ok = True
            except Exception:
                pass
            report(ok, "V4 server-side close of the active tab: lazy successor fetched",
                   f"h1={b.evaluate('document.querySelector(\"#content h1\").textContent')}")

            # V5 switchTab loads on first activation
            b.evaluate(f"switchTab({ids['delta']!r})")
            ok = False
            try:
                b.wait("document.querySelector('#content h1').textContent.trim() === 'Delta'"
                       " && _tabLoaded(tabs[activeTabId])", timeout=8)
                ok = True
            except Exception:
                pass
            report(ok, "V5 switchTab fetches content on first activation")

            # V6 edit mode on an unloaded tab fetches first
            b.evaluate(f"""(() => {{
              const t = tabs[{ids['delta']!r}]; t.loaded = false; t.content = ''; t.body = undefined;
            }})()""")
            b.evaluate("enterEditMode()")
            ok = False
            try:
                b.wait("editState.active === true", timeout=30)
                ok = True
            except Exception:
                pass
            saved = b.evaluate("editState.savedContent") if ok else None
            report(ok and isinstance(saved, str) and saved.startswith("# Delta"),
                   "V6 enterEditMode on an unloaded tab loads the body before opening",
                   f"savedContent starts with {saved[:12]!r}" if saved else "editor did not open")
    except Exception as exc:
        report(False, "Harness setup/runtime", repr(exc))
    finally:
        for proc in (chrome, server):
            if proc:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except Exception:
                    proc.kill()
    print(f"PASS={PASS} FAIL={FAIL}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
