#!/usr/bin/env python3
"""Color-theory audit — 8 themes × rendered markdown elements (stdlib only).

Measures what the stylesheet actually puts on screen: every (foreground,
surface) pair a rendered element uses, with rgba washes composited against
their true underlying surface before anything is measured. Reports:

  P0  contrast failure on a primary reading surface (body, links, code)
  P1  contrast failure on secondary elements (badges, zebra, footnotes,
      annotation text-on-wash, syntax tokens)
  P2  structural/consistency findings (surface-ramp order, accent
      collisions, paired-theme chroma drift, incomplete light-theme
      override groups, hardcoded rgba regressions)
  P3  nits

Exit code 1 when any P0 exists — wire into scripts/verify/ as a gate.

Usage: python3 scripts/color-audit/audit.py [--json]
"""

from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CSS_DIR = ROOT / "dabarat" / "static" / "css"
THEME_CSS = CSS_DIR / "theme-variables.css"

THEMES = ["mocha", "latte", "rose-pine", "rose-pine-dawn",
          "tokyo-storm", "ink", "vellum", "tokyo-light"]
LIGHT_THEMES = {"latte", "vellum", "rose-pine-dawn", "tokyo-light"}
THEME_PAIRS = [("ink", "vellum"), ("mocha", "latte"),
               ("rose-pine", "rose-pine-dawn"), ("tokyo-storm", "tokyo-light")]

ACCENTS = ["rosewater", "flamingo", "pink", "mauve", "red", "maroon", "peach",
           "yellow", "green", "teal", "sky", "sapphire", "blue", "lavender"]

# ── Theme parsing ────────────────────────────────────────────────────────

def parse_themes(css_text):
    """[data-theme] blocks → {theme: {token: raw value}}. Mocha doubles as :root."""
    # Strip comments first — token-like text inside /* */ would otherwise
    # swallow the real declaration that follows it.
    css_text = re.sub(r"/\*.*?\*/", "", css_text, flags=re.S)
    themes = {}
    for m in re.finditer(r'((?::root|\[data-theme="[a-z-]+"\])'
                         r'(?:\s*,\s*\[data-theme="[a-z-]+"\])*)\s*\{([^}]*)\}',
                         css_text):
        selectors, body = m.group(1), m.group(2)
        names = re.findall(r'\[data-theme="([a-z-]+)"\]', selectors)
        if ":root" in selectors:
            # :root tokens cascade to every theme as defaults. Relies on the
            # :root block preceding all [data-theme] blocks in the file —
            # later blocks update() over earlier ones, mirroring the cascade.
            names = THEMES
        tokens = dict(re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', body))
        for name in names:
            themes.setdefault(name, {}).update(
                {k: v.strip() for k, v in tokens.items()})
    return themes


def resolve_color(tokens, spec, depth=0):
    """A CSS color spec → (r, g, b, a) floats, following var() chains."""
    if depth > 8:
        raise ValueError(f"var() chain too deep: {spec}")
    spec = spec.strip()
    if spec.startswith("--"):
        return resolve_color(tokens, tokens[spec], depth + 1)
    m = re.fullmatch(r"var\((--[\w-]+)\)", spec)
    if m:
        return resolve_color(tokens, tokens[m.group(1)], depth + 1)
    m = re.fullmatch(r"#([0-9a-fA-F]{6})", spec)
    if m:
        h = m.group(1)
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 1.0)
    m = re.fullmatch(r"rgba\(\s*var\((--[\w-]+)\)\s*,\s*([\d.]+)\s*\)", spec)
    if m:
        r, g, b, _ = resolve_color(tokens, tokens[m.group(1)], depth + 1)
        return (r, g, b, float(m.group(2)))
    m = re.fullmatch(r"rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)", spec)
    if m:
        return tuple(float(v) for v in m.groups())
    m = re.fullmatch(r"([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)", spec)
    if m:  # bare rgb-companion triple
        return (*(float(v) for v in m.groups()), 1.0)
    raise ValueError(f"unparseable color spec: {spec!r}")


def composite(layers):
    """Bottom-up rgba layers → flattened opaque rgb."""
    r, g, b = layers[0][:3]
    for lr, lg, lb, la in layers[1:]:
        r = lr * la + r * (1 - la)
        g = lg * la + g * (1 - la)
        b = lb * la + b * (1 - la)
    return (r, g, b)

