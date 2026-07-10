#!/usr/bin/env python3
"""Phase 7 verification — deterministic TOC navigation (V1-V20).

Uses only stdlib plus dabarat's in-repository CDP/WebSocket primitives.
All servers use ephemeral high ports and all test state is removed in finally.
"""

from __future__ import annotations

import glob
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

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
        print(f"  \u2713 {name}" + (f" — {detail}" if detail else ""))
    else:
        FAIL += 1
        print(f"  \u2717 {name}" + (f" — {detail}" if detail else ""))


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
            except Exception as exc:  # navigation briefly invalidates execution contexts
                last_error = exc
            time.sleep(interval)
        suffix = f"; last error: {last_error}" if last_error else ""
        raise RuntimeError(f"browser condition timed out: {expression}{suffix}")

    def navigate(self, url: str) -> None:
        self.command("Page.navigate", {"url": url})
        self.wait(
            "document.readyState === 'complete' && "
            "document.querySelectorAll('#toc-list a[data-target]').length >= 10",
            timeout=30.0,
        )


def document_text(marker: str = "BASE_MARKER", remove_heading: str | None = None) -> str:
    headings = [
        ("#", "Shared Title"),
        ("##", "Duplicate"),
        ("##", "Section 2"),
        ("##", "Duplicate"),
        ("##", "Emoji \U0001f9ed Heading"),
    ]
    headings.extend(("##", f"Section {i}") for i in range(5, 14))
    headings.append(("##", "Final Heading"))
    if remove_heading:
        headings = [item for item in headings if item[1] != remove_heading]

    parts = [
        "---",
        "variables:",
        "  - name: traveler",
        "    type: string",
        "    default: World",
        "---",
    ]
    for index, (level, title) in enumerate(headings):
        parts.append(f"{level} {title}")
        if index == 0:
            parts.append(f"ANNOTATION TARGET {{{{traveler}}}} remains stable. {marker}")
        paragraph_count = 10 if title != "Final Heading" else 1
        for paragraph in range(paragraph_count):
            parts.append(
                f"Long body {index}-{paragraph}. "
                + "Deterministic navigation needs enough vertical distance for smooth scrolling. " * 4
            )
    return "\n\n".join(parts) + "\n"


def second_document_text() -> str:
    parts = ["# Shared Title"]
    for i in range(1, 13):
        parts.extend(
            [
                f"## Other Section {i}",
                ("Second-tab body content. " * 35),
            ]
        )
    return "\n\n".join(parts) + "\n"


def link_target(browser: Browser, label: str) -> str:
    label_json = json.dumps(label)
    target = browser.evaluate(
        "(() => { const a = [...document.querySelectorAll('#toc-list a[data-target]')]"
        f".find(x => x.textContent === {label_json}); return a ? a.dataset.target : ''; }})()"
    )
    if not target:
        raise RuntimeError(f"TOC label not found: {label}")
    return target


def click_label(browser: Browser, label: str) -> str:
    label_json = json.dumps(label)
    return browser.evaluate(
        "(() => { const a = [...document.querySelectorAll('#toc-list a[data-target]')]"
        f".find(x => x.textContent === {label_json}); "
        "if (!a) throw new Error('link missing'); a.click(); return a.dataset.target; })()"
    )


def wait_jump(browser: Browser, target: str | None = None, timeout: float = 8.0) -> None:
    target_check = "true" if target is None else f"_tocDecodedHash() === {json.dumps(target)}"
    browser.wait(
        f"_tocActiveJump === null && ({target_check})",
        timeout=timeout,
    )


