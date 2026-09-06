#!/usr/bin/env python3
"""Phase 17 — design-token discipline + stylesheet integrity (static, no server).

Guards the 2026-09 token pass (`docs/plans/2026-09-06-001-…`): shadows,
z-index, radii, durations, and easings live in `theme-variables.css`;
every module consumes them by name. Reuses the color-audit engine
(`scripts/color-audit/audit.py`) for the resolves-in-every-theme and
light-theme-override checks so the two nets can never disagree.

V1  no neutral rgba() box-shadow literals outside theme-variables.css
V2  no z-index literal ≥ 10 outside theme-variables.css (local 0–5 stacking ok)
V3  no px border-radius literals outside theme-variables.css (0 / 50% ok)
V4  no literal duration or `all` in any `transition:` (animations exempt)
V5  every var(--x) resolves in every theme (audit.undefined_var_findings)
V6  every light-theme override group names all four light themes
V7  no hardcoded hex/named colors outside the documented exceptions
V8  THEME_PREVIEW / SURFACE_COLORS hand-copied palette tables are gone
V9  editor.css carries no duplicate prose heading rules (typography is
    global; .ProseMirror inherits it)
V10 every token family the sweep introduced is defined in :root
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSS_DIR = ROOT / "dabarat" / "static" / "css"
STATIC = ROOT / "dabarat" / "static"
sys.path.insert(0, str(ROOT / "scripts" / "color-audit"))
import audit  # noqa: E402

PASS = FAIL = 0


def report(ok: bool, name: str, detail: str = "") -> None:
    global PASS, FAIL
    PASS += ok
    FAIL += (not ok)
    print(f"  {'✓' if ok else '✗'} {name}" + (f" — {detail}" if detail else ""))


def _modules():
    for css in sorted(CSS_DIR.glob("*.css")):
        if css.name != "theme-variables.css":
            yield css, css.read_text(encoding="utf-8")


def _strip_comments(text: str) -> str:
    # keep newlines so line numbers survive
    return re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)


def _sites(pattern: str, flags=0):
    hits = []
    for css, raw in _modules():
        text = _strip_comments(raw)
        for m in re.finditer(pattern, text, flags):
            hits.append(f"{css.name}:{text[:m.start()].count(chr(10)) + 1}")
    return hits


def main() -> int:
    print("Phase 17 — design tokens + stylesheet integrity V1-V10")

    # V1 neutral shadow literals (elevation tokens own them)
    v1 = _sites(r"box-shadow:[^;]*rgba\(\s*(0\s*,\s*0\s*,\s*0|70\s*,\s*48\s*,\s*20)\s*,")
    report(not v1, "V1 no neutral rgba box-shadow literals outside theme-variables", ", ".join(v1[:5]))

    # V2 z-index literals ≥ 10 (layer tokens own them)
    v2 = [s for s in _sites(r"z-index:\s*(\d+)")]
    big = []
    for css, raw in _modules():
        text = _strip_comments(raw)
        for m in re.finditer(r"z-index:\s*(\d+)", text):
            if int(m.group(1)) >= 10:
                big.append(f"{css.name}:{text[:m.start()].count(chr(10)) + 1}={m.group(1)}")
    report(not big, "V2 no z-index literal ≥ 10 outside theme-variables", ", ".join(big[:5]) or f"{len(v2)} local stacking literals (<10)")

    # V3 radius literals
    v3 = _sites(r"border-radius:\s*[0-9.]+px")
    report(not v3, "V3 no px border-radius literals outside theme-variables", ", ".join(v3[:5]))

    # V4 transitions: no literal durations, no `all`
    v4 = _sites(r"transition:[^;]*(\b\d*\.?\d+m?s\b|\ball\b)")
    report(not v4, "V4 transitions carry no literal duration and no `all`", ", ".join(v4[:5]))

    themes = audit.parse_themes(audit.THEME_CSS.read_text(encoding="utf-8"))

    # V5 every var() resolves in every theme
    v5 = audit.undefined_var_findings(themes)
    report(not v5, "V5 every var(--x) resolves in every theme",
           ", ".join(f["detail"] for f in v5[:3]))

    # V6 light-theme override completeness
    v6 = audit.override_findings()
    report(not v6, "V6 every light-theme override group names all four light themes",
           ", ".join(f["element"] for f in v6[:5]))

    # V7 no hardcoded colors outside exceptions (audit tiers WAIVED rows separately)
    v7 = [f for f in audit.hardcoded_rgba_findings() if f["tier"] != "WAIVED"]
    report(not v7, "V7 no hardcoded hex/named/rgba colors outside documented exceptions",
           ", ".join(f["element"] for f in v7[:5]))

    # V8 hand-copied palette tables removed
    pal = (STATIC / "palette.js").read_text(encoding="utf-8")
    thm = (STATIC / "js" / "theme.js").read_text(encoding="utf-8")
    leftovers = [n for n in ("THEME_PREVIEW", "SURFACE_COLORS") if n in pal or n in thm]
    report(not leftovers, "V8 THEME_PREVIEW / SURFACE_COLORS tables gone (swatches computed at runtime)",
           ", ".join(leftovers))

    # V9 editor.css does not restate prose heading typography
    editor = _strip_comments((CSS_DIR / "editor.css").read_text(encoding="utf-8"))
    dup = re.findall(r"\.ProseMirror\s+h[1-6]\b[^{]*\{[^}]*(?:color|font-size|font-family)\s*:", editor)
    report(not dup, "V9 editor.css has no duplicate prose heading rules", f"{len(dup)} rule(s)")

    # V10 token families present in :root
    root = themes.get("mocha", {})  # parse_themes seeds :root into every theme
    families = ["--radius-xs", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl",
                "--radius-2xl", "--radius-pill", "--z-toc", "--z-panel", "--z-float",
                "--z-status", "--z-menu", "--z-banner", "--z-palette", "--z-modal",
                "--z-lightbox", "--z-overlay", "--dur-fast", "--dur-base", "--dur-mid",
                "--dur-slow", "--dur-slower", "--ease-standard", "--ease-out-back",
                "--ease-out-expo", "--elevation-1", "--elevation-2", "--font-sans",
                "--font-serif", "--font-mono", "--measure"]
    missing = [f for f in families if f not in root]
    report(not missing, "V10 every token family defined in :root", ", ".join(missing))

    print(f"PASS={PASS} FAIL={FAIL}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