# ── Color math ───────────────────────────────────────────────────────────

def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb):
    r, g, b = rgb[:3]
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def wcag(fg, bg):
    l1, l2 = sorted((luminance(fg), luminance(bg)), reverse=True)
    return (l1 + 0.05) / (l2 + 0.05)


def apca_lc(fg, bg):
    """APCA-W3 0.0.98G lightness contrast (absolute Lc)."""
    def sc(rgb):
        r, g, b = (c / 255.0 for c in rgb[:3])
        y = (0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.0721750 * b ** 2.4)
        return (y + (0.022 - y) ** 1.414) if y < 0.022 else y
    ytx, ybg = sc(fg), sc(bg)
    if abs(ybg - ytx) < 0.0005:
        return 0.0
    if ybg > ytx:  # dark text on light bg
        lc = (ybg ** 0.56 - ytx ** 0.57) * 1.14
        lc = 0.0 if lc < 0.1 else lc - 0.027
    else:          # light text on dark bg
        lc = (ybg ** 0.65 - ytx ** 0.62) * 1.14
        lc = 0.0 if lc > -0.1 else lc + 0.027
    return abs(lc * 100)


def rgb_to_lab(rgb):
    r, g, b = (_lin(c) for c in rgb[:3])
    x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
    y = (r * 0.2126 + g * 0.7152 + b * 0.0722)
    z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def delta_e(rgb1, rgb2):
    """CIE76 — adequate for collision detection."""
    return math.dist(rgb_to_lab(rgb1), rgb_to_lab(rgb2))


def chroma(rgb):
    _, a, b = rgb_to_lab(rgb)
    return math.hypot(a, b)

# ── The used-pairs list — what the stylesheet actually renders ───────────
# (element, fg spec, [surface layers bottom-up], WCAG threshold, fail tier)

BASE = "var(--ctp-base)"
MANTLE = "var(--ctp-mantle)"
SURFACE0 = "var(--ctp-surface0)"
CRUST = "var(--ctp-crust)"
CARD = "var(--card-bg)"

