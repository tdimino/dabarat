#!/usr/bin/env python3
"""Phase 14 verification — auto-tab cap + home preview images (V1-V6).

Guards the hook-pushed tab ceiling (`auto: true` on /api/add, capped by
MAX_AUTO_TABS, oldest evicted first, user tabs immune, save clears the
flag) and the /api/preview-image allowlist, which must serve images for
recent-file cards whose tabs are already closed (the 2026-08-20 broken
home-card bug). Also re-checks the /api/close-bulk contract the client's
failure path depends on.

Private INSTANCE_DIR / history / recent stores — the user's ~/.dabarat is
never touched. No Chrome needed.
"""

from __future__ import annotations

import json
import os
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
CAP = 3


def report(ok: bool, name: str, detail: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✓ {name}" + (f" — {detail}" if detail else ""))
    else:
        FAIL += 1
        print(f"  ✗ {name}" + (f" — {detail}" if detail else ""))


def http(url: str, payload=None, timeout: float = 10.0):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        headers["Origin"] = url.split("/api/")[0]
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read()


def http_json(url: str, payload=None):
    status, _, body = http(url, payload)
    return status, json.loads(body)


def wait_http(url: str, timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            http_json(url)
            return
        except (OSError, urllib.error.URLError, json.JSONDecodeError):
            time.sleep(0.1)
    raise RuntimeError(f"server did not become ready: {url}")


def launch_code(work: Path) -> str:
    inst_dir = work / "instances"
    inst_dir.mkdir()
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
        "import dabarat.server as s\n"
        f"s.MAX_AUTO_TABS = {CAP}\n"
        "m._find_chrome = lambda: None\n"
        "m._live_instances = lambda: []\n"
        "webbrowser.open = lambda *a, **k: True\n"
        "sys.argv = ['dabarat'] + sys.argv[1:]\n"
        "m.cmd_serve(sys.argv)\n"
    )


def main() -> int:
    server = None
    try:
        work = Path(tempfile.mkdtemp(prefix="dabarat-phase14-"))
        docs = work / "docs"
        docs.mkdir()
        # 1x1 PNG next to a markdown file that references it relatively.
        # Its own directory — no open tab may share it, or the tab-dir
        # allowlist would mask a broken recent-dir allowlist.
        imgdir = work / "imgdoc"
        imgdir.mkdir()
        png = imgdir / "pic.png"
        png.write_bytes(bytes.fromhex(
            "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
            "0000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"))
        imgdoc = imgdir / "with-image.md"
        imgdoc.write_text("# Pic\n\n![pic](pic.png)\n", encoding="utf-8")
        user_doc = docs / "user.md"
        user_doc.write_text("# user\n", encoding="utf-8")
        autos = []
        for i in range(CAP + 2):
            p = docs / f"auto-{i}.md"
            p.write_text(f"# auto {i}\n", encoding="utf-8")
            autos.append(p)

        port = pdf_export._find_free_port()
        server = subprocess.Popen(
            [sys.executable, "-c", launch_code(work), "--port", str(port),
             str(user_doc)],
            cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        base = f"http://127.0.0.1:{port}"
        wait_http(f"{base}/api/tabs")

        print(f"Phase 14 — auto-tab cap + preview images (port {port})")

        # V1: auto adds beyond CAP evict the oldest auto tabs
        ids = []
        for p in autos:
            _, res = http_json(f"{base}/api/add",
                               {"filepath": str(p), "auto": True})
            ids.append(res["id"])
        _, tabs = http_json(f"{base}/api/tabs")
        names = [t["filename"] for t in tabs]
        auto_open = [n for n in names if n.startswith("auto-")]
        report(len(auto_open) == CAP and auto_open == [f"auto-{i}.md" for i in range(2, CAP + 2)],
               "V1 auto tabs capped, oldest evicted first", f"open={auto_open}")

        # V2: the user-opened tab survives the eviction
        report("user.md" in names, "V2 user tab immune to auto eviction")

        # V3: a user save clears the auto flag — the tab then survives
        survivor_id = ids[-1]  # newest auto tab
        status, res = http_json(f"{base}/api/save",
                                {"tab": survivor_id, "content": "# claimed\n"})
        report(status == 200, "V3a save on an auto tab succeeds", str(status))
        for i in range(CAP + 2, 2 * CAP + 4):
            p = docs / f"auto-{i}.md"
            p.write_text(f"# auto {i}\n", encoding="utf-8")
            http_json(f"{base}/api/add", {"filepath": str(p), "auto": True})
        _, tabs = http_json(f"{base}/api/tabs")
        names = [t["filename"] for t in tabs]
        report(autos[-1].name in names,
               "V3b saved (claimed) tab survives later evictions",
               f"open={names}")

        # V4: non-auto adds are never counted against the cap
        for i in range(CAP + 2):
            p = docs / f"manual-{i}.md"
            p.write_text("# m\n", encoding="utf-8")
            http_json(f"{base}/api/add", {"filepath": str(p)})
        _, tabs = http_json(f"{base}/api/tabs")
        manual = [t for t in tabs if t["filename"].startswith("manual-")]
        report(len(manual) == CAP + 2, "V4 manual adds uncapped",
               f"{len(manual)} open")

        # V5: preview-image served for a recent file whose tab is closed
        _, res = http_json(f"{base}/api/add", {"filepath": str(imgdoc)})
        img_tab = res["id"]
        status, res = http_json(f"{base}/api/close-bulk",
                                {"mode": "ids", "ids": [img_tab]})
        report(status == 200 and res.get("closed") == 1,
               "V5a close-bulk(ids) contract", json.dumps(res))
        _, tabs = http_json(f"{base}/api/tabs")
        assert all(t["id"] != img_tab for t in tabs)
        from urllib.parse import quote
        status, ctype, body = http(
            f"{base}/api/preview-image?path={quote(str(png))}")
        report(status == 200 and ctype.startswith("image/png") and len(body) == png.stat().st_size,
               "V5b preview-image served for closed recent file",
               f"status={status} ctype={ctype}")

        # V7: a PDF figure (Pandoc convention) resolves to its SVG sibling —
        # for the home card and for an <img> fetch in the document, while a
        # plain link fetch still gets the PDF bytes
        pdfdir = work / "pdfdoc"
        pdfdir.mkdir()
        (pdfdir / "tree.pdf").write_bytes(b"%PDF-1.4 fake\n")
        svg = pdfdir / "tree.svg"
        svg.write_text('<svg xmlns="http://www.w3.org/2000/svg"/>', encoding="utf-8")
        pdfdoc = pdfdir / "paper.md"
        pdfdoc.write_text("# Paper\n\n![tree](tree.pdf){width=100%}\n", encoding="utf-8")
        _, res = http_json(f"{base}/api/add", {"filepath": str(pdfdoc)})
        _, _, recent_body = http(f"{base}/api/recent")
        entry = next((e for e in json.loads(recent_body)["entries"]
                      if e.get("path") == str(pdfdoc)), {})
        report(entry.get("previewImage") == str(svg),
               "V7a recent previewImage resolves PDF → SVG sibling",
               str(entry.get("previewImage")))
        req = urllib.request.Request(f"{base}/tree.pdf",
                                     headers={"Sec-Fetch-Dest": "image"})
        with urllib.request.urlopen(req, timeout=5) as r:
            img_ctype, img_body = r.headers.get("Content-Type", ""), r.read()
        report(img_ctype.startswith("image/svg") and img_body == svg.read_bytes(),
               "V7b <img> fetch of PDF serves SVG sibling", img_ctype)
        req = urllib.request.Request(f"{base}/tree.pdf",
                                     headers={"Sec-Fetch-Dest": "document"})
        with urllib.request.urlopen(req, timeout=5) as r:
            doc_ctype = r.headers.get("Content-Type", "")
        report(doc_ctype == "application/pdf",
               "V7c link fetch of PDF still serves the PDF", doc_ctype)

        # V6: allowlist still refuses paths outside any known directory
        stray = work / "stray.png"
        stray.write_bytes(png.read_bytes())
        status, _, _ = http(f"{base}/api/preview-image?path={quote(str(stray))}")
        report(status == 403, "V6 preview-image refuses unrelated dir", str(status))

    finally:
        if server is not None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()

    print(f"\n{PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
