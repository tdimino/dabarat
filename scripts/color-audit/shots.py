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

# Home-screen fixtures — filenames chosen to trigger every smart badge hue
# (home.js _fileBadges) plus one frontmatter-badge card. (name, body, tags,
# version commits) — versions >0 makes the footer version counter render.
_FM = ("---\ntype: prompt\nmodel: claude-fable-5\nversion: 2.1\n"
       "status: active\n---\n\n")
HOME_FIXTURES = [
    ("alpha.prompt.md", _FM + "# Alpha Prompt\n\nSummon the muse of the "
     "wine-dark sea. This card carries frontmatter badges and the prompt "
     "badge together, exercising five washes at once.", ["prompt"], 3),
    ("CHANGELOG.md", "# Changelog\n\nAll notable changes to the fixture "
     "corpus are recorded here in reverse chronological order.", [], 2),
    ("README.md", "# Readme\n\nThe fixture corpus exists so the home grid "
     "renders every badge hue against every theme.", ["docs"], 0),
    ("LICENSE.md", "# License\n\nCopying is permitted under the usual "
     "terms; the neutral badge wash renders on this card.", [], 0),
    ("plan-sprint.md", "# Sprint Plan\n\nA plan-badged card: the sky wash "
     "over the card surface in all eight themes.", ["sprint"], 1),
    ("research-dossier.md", "# Research Dossier\n\nA research-badged card "
     "carrying the lavender wash.", [], 0),
    ("TODO.md", "# Todo\n\nA todo-badged card carrying the peach wash.",
     [], 0),
    ("SPEC.md", "# Spec\n\nA spec-badged card carrying the teal wash.",
     [], 0),
    ("architecture.md", "# Architecture\n\nAn architecture-badged card "
     "carrying the flamingo wash.", [], 0),
    ("CLAUDE.md", "# Agent Config\n\nAn agent-badged card carrying the "
     "mauve wash.", [], 0),
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

        # Seed recent.json (and the isolated versions.db) through the real
        # write paths so the home screen renders honest cards.
        for name, body, tags, versions in HOME_FIXTURES:
            (work / name).write_text(body, encoding="utf-8")
        seed_code = (
            "import json, sys\n"
            "import dabarat.history as h\n"
            f"h.HISTORY_DIR = {str(work / 'history')!r}\n"
            f"h.DB_PATH = {str(work / 'versions.db')!r}\n"
            "import dabarat.recent as r\n"
            f"r.RECENT_FILE = {str(work / 'recent.json')!r}\n"
            "for path, tags, versions in json.loads(sys.argv[1]):\n"
            "    body = open(path, encoding='utf-8').read()\n"
            "    for i in range(versions):\n"
            "        h.commit(path, body + '\\n' * i, source='save')\n"
            "    r.add_entry(path, body, tags)\n"
        )
        import json as _json
        seed_specs = _json.dumps(
            [[str(work / name), tags, versions]
             for name, _, tags, versions in reversed(HOME_FIXTURES)])
        result = subprocess.run(
            [sys.executable, "-c", seed_code, seed_specs],
            cwd=ROOT, capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            print(f"FATAL: home-fixture seed failed "
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
        # DEVNULL, not PIPE — nothing reads the pipe, and a chatty server
        # filling the buffer would deadlock the run
        server = subprocess.Popen(
            [sys.executable, "-u", "-c", launch_code, str(doc),
             "--port", str(port), "--max-instances", "99"],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            base = f"http://127.0.0.1:{port}"
            wait_http(base + "/api/tabs")
            shot_matrix = (
                [(t, f"{t}.png", "", 3400) for t in THEMES]
                # Home pass — ?home=1 forces the home screen (seeded
                # recent.json renders the badge/meta/control matrix)
                + [(t, f"home-{t}.png", "&home=1", 2200) for t in THEMES]
            )
            failures = 0
            for theme, fname, extra, height in shot_matrix:
                out = SHOTS / fname
                url = f"{base}/?theme={theme}&export=1{extra}"
                result = subprocess.run(
                    [chrome, "--headless=new", f"--screenshot={out}",
                     f"--window-size=1280,{height}", "--hide-scrollbars",
                     "--virtual-time-budget=9000",
                     "--disable-gpu", url],
                    capture_output=True, timeout=60,
                )
                ok = out.exists() and out.stat().st_size > 10000
                if not ok:
                    failures += 1
                print(f"  {fname:<26} "
                      f"{'ok' if ok else f'FAILED rc={result.returncode}'}")
        finally:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
    print(f"shots → {SHOTS}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