USED_PAIRS = [
    # Primary reading surfaces → P0 on failure
    ("body text",            "var(--ctp-text)",       [BASE], 4.5, "P0"),
    ("link",                 "var(--ctp-blue)",       [BASE], 4.5, "P0"),
    ("link hover",           "var(--ctp-lavender)",   [BASE], 4.5, "P0"),
    ("link visited",         "var(--link-visited)",   [BASE], 4.5, "P0"),
    ("bold",                 "var(--bold-color)",     [BASE], 4.5, "P0"),
    ("italic",               "var(--italic-color)",   [BASE], 4.5, "P0"),
    ("inline code",          "var(--code-fg)",        [SURFACE0], 4.5, "P0"),
    ("code block text",      "var(--ctp-text)",       [MANTLE], 4.5, "P0"),
    ("blockquote",           "var(--blockquote-color)",
     [BASE, "var(--blockquote-bg)"], 4.5, "P0"),

    # Headings render 18px+ semibold → 3:1 large-text threshold
    ("h1/h2",                "var(--ctp-blue)",       [BASE], 3.0, "P1"),
    ("h3",                   "var(--h3-color)",       [BASE], 3.0, "P1"),
    ("h4",                   "var(--h4-color)",       [BASE], 3.0, "P1"),
    ("h5",                   "var(--h5-color)",       [BASE], 3.0, "P1"),
    ("h6 (small-caps)",      "var(--ctp-subtext1)",   [BASE], 4.5, "P1"),

    # Syntax role tokens on the pre background
    ("hljs keyword",         "var(--hljs-keyword)",     [MANTLE], 4.5, "P1"),
    ("hljs string",          "var(--hljs-string)",      [MANTLE], 4.5, "P1"),
    ("hljs number",          "var(--hljs-number)",      [MANTLE], 4.5, "P1"),
    ("hljs comment",         "var(--hljs-comment)",     [MANTLE], 4.5, "P1"),
    ("hljs function",        "var(--hljs-function)",    [MANTLE], 4.5, "P1"),
    ("hljs built_in",        "var(--hljs-built-in)",    [MANTLE], 4.5, "P1"),
    ("hljs type",            "var(--hljs-type)",        [MANTLE], 4.5, "P1"),
    ("hljs operator",        "var(--hljs-operator)",    [MANTLE], 4.5, "P1"),
    ("hljs punctuation",     "var(--hljs-punctuation)", [MANTLE], 4.5, "P1"),
    ("hljs symbol",          "var(--hljs-symbol)",      [MANTLE], 4.5, "P1"),
    ("hljs params",          "var(--hljs-params)",      [MANTLE], 4.5, "P1"),
    ("hljs meta",            "var(--hljs-meta)",        [MANTLE], 4.5, "P1"),
    # Frontmatter modal field grid (frontmatter.css .fm-popup-fields) —
    # the same role tokens, but the modal body is --ctp-base, not mantle
    ("fm field key",         "var(--hljs-keyword)",     [BASE], 4.5, "P1"),
    ("fm field literal",     "var(--hljs-number)",      [BASE], 4.5, "P1"),
    ("fm field link",        "var(--hljs-function)",    [BASE], 4.5, "P1"),
    ("fm nested key",        "var(--hljs-params)",      [BASE], 4.5, "P1"),

    # Tables
    ("table header",         "var(--ctp-blue)",       [MANTLE], 4.5, "P1"),
    ("table zebra row",      "var(--ctp-text)",
     [BASE, "var(--row-even-bg)"], 4.5, "P1"),
    ("table hover row",      "var(--ctp-text)",
     [BASE, "var(--row-hover-bg)"], 4.5, "P1"),

    # Secondary text
    ("footnote text",        "var(--ctp-subtext0)",   [BASE], 4.5, "P1"),
    # overlay1 text is the WHISPER TIER — deliberately de-emphasized, waived
    # from AA by decision (2026-08-05); tracked so drift stays visible
    ("footnote backref",     "var(--ctp-overlay1)",   [BASE], 4.5, "WAIVED"),
    ("figcaption",           "var(--ctp-overlay1)",   [BASE], 4.5, "WAIVED"),
    ("list marker",          "var(--ctp-overlay1)",   [BASE], 3.0, "WAIVED"),

    # Annotation text over its wash (wash alphas from annotations.css)
    ("annotation comment",   "var(--ctp-text)",
     [BASE, "rgba(var(--ctp-yellow-rgb), 0.25)"], 4.5, "P1"),
    ("annotation question",  "var(--ctp-text)",
     [BASE, "rgba(var(--ctp-blue-rgb), 0.20)"], 4.5, "P1"),
    ("annotation suggestion", "var(--ctp-text)",
     [BASE, "rgba(var(--ctp-green-rgb), 0.20)"], 4.5, "P1"),
    ("annotation important", "var(--ctp-text)",
     [BASE, "rgba(var(--ctp-peach-rgb), 0.20)"], 4.5, "P1"),
    ("annotation bookmark",  "var(--ctp-text)",
     [BASE, "rgba(var(--ctp-mauve-rgb), 0.20)"], 4.5, "P1"),

    # Template variable pills (frontmatter.css)
    ("template pill {{}}",   "var(--tpl-pill-mustache)",
     [BASE, "rgba(var(--ctp-mauve-rgb), 0.18)"], 4.5, "P1"),
    ("template pill ${}",    "var(--tpl-pill-dollar)",
     [BASE, "rgba(var(--ctp-teal-rgb), 0.18)"], 4.5, "P1"),

    # Editor selection wash
    ("selection (editor)",   "var(--ctp-text)",
     [BASE, "rgba(var(--ctp-blue-rgb), 0.25)"], 4.5, "P1"),

    # Home cards (card surface differs from base in light themes)
    ("card filename",        "var(--ctp-text)",       [CARD], 4.5, "P1"),
    ("card summary",         "var(--ctp-subtext0)",   [CARD], 4.5, "P1"),

    # Home role tokens — "everything readable" (2026-08-19): all
    # informational text and interactive controls pass 4.5:1. The whisper
    # waiver on home survives ONLY for hover-revealed ghost controls.
    ("home meta (base)",     "var(--home-meta)",      [BASE], 4.5, "P1"),
    ("home meta (card)",     "var(--home-meta)",      [CARD], 4.5, "P1"),
    ("home control (base)",  "var(--home-control)",   [BASE], 4.5, "P1"),
    ("home control (card)",  "var(--home-control)",   [CARD], 4.5, "P1"),
    ("home card icon",       "var(--home-icon)",      [CARD], 3.0, "P1"),
    ("home ghost control",   "var(--ctp-overlay0)",   [CARD], 4.5, "WAIVED"),

    # Badge text over its accent wash on the card (alphas from home.css;
    # both alphas audited for hues used at .15 and .18)
    ("badge blue .15",       "var(--badge-blue-fg)",
     [CARD, "rgba(var(--ctp-blue-rgb), 0.15)"], 4.5, "P1"),
    ("badge blue .18",       "var(--badge-blue-fg)",
     [CARD, "rgba(var(--ctp-blue-rgb), 0.18)"], 4.5, "P1"),
    ("badge mauve .15",      "var(--badge-mauve-fg)",
     [CARD, "rgba(var(--ctp-mauve-rgb), 0.15)"], 4.5, "P1"),
    ("badge mauve .18",      "var(--badge-mauve-fg)",
     [CARD, "rgba(var(--ctp-mauve-rgb), 0.18)"], 4.5, "P1"),
    ("badge green .15",      "var(--badge-green-fg)",
     [CARD, "rgba(var(--ctp-green-rgb), 0.15)"], 4.5, "P1"),
    ("badge green .18",      "var(--badge-green-fg)",
     [CARD, "rgba(var(--ctp-green-rgb), 0.18)"], 4.5, "P1"),
    ("badge peach .15",      "var(--badge-peach-fg)",
     [CARD, "rgba(var(--ctp-peach-rgb), 0.15)"], 4.5, "P1"),
    ("badge peach .18",      "var(--badge-peach-fg)",
     [CARD, "rgba(var(--ctp-peach-rgb), 0.18)"], 4.5, "P1"),
    ("badge yellow .18",     "var(--badge-yellow-fg)",
     [CARD, "rgba(var(--ctp-yellow-rgb), 0.18)"], 4.5, "P1"),
    ("badge sky .18",        "var(--badge-sky-fg)",
     [CARD, "rgba(var(--ctp-sky-rgb), 0.18)"], 4.5, "P1"),
    ("badge teal .18",       "var(--badge-teal-fg)",
     [CARD, "rgba(var(--ctp-teal-rgb), 0.18)"], 4.5, "P1"),
    ("badge flamingo .18",   "var(--badge-flamingo-fg)",
     [CARD, "rgba(var(--ctp-flamingo-rgb), 0.18)"], 4.5, "P1"),
    ("badge lavender .18",   "var(--badge-lavender-fg)",
     [CARD, "rgba(var(--ctp-lavender-rgb), 0.18)"], 4.5, "P1"),
    ("badge neutral .18",    "var(--badge-neutral-fg)",
     [CARD, "rgba(var(--ctp-overlay1-rgb), 0.18)"], 4.5, "P1"),

    # Version panel (mantle surface)
    ("timeline date",        "var(--ctp-subtext0)",   [MANTLE], 4.5, "P1"),
    ("timeline +stat",       "var(--stat-add)",       [MANTLE], 4.5, "P1"),
    ("timeline -stat",       "var(--stat-del)",       [MANTLE], 4.5, "P1"),
    # Change-excerpt box: surface0 wash at 0.6 over the panel's mantle
    ("excerpt context line", "var(--ctp-subtext1)",
     [MANTLE, "rgba(var(--ctp-surface0-rgb), 0.6)"], 4.5, "P1"),
    ("excerpt +line",        "var(--stat-add)",
     [MANTLE, "rgba(var(--ctp-surface0-rgb), 0.6)"], 4.5, "P1"),
    ("excerpt -line",        "var(--stat-del)",
     [MANTLE, "rgba(var(--ctp-surface0-rgb), 0.6)"], 4.5, "P1"),
    ("diff stat +",          "var(--stat-add)",       [CRUST], 4.5, "P1"),
    ("diff stat -",          "var(--stat-del)",       [CRUST], 4.5, "P1"),
    ("diff stat ~",          "var(--stat-chg)",       [CRUST], 4.5, "P1"),
    ("external badge",       "var(--external-badge-fg)",
     [MANTLE, "rgba(var(--ctp-peach-rgb), 0.12)"], 4.5, "P1"),
    # Chip renders crust-on-blue on dark themes, text-on-wash on light ones
    ("history chip",         "var(--ctp-crust)",      ["var(--ctp-blue)"], 4.5, "P1",
     {"mocha", "rose-pine", "tokyo-storm", "ink"}),
    ("history chip",         "var(--ctp-text)",
     [BASE, "rgba(var(--ctp-blue-rgb), 0.18)"], 4.5, "P1", LIGHT_THEMES),
]

