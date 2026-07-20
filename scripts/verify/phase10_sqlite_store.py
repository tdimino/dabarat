#!/usr/bin/env python3
"""Phase 10 verification — SQLite version store semantics (V1-V10).

Direct store-level checks: dedup, no-coalesce, cross-file isolation,
rename identity, pin/label, restore append-only semantics, size gate,
and one-time import from a synthetic legacy git repo.

Stdlib only. DB_PATH / HISTORY_DIR are patched into a temp dir so the
real ~/.dabarat state is never touched.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import dabarat.history as history


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


def git(args, cwd):
    return subprocess.run(["git"] + args, cwd=cwd, capture_output=True,
                          text=True, timeout=15)


def main() -> int:
    print("Phase 10 — SQLite store semantics V1-V10")
    with tempfile.TemporaryDirectory(prefix="dabarat-p10-") as work_name:
        work = Path(work_name)
        history.DB_PATH = str(work / "versions.db")
        history.HISTORY_DIR = str(work / "history")
        history._import_checked = False

        doc = work / "doc.md"
        other = work / "other.md"
        doc.write_text("alpha\n", encoding="utf-8")
        other.write_text("other file\n", encoding="utf-8")

        # ── Legacy import: synthesize a git repo the way old history.py did
        legacy_content = ["legacy v1\n", "legacy v2 with more\n"]
        os.makedirs(history.HISTORY_DIR)
        git(["init"], history.HISTORY_DIR)
        git(["config", "user.name", "dabarat"], history.HISTORY_DIR)
        git(["config", "user.email", "system@dabarat"], history.HISTORY_DIR)
        import hashlib
        key = hashlib.sha256(str(doc).encode()).hexdigest()[:12]
        tracked = Path(history.HISTORY_DIR) / f"{key}_doc.md"
        for body in legacy_content:
            tracked.write_text(body, encoding="utf-8")
            git(["add", "--", tracked.name], history.HISTORY_DIR)
            git(["commit", "-m", "doc.md | +1/-0 | test"], history.HISTORY_DIR)
        # recent.json makes the path discoverable to the importer
        (work / "recent.json").write_text(
            '{"entries": [{"path": "%s"}]}' % doc, encoding="utf-8")

        # V1/V2: first store access imports legacy versions with source=import
        versions = history.list_versions(str(doc))
        imported = [v for v in versions if v["source"] == "import"]
        report(len(imported) == 2, "V1 legacy git history imported",
               f"got {len(imported)} imported of {len(versions)}")
        contents = {history.get_version_content(str(doc), v["hash"])
                    for v in versions}
        report(set(legacy_content) <= contents,
               "V2 imported version contents match legacy commits")

        # V3: import is idempotent — a second pass adds nothing
        history._import_checked = False
        count = len(history.list_versions(str(doc)))
        report(count == len(versions), "V3 import idempotent on re-check")

        # V4: no coalescing — rapid distinct saves are distinct versions
        ref_a = history.commit(str(doc), content="alpha\n")
        ref_b = history.commit(str(doc), content="beta\n")
        report(ref_a != ref_b and ref_a and ref_b,
               "V4 rapid distinct saves create distinct versions")

        # V5: dedup — identical consecutive content returns the same ref
        ref_b2 = history.commit(str(doc), content="beta\n")
        report(ref_b2 == ref_b, "V5 identical consecutive save dedups")

        # V6: cross-file isolation — doc's ref is unreadable via other.md
        history.commit(str(other), content="other v1\n")
        leaked = history.get_version_content(str(other), ref_b)
        report(leaked is None, "V6 version refs are scoped to their file")

        # V7: restore appends, disk matches, source recorded
        before = len(history.list_versions(str(doc)))
        doc.write_text("beta\n", encoding="utf-8")
        restored = history.restore(str(doc), ref_a)
        after_versions = history.list_versions(str(doc))
        report(restored == "alpha\n"
               and doc.read_text(encoding="utf-8") == "alpha\n"
               and len(after_versions) > before
               and after_versions[0]["source"] == "restore",
               "V7 restore rewrites disk and appends a restore-tagged version")

        # V8: rename carries identity — history follows the new path
        renamed = work / "renamed.md"
        os.rename(doc, renamed)
        history.record_rename(str(doc), str(renamed))
        report(len(history.list_versions(str(renamed))) == len(after_versions),
               "V8 rename preserves full history under new path")

        # V9: pin + label round-trip through list_versions
        history.set_pinned(str(renamed), ref_a, True)
        history.set_label(str(renamed), ref_a, "before revision")
        tagged = {v["hash"]: v for v in history.list_versions(str(renamed))}
        report(tagged[ref_a]["pinned"] is True
               and tagged[ref_a]["label"] == "before revision",
               "V9 pin and label persist and surface in listings")

        # V10: oversized content is skipped, not stored
        big = "x" * (history.MAX_VERSION_BYTES + 1)
        ref_big = history.commit(str(renamed), content=big)
        report(ref_big == "" and len(history.list_versions(str(renamed))) == len(after_versions),
               "V10 oversized content skips versioning with empty ref")

        # V11: a NEW file created at the pre-rename path gets a fresh
        # identity — it must not inherit the renamed document's history
        doc.write_text("a brand new unrelated file\n", encoding="utf-8")
        history.commit(str(doc), content="a brand new unrelated file\n")
        fresh = history.list_versions(str(doc))
        report(len(fresh) == 1 and fresh[0]["source"] == "save",
               "V11 path reuse after rename does not inherit old history",
               f"got {len(fresh)} versions")

    print(f"PASS={PASS} FAIL={FAIL}")
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