def install_instrumentation(browser: Browser) -> None:
    # Idempotent: the wrapper closes over the true native function so a
    # repeated install (fresh page or same page) can never self-reference
    # and recurse the way a dynamic window.__native... lookup would.
    browser.evaluate(
        "(() => { "
        "if (!window.__tocInstrumented) { "
        "window.__tocInstrumented = true; "
        "window.__tocErrors = []; "
        "window.addEventListener('error', e => window.__tocErrors.push(e.message)); "
        "const native = window.scrollTo.bind(window); "
        "window.__nativeWindowScrollTo = native; "
        "window.scrollTo = function() { window.__tocScrollCalls++; "
        "return native.apply(window, arguments); }; } "
        "window.__tocScrollCalls = 0; })(); true"
    )


def run_case(name: str, function) -> None:
    try:
        detail = function()
        if detail is False:
            report(False, name, "assertion returned false")
        else:
            report(True, name, detail if isinstance(detail, str) else "")
    except Exception as exc:
        report(False, name, str(exc))


def main() -> int:
    server = None
    chrome = None
    server_port = None
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

    print("Phase 7 — TOC navigation V1-V20")
    try:
        chrome_version = subprocess.run(
            [chrome_path, "--version"], capture_output=True, text=True, timeout=5
        ).stdout.strip()
    except Exception:
        chrome_version = Path(chrome_path).name
    print(f"Chrome: {chrome_version}")

    try:
        # Chrome is terminated in the outer finally, after this block exits —
        # its profile writes race the directory cleanup, so ignore residue.
        with tempfile.TemporaryDirectory(prefix="dabarat-p7-", ignore_cleanup_errors=True) as work_name:
            work = Path(work_name)
            doc_a = work / "toc-a.md"
            doc_b = work / "toc-b.md"
            doc_a.write_text(document_text(), encoding="utf-8")
            doc_b.write_text(second_document_text(), encoding="utf-8")
            (work / "toc-a.md.annotations.json").write_text(
                json.dumps(
                    {
                        "version": 1,
                        "annotations": [
                            {
                                "id": "p7ann",
                                "anchor": {"text": "ANNOTATION TARGET", "heading": "Shared Title", "offset": 0},
                                "author": {"name": "Verifier", "type": "human"},
                                "created": "2026-07-09T00:00:00+00:00",
                                "body": "Phase 7 annotation",
                                "type": "comment",
                                "resolved": False,
                                "replies": [],
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            launch_code = (
                "import sys, webbrowser\n"
                "import dabarat.__main__ as m\n"
                "m._find_chrome = lambda: None\n"
                "webbrowser.open = lambda *a, **k: True\n"
                "sys.argv = ['dabarat'] + sys.argv[1:]\n"
                "m.cmd_serve(sys.argv)\n"
            )
            server = subprocess.Popen(
                [
                    sys.executable,
                    "-u",
                    "-c",
                    launch_code,
                    str(doc_a),
                    str(doc_b),
                    "--port",
                    str(server_port),
                    "--max-instances",
                    "99",
                ],
                cwd=ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            base = f"http://127.0.0.1:{server_port}"
            wait_http(base + "/api/tabs")
            tab_list = http_json(base + "/api/tabs")
            by_name = {tab["filename"]: tab["id"] for tab in tab_list}
            tab_a = by_name[doc_a.name]
            tab_b = by_name[doc_b.name]

            chrome_profile = work / "chrome-profile"
            chrome = subprocess.Popen(
                [
                    chrome_path,
                    "--headless=new",
                    f"--remote-debugging-port={debug_port}",
                    f"--user-data-dir={chrome_profile}",
                    "--disable-gpu",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-extensions",
                    "--window-size=1200,800",
                    f"{base}/?tab={urllib.parse.quote(tab_a)}",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            browser = Browser(debug_port)
            browser.wait(
                "document.readyState === 'complete' && "
                "document.querySelectorAll('#toc-list a[data-target]').length >= 10",
                timeout=30.0,
            )
            install_instrumentation(browser)
            # Let webfonts and Twemoji images settle: late swaps shift heading
            # positions between a jump's measurement and its landing.
            browser.wait(
                "document.fonts.status === 'loaded' && "
                "[...document.querySelectorAll('#content img.emoji')].every(i => i.complete)",
                timeout=15,
            )

            def v1():
                target = click_label(browser, "Section 7")
                wait_jump(browser, target)
                result = browser.evaluate(
                    f"(() => {{ const h = document.getElementById({json.dumps(target)}); "
                    "const offset = getTocHeadingOffset(); const a = document.querySelector('#toc-list a.active'); "
                    "return Math.abs(h.getBoundingClientRect().top - offset) <= 3 && "
                    f"a && a.dataset.target === {json.dumps(target)}; }})()"
                )
                if not result:
                    raise AssertionError("heading offset or active link mismatch")

            run_case("V1 distant click reaches offset and active link", v1)

            def v2():
                target = link_target(browser, "Section 7")
                browser.evaluate(
                    "document.documentElement.style.scrollBehavior='auto'; "
                    "window.__nativeWindowScrollTo(0, 0); window.__tocScrollCalls=0; true"
                )
                click_label(browser, "Section 7")
                wait_jump(browser, target)
                result = browser.evaluate(
                    f"window.__tocScrollCalls === 1 && Math.abs(document.getElementById({json.dumps(target)}).getBoundingClientRect().top - getTocHeadingOffset()) <= 3"
                )
                if not result:
                    raise AssertionError("same-hash activation did not issue one explicit scroll")

            run_case("V2 repeated same-hash click scrolls again", v2)

            def v3():
                target = link_target(browser, "Section 6")
                browser.evaluate(
                    f"(() => {{ const u=new URL(location.href); u.hash={json.dumps(target)}; "
                    "history.replaceState(history.state,'',u); window.__nativeWindowScrollTo(0,0); "
                    "window.__tocScrollCalls=0; return true; })()"
                )
                click_label(browser, "Section 6")
                wait_jump(browser, target)
                if not browser.evaluate("window.__tocScrollCalls === 1"):
                    raise AssertionError("pre-set hash suppressed explicit scroll")

            run_case("V3 externally pre-set hash does not suppress jump", v3)

            def v4():
                targets = browser.evaluate(
                    "(() => { const links=[...document.querySelectorAll('#toc-list a[data-target]')]; "
                    "const first=links.find(a=>a.textContent==='Section 12'); "
                    "const second=links.find(a=>a.textContent==='Section 5'); "
                    "window.__nativeWindowScrollTo(0,0); first.click(); second.click(); "
                    "return [first.dataset.target, second.dataset.target]; })()"
                )
                wait_jump(browser, targets[1])
                result = browser.evaluate(
                    f"Math.abs(document.getElementById({json.dumps(targets[1])}).getBoundingClientRect().top - getTocHeadingOffset()) <= 3"
                )
                if not result:
                    raise AssertionError("older smooth-scroll completion won")

            run_case("V4 newest rapid click wins", v4)

            def v5():
                target = link_target(browser, "Section 8")
                deep_url = f"{base}/?tab={urllib.parse.quote(tab_a)}#{urllib.parse.quote(target)}"
                browser.navigate(deep_url)
                wait_jump(browser, target)
                result = browser.evaluate(
                    f"activeTabId === {json.dumps(tab_a)} && Math.abs(document.getElementById({json.dumps(target)}).getBoundingClientRect().top - getTocHeadingOffset()) <= 3"
                )
                if not result:
                    raise AssertionError("initial asynchronous deep link missed target")
                install_instrumentation(browser)

            run_case("V5 initial deep link resolves after render", v5)

            def v6():
                click_label(browser, "Section 7")
                wait_jump(browser)
                browser.evaluate(
                    f"window.__aExpectedScroll = window.scrollY; tabs[{json.dumps(tab_b)}].scrollY=237; "
                    f"switchTab({json.dumps(tab_b)}); true"
                )
                browser.wait(f"activeTabId === {json.dumps(tab_b)} && _tocActiveJump === null")
                time.sleep(0.15)
                result = browser.evaluate(
                    f"_tocDecodedHash() === '' && Math.abs(window.scrollY - 237) <= 2 && "
                    "document.querySelector('#toc-list a').textContent === 'Shared Title'"
                )
                if not result:
                    raise AssertionError("tab B did not restore numeric scroll or clear tab-A hash")

            run_case("V6 tab switch clears stale owned hash", v6)

            def v7():
                browser.evaluate(f"switchTab({json.dumps(tab_a)}); true")
                browser.wait(f"activeTabId === {json.dumps(tab_a)} && _tocActiveJump === null")
                time.sleep(0.15)
                if not browser.evaluate("Math.abs(window.scrollY - window.__aExpectedScroll) <= 2 && _tocDecodedHash() === ''"):
                    raise AssertionError("tab A scrollY was not restored independently")

            run_case("V7 returning tab restores scroll without hash replay", v7)

            def v8():
                browser.evaluate("window.__nativeWindowScrollTo(0,0); true")
                target = click_label(browser, "Section 12")
                active = browser.evaluate(
                    f"_tocActiveJump && _tocActiveJump.targetId === {json.dumps(target)} && "
                    f"!!(window.__oldPollTarget=document.getElementById({json.dumps(target)}))"
                )
                if not active:
                    raise AssertionError("jump was not active before polling rewrite")
                doc_a.write_text(document_text("POLL_RETAIN_MARKER"), encoding="utf-8")
                os.utime(doc_a, None)
                browser.wait("document.getElementById('content').textContent.includes('POLL_RETAIN_MARKER')", timeout=8)
                wait_jump(browser, target)
                result = browser.evaluate(
                    f"document.getElementById({json.dumps(target)}) !== window.__oldPollTarget && "
                    f"Math.abs(document.getElementById({json.dumps(target)}).getBoundingClientRect().top - getTocHeadingOffset()) <= 3"
                )
                if not result:
                    raise AssertionError("jump did not resume against replacement heading node")

            run_case("V8 polling re-render resumes active target", v8)

            def v9():
                browser.evaluate("window.__nativeWindowScrollTo(0,0); window.__tocErrors=[]; true")
                target = click_label(browser, "Section 11")
                if not browser.evaluate("_tocActiveJump !== null"):
                    raise AssertionError("jump was not active before target removal")
                doc_a.write_text(document_text("POLL_REMOVE_MARKER", remove_heading="Section 11"), encoding="utf-8")
                os.utime(doc_a, None)
                browser.wait("document.getElementById('content').textContent.includes('POLL_REMOVE_MARKER')", timeout=8)
                browser.wait("_tocActiveJump === null")
                result = browser.evaluate(
                    f"_tocDecodedHash() === '' && !document.getElementById({json.dumps(target)}) && window.__tocErrors.length === 0"
                )
                if not result:
                    raise AssertionError("removed target left hash, jump, or detached-node error")

            run_case("V9 removed polling target cancels and clears hash", v9)

            doc_a.write_text(document_text(), encoding="utf-8")
            os.utime(doc_a, None)
            browser.wait("document.getElementById('content').textContent.includes('BASE_MARKER')", timeout=8)

            def v10():
                target = link_target(browser, "Section 9")
                browser.evaluate(
                    f"(() => {{ const h=document.getElementById({json.dumps(target)}); "
                    "window.__nativeWindowScrollTo({top: window.scrollY+h.getBoundingClientRect().top-getTocHeadingOffset(), behavior:'instant'}); "
                    "return true; })()"
                )
                browser.wait(f"document.querySelector('#toc-list a.active')?.dataset.target === {json.dumps(target)}")
                result = browser.evaluate(
                    "(() => { const a=document.querySelector('#toc-list a.active'); const sc=document.getElementById('toc-scroll'); "
                    "const ar=a.getBoundingClientRect(), sr=sc.getBoundingClientRect(); "
                    "return ar.top >= sr.top-2 && ar.bottom <= sr.bottom+2; })()"
                )
                if not result:
                    raise AssertionError("manual scroll-spy did not keep active TOC link visible")

            run_case("V10 manual scrolling updates and reveals active link", v10)

            def v11():
                target = link_target(browser, "Section 5")
                browser.evaluate(
                    "window.__savedScrollIntoView=Element.prototype.scrollIntoView; "
                    "Element.prototype.scrollIntoView=function(){throw new Error('scrollIntoView called')}; "
                    "window.__tocErrors=[]; window.__nativeWindowScrollTo(0,0); true"
                )
                click_label(browser, "Section 5")
                wait_jump(browser, target)
                result = browser.evaluate(
                    "(() => { Element.prototype.scrollIntoView=window.__savedScrollIntoView; "
                    "return window.__tocErrors.length===0; })()"
                )
                if not result:
                    raise AssertionError("navigation invoked scrollIntoView")

            run_case("V11 scrollIntoView monkey-patch is never reached", v11)

            def v13():
                result = browser.evaluate(
                    "(() => { const links=[...document.querySelectorAll('#toc-list a')].filter(a=>a.textContent==='Duplicate'); "
                    "return links.length===2 && links[0].dataset.target!==links[1].dataset.target && "
                    "links.every(a=>document.getElementById(a.dataset.target)); })()"
                )
                if not result:
                    raise AssertionError("duplicate heading targets are not unique/live")

            run_case("V13 duplicate headings retain unique indexed IDs", v13)

            def v14():
                native = browser.evaluate(
                    "setEmojiStyle('native'); (() => { const a=[...document.querySelectorAll('#toc-list a')].find(x=>x.textContent.includes('\U0001f9ed')); "
                    "return !!a && !!document.getElementById(a.dataset.target) && !document.querySelector('#content h2 img.emoji'); })()"
                )
                twitter = browser.evaluate(
                    "setEmojiStyle('twitter'); (() => { const a=[...document.querySelectorAll('#toc-list a')].find(x=>x.textContent.includes('\U0001f9ed')); "
                    "return !!a && !!document.getElementById(a.dataset.target) && !!document.querySelector('#content h2 img.emoji'); })()"
                )
                if not (native and twitter):
                    raise AssertionError("emoji label/target failed in native or Twemoji mode")

            run_case("V14 emoji labels survive native and Twemoji render", v14)

            def v15():
                browser.evaluate(
                    "toggleToc(); toggleToc(); "
                    "const sc=document.getElementById('toc-scroll'), cached=sc.innerHTML; "
                    "window.__oldTocList=document.getElementById('toc-list'); "
                    "sc.innerHTML='<div>temporary home sidebar</div>'; sc.innerHTML=cached; "
                    "lastRenderedMd=null; render(tabBody(tabs[activeTabId])); "
                    "window.__nativeWindowScrollTo(0,0); window.__tocScrollCalls=0; true"
                )
                target = link_target(browser, "Section 6")
                click_label(browser, "Section 6")
                wait_jump(browser, target)
                if not browser.evaluate(
                    "window.__tocScrollCalls === 1 && !document.body.classList.contains('toc-collapsed') && "
                    "document.getElementById('toc-list') !== window.__oldTocList"
                ):
                    raise AssertionError("restored TOC missed navigation or duplicated activation")

            run_case("V15 collapsed/restored TOC activates exactly once", v15)

            def v16():
                browser.evaluate("enterEditMode(); true")
                browser.wait("editState.active && getComputedStyle(document.getElementById('content')).display === 'none'")
                before = browser.evaluate(
                    "(() => { window.__tocScrollCalls=0; window.__modeHash=location.hash; "
                    "document.querySelector('#toc-list a[data-target]').click(); "
                    "return window.__tocScrollCalls===0 && location.hash===window.__modeHash; })()"
                )
                if not before:
                    raise AssertionError("edit mode allowed hidden-content navigation")
                browser.evaluate("exitEditMode(true)")
                browser.wait("!editState.active && getComputedStyle(document.getElementById('content')).display !== 'none'")
                target = click_label(browser, "Section 5")
                wait_jump(browser, target)

            run_case("V16 edit mode guards hidden content and rebuilds preview", v16)

            def v17():
                browser.evaluate(f"enterDiffMode({json.dumps(str(doc_b))})")
                browser.wait("diffState.active && getComputedStyle(document.getElementById('diff-view')).display !== 'none'")
                guarded = browser.evaluate(
                    "(() => { window.__tocScrollCalls=0; window.__modeHash=location.hash; "
                    "document.querySelector('#toc-list a[data-target]').click(); "
                    "return window.__tocScrollCalls===0 && location.hash===window.__modeHash; })()"
                )
                if not guarded:
                    raise AssertionError("diff mode allowed preview navigation")
                browser.evaluate("exitDiffMode(); true")
                browser.wait("!diffState.active && getComputedStyle(document.getElementById('content')).display !== 'none'")
                target = click_label(browser, "Section 6")
                wait_jump(browser, target)

            run_case("V17 diff mode remains isolated and preview recovers", v17)

            def v18():
                try:
                    # !! matters: a bare element serializes to {} under
                    # returnByValue, which Python reads as falsy.
                    browser.wait("!!(document.querySelector('mark.annotation-highlight') && document.querySelector('.tpl-var-pill'))", timeout=5)
                except RuntimeError:
                    state = browser.evaluate(
                        "JSON.stringify({mark: !!document.querySelector('mark.annotation-highlight'), "
                        "pill: !!document.querySelector('.tpl-var-pill'), "
                        "cache: (annotationsCache[activeTabId]||[]).length, "
                        "fm: !!currentFrontmatter})"
                    )
                    raise AssertionError(f"wrappers absent after sequence: {state}")
                target = link_target(browser, "Section 5")
                before = browser.evaluate("document.getElementById('content').querySelectorAll('*').length")
                click_label(browser, "Section 5")
                wait_jump(browser, target)
                result = browser.evaluate(
                    f"document.getElementById('content').querySelectorAll('*').length === {before} && "
                    "!!document.querySelector('mark.annotation-highlight') && !!document.querySelector('.tpl-var-pill')"
                )
                if not result:
                    raise AssertionError("navigation disturbed annotation or variable wrappers")

            run_case("V18 annotations and variable wrappers remain intact", v18)

            def v19():
                target = click_label(browser, "Final Heading")
                wait_jump(browser, target)
                result = browser.evaluate(
                    "(() => { const sc=document.scrollingElement; const max=Math.max(0,sc.scrollHeight-sc.clientHeight); "
                    "const a=document.querySelector('#toc-list a.active'); "
                    f"return Math.abs(sc.scrollTop-max)<=2 && _tocDecodedHash()==={json.dumps(target)} && "
                    f"!!a && a.dataset.target==={json.dumps(target)}; }})()"
                )
                if not result:
                    raise AssertionError("final heading did not clamp to maximum scroll with active link")

            run_case("V19 final heading clamps at document bottom", v19)

            def v20():
                result = browser.evaluate(
                    "(() => { const a=document.querySelector('#toc-list a[data-target]'); "
                    "window.__tocScrollCalls=0; const hash=location.hash; "
                    "const modified=new MouseEvent('click',{bubbles:true,cancelable:true,button:0,metaKey:true}); "
                    "const middle=new MouseEvent('click',{bubbles:true,cancelable:true,button:1}); "
                    "const r1=a.dispatchEvent(modified), r2=a.dispatchEvent(middle); "
                    "return r1 && r2 && !modified.defaultPrevented && !middle.defaultPrevented && "
                    "window.__tocScrollCalls===0 && location.hash===hash; })()"
                )
                if not result:
                    raise AssertionError("modified or middle click was intercepted")

            run_case("V20 modified and middle clicks retain native behavior", v20)

            def v12():
                # Emulation.setEmulatedMedia only lives as long as its DevTools
                # session, and _cdp_request opens a fresh WebSocket per command
                # — the override evaporates immediately. Launch a dedicated
                # Chrome with the real reduced-motion switch instead.
                rm_port = pdf_export._find_free_port()
                rm_chrome = subprocess.Popen(
                    [
                        chrome_path,
                        "--headless=new",
                        f"--remote-debugging-port={rm_port}",
                        f"--user-data-dir={work / 'chrome-rm-profile'}",
                        "--disable-gpu",
                        "--no-first-run",
                        "--no-default-browser-check",
                        "--disable-extensions",
                        "--force-prefers-reduced-motion",
                        "--window-size=1200,800",
                        f"{base}/?tab={urllib.parse.quote(tab_a)}",
                    ],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                try:
                    rm = Browser(rm_port)
                    rm.wait(
                        "document.readyState === 'complete' && document.querySelectorAll('#toc-list a[data-target]').length >= 10",
                        timeout=30,
                    )
                    rm.evaluate(
                        "(() => { window.__tocBehaviors=[]; "
                        "const nativeWin=window.scrollTo.bind(window); "
                        "window.scrollTo=function(o){if(o&&typeof o==='object')window.__tocBehaviors.push(['window',o.behavior]); "
                        "return nativeWin.apply(window,arguments)}; "
                        "const nativeEl=Element.prototype.scrollTo; "
                        "Element.prototype.scrollTo=function(o){if(this.id==='toc-scroll')window.__tocBehaviors.push(['toc',o.behavior]); "
                        "return nativeEl.apply(this,arguments)}; })(); true"
                    )
                    target = click_label(rm, "Section 9")
                    wait_jump(rm, target)
                    result = rm.evaluate(
                        "_prefersReducedMotion === true && window.__tocBehaviors.some(x=>x[0]==='window'&&x[1]==='auto') && "
                        "window.__tocBehaviors.some(x=>x[0]==='toc'&&x[1]==='auto') && "
                        "window.__tocBehaviors.every(x=>x[1]!=='smooth')"
                    )
                    if not result:
                        detail = rm.evaluate(
                            "JSON.stringify({reduced: _prefersReducedMotion, behaviors: window.__tocBehaviors})"
                        )
                        raise AssertionError(f"reduced-motion navigation requested smooth behavior: {detail}")
                finally:
                    rm_chrome.terminate()
                    try:
                        rm_chrome.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        rm_chrome.kill()

            run_case("V12 reduced motion uses only auto scrolling", v12)

            run_case(
                "CDP scroller identity",
                lambda: browser.evaluate("document.scrollingElement === document.documentElement")
                or (_ for _ in ()).throw(AssertionError("document scroller is not <html>")),
            )

    except Exception as exc:
        report(False, "Harness setup/runtime", str(exc))
        if server and server.stdout:
            try:
                server.terminate()
                output, _ = server.communicate(timeout=2)
                if output:
                    print("Server log tail:")
                    print("\n".join(output.splitlines()[-12:]))
            except Exception:
                pass
    finally:
        if chrome and chrome.poll() is None:
            chrome.terminate()
            try:
                chrome.wait(timeout=5)
            except subprocess.TimeoutExpired:
                chrome.kill()
        if server and server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
        if server_port is not None:
            instance_dir = Path.home() / ".dabarat" / "instances"
            for path in glob.glob(str(instance_dir / f"{server_port}.*")):
                try:
                    os.remove(path)
                except FileNotFoundError:
                    pass

    print(f"PASS={PASS} FAIL={FAIL}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