# ── Checks ───────────────────────────────────────────────────────────────

def contrast_findings(themes):
    findings = []
    for theme in THEMES:
        tokens = themes[theme]
        for pair in USED_PAIRS:
            element, fg_spec, layers, threshold, tier = pair[:5]
            if len(pair) == 6 and theme not in pair[5]:
                continue
            try:
                fg = resolve_color(tokens, fg_spec)
                bg = composite([resolve_color(tokens, s) for s in layers])
            except (KeyError, ValueError) as exc:
                findings.append({"tier": "P2", "theme": theme, "element": element,
                                 "kind": "unresolvable", "detail": str(exc)})
                continue
            # Text drawn at partial alpha composites onto its surface first
            if fg[3] < 1.0:
                fg = (*composite([bg + (1.0,), fg]), 1.0)
            ratio = wcag(fg, bg)
            lc = apca_lc(fg, bg)
            if ratio < threshold:
                findings.append({
                    "tier": tier, "theme": theme, "element": element,
                    "kind": "waived-whisper" if tier == "WAIVED" else "contrast",
                    "detail": f"{ratio:.2f}:1 (needs {threshold}:1, APCA Lc {lc:.0f})",
                    "fg": fg_spec, "surface": " over ".join(layers),
                })
            elif tier != "WAIVED" and ratio < threshold + 0.35:
                findings.append({
                    "tier": "P3", "theme": theme, "element": element,
                    "kind": "contrast-margin",
                    "detail": f"{ratio:.2f}:1 — passes {threshold}:1 by <0.35",
                })
    return findings


