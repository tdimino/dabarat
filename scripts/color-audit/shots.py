#!/usr/bin/env python3
"""Screenshot matrix — fixture.md rendered in all 8 themes (stdlib + Chrome).

Launches a private dabarat instance on the fixture (isolated versions.db and
recent.json so the user's real state is untouched), annotates five passages
through the real CLI write path, then captures one full-page screenshot per
theme into shots/. Eyeball companion to audit.py.

Usage: python3 scripts/color-audit/shots.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dabarat import pdf_export

HERE = Path(__file__).resolve().parent
SHOTS = HERE / "shots"
THEMES = ["mocha", "latte", "rose-pine", "rose-pine-dawn",
          "tokyo-storm", "ink", "vellum", "tokyo-light"]

ANNOTATIONS = [
    ("comment",    "passage annotated as a\ncomment"),
    ("question",   "passage annotated as a question"),
    ("suggestion", "passage annotated as a suggestion"),
    ("important",  "passage flagged important"),
    ("bookmark",   "bookmarked passage"),
]


def wait_http(url, timeout=15.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0):
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError(f"server not ready: {url}")


def main():
    chrome = pdf_export._find_chrome()
    if not chrome:
        print("FATAL: Chrome not found")
        return 1
    port = pdf_export._find_free_port()
    SHOTS.mkdir(exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="dabarat-shots-") as work_name:
        work = Path(work_name)
        doc = work / "fixture.md"
        shutil.copy(HERE / "fixture.md", doc)

        # Annotate through the real write path so the sidecar schema is honest.
        # A silent failure here yields wash-free screenshots that read as a
        # clean pass, so a bad returncode is loud and fatal.
        for ann_type, text in ANNOTATIONS:
            result = subprocess.run(
                [sys.executable, "-m", "dabarat", "--annotate", str(doc),
                 "--text", text.replace("\n", " "),
                 "--comment", f"{ann_type} wash sample", "--type", ann_type],
                cwd=ROOT, capture_output=True, text=True, timeout=30,
            )
            if result.returncode != 0:
                print(f"FATAL: --annotate {ann_type} failed "
                      f"(rc={result.returncode}):\n{result.stderr.strip()}")
                return 1

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
             "--port", str(port), "--max-instances", "99"],
            cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            base = f"http://127.0.0.1:{port}"
            wait_http(base + "/api/tabs")
            for theme in THEMES:
                out = SHOTS / f"{theme}.png"
                url = f"{base}/?theme={theme}&export=1"
                result = subprocess.run(
                    [chrome, "--headless=new", f"--screenshot={out}",
                     "--window-size=1280,3400", "--hide-scrollbars",
                     "--virtual-time-budget=9000",
                     "--disable-gpu", url],
                    capture_output=True, timeout=60,
                )
                status = "ok" if out.exists() and out.stat().st_size > 10000 \
                    else f"FAILED rc={result.returncode}"
                print(f"  {theme:<16} {status}")
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
    print(f"shots → {SHOTS}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