def ramp_findings(themes):
    """Depth order must be luminance-monotonic. Dark themes recede below the
    base and surfaces rise above it (crust < mantle < base < surface0-2);
    light themes invert both halves (base > mantle > crust > surface0-2)."""
    findings = []
    for theme in THEMES:
        tokens = themes[theme]
        if theme in LIGHT_THEMES:
            ramp = ["--ctp-base", "--ctp-mantle", "--ctp-crust",
                    "--ctp-surface0", "--ctp-surface1", "--ctp-surface2"]
        else:
            ramp = ["--ctp-crust", "--ctp-mantle", "--ctp-base",
                    "--ctp-surface0", "--ctp-surface1", "--ctp-surface2"]
        lums = [luminance(resolve_color(tokens, t)) for t in ramp]
        pairs = list(zip(lums, lums[1:]))
        ordered = all(a > b for a, b in pairs) if theme in LIGHT_THEMES \
            else all(a < b for a, b in pairs)
        if not ordered:
            findings.append({
                "tier": "P2", "theme": theme, "element": "surface ramp",
                "kind": "ramp-order",
                "detail": "luminance not monotonic in depth order: "
                          + ", ".join(f"{t.split('-')[-1]}={l:.3f}"
                                      for t, l in zip(ramp, lums)),
            })
    return findings


def accent_findings(themes):
    findings = []
    for theme in THEMES:
        tokens = themes[theme]
        rgbs = {a: resolve_color(tokens, f"--ctp-{a}") for a in ACCENTS}
        seen = set()
        for i, a in enumerate(ACCENTS):
            for b in ACCENTS[i + 1:]:
                de = delta_e(rgbs[a], rgbs[b])
                if de < 10 and (a, b) not in seen:
                    seen.add((a, b))
                    findings.append({
                        "tier": "P2", "theme": theme,
                        "element": f"accents {a}/{b}",
                        "kind": "accent-collision",
                        "detail": f"ΔE {de:.1f} — visually "
                                  + ("identical" if de < 2.5 else "adjacent"),
                    })
    return findings


def chroma_parity_findings(themes):
    findings = []
    for dark, light in THEME_PAIRS:
        cd = sum(chroma(resolve_color(themes[dark], f"--ctp-{a}"))
                 for a in ACCENTS) / len(ACCENTS)
        cl = sum(chroma(resolve_color(themes[light], f"--ctp-{a}"))
                 for a in ACCENTS) / len(ACCENTS)
        drift = abs(cd - cl)
        if drift > 18:
            findings.append({
                "tier": "P2", "theme": f"{dark}↔{light}",
                "element": "accent chroma parity", "kind": "chroma-drift",
                "detail": f"mean accent chroma {cd:.0f} (dark) vs {cl:.0f} "
                          f"(light) — Δ{drift:.0f}",
            })
    return findings


def override_findings():
    """Selector groups naming ≥1 light theme must name all 4 (CLAUDE.md rule)."""
    findings = []
    for css in sorted(CSS_DIR.glob("*.css")):
        if css.name == "theme-variables.css":
            continue  # per-theme definition blocks are single-theme by design
        text = css.read_text(encoding="utf-8")
        for m in re.finditer(r'([^{}]+)\{', text):
            selectors = m.group(1)
            named = set(re.findall(r'\[data-theme="([a-z-]+)"\]', selectors))
            light_named = named & LIGHT_THEMES
            if light_named and light_named != LIGHT_THEMES:
                line = text[:m.start()].count("\n") + 1
                missing = sorted(LIGHT_THEMES - light_named)
                findings.append({
                    "tier": "P2", "theme": ",".join(sorted(light_named)),
                    "element": f"{css.name}:{line}",
                    "kind": "incomplete-override",
                    "detail": f"light-theme override missing {missing}",
                })
    return findings


def hardcoded_rgba_findings():
    allowed = re.compile(
        r"rgba\(\s*(0\s*,\s*0\s*,\s*0|255\s*,\s*255\s*,\s*255|"
        r"128\s*,\s*128\s*,\s*128|70\s*,\s*48\s*,\s*20)\s*,")
    findings = []
    for css in sorted(CSS_DIR.glob("*.css")):
        text = css.read_text(encoding="utf-8")
        for m in re.finditer(r"rgba\(\s*\d[\d\s,.]*\)", text):
            if allowed.match(m.group(0)):
                continue
            line = text[:m.start()].count("\n") + 1
            findings.append({
                "tier": "P2", "theme": "all",
                "element": f"{css.name}:{line}",
                "kind": "hardcoded-rgba",
                "detail": m.group(0),
            })
    return findings

# ── Report ───────────────────────────────────────────────────────────────

def main():
    themes = parse_themes(THEME_CSS.read_text(encoding="utf-8"))
    missing = [t for t in THEMES if t not in themes]
    if missing:
        print(f"FATAL: themes not found in {THEME_CSS.name}: {missing}")
        return 1

    findings = (contrast_findings(themes) + ramp_findings(themes)
                + accent_findings(themes) + chroma_parity_findings(themes)
                + override_findings() + hardcoded_rgba_findings())
    findings.sort(key=lambda f: (f["tier"], f["theme"], f["element"]))

    if "--json" in sys.argv:
        print(json.dumps(findings, indent=2))
    else:
        counts = {t: sum(1 for f in findings if f["tier"] == t)
                  for t in ("P0", "P1", "P2", "P3", "WAIVED")}
        print("Color audit — 8 themes × markdown elements")
        print(f"  P0={counts['P0']}  P1={counts['P1']}  "
              f"P2={counts['P2']}  P3={counts['P3']}  "
              f"waived={counts['WAIVED']} (whisper tier)\n")
        for tier in ("P0", "P1", "P2", "P3", "WAIVED"):
            rows = [f for f in findings if f["tier"] == tier]
            if not rows:
                continue
            print(f"── {tier} " + "─" * 50)
            for f in rows:
                extra = f" [{f['fg']} on {f['surface']}]" if "fg" in f else ""
                print(f"  {f['theme']:<22} {f['element']:<24} "
                      f"{f['kind']:<19} {f['detail']}{extra}")
            print()

    return 1 if any(f["tier"] == "P0" for f in findings) else 0


if __name__ == "__main__":
    sys.exit(main())
