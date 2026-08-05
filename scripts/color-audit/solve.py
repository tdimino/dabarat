#!/usr/bin/env python3
"""Propose passing replacement colors for audit.py's failing contrast rows.

For every USED_PAIRS row below its WCAG threshold (plus the 0.35 P3 margin),
walk the foreground's CIE Lab lightness away from the surface — hue held
fixed, chroma relaxed only when sRGB clips — until the ratio clears the
threshold with headroom. Prints one proposal per row; a human picks which
to adopt in theme-variables.css.

Usage: python3 scripts/color-audit/solve.py [theme ...]
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audit  # noqa: E402

HEADROOM = 0.60  # proposals target threshold + this, past the P3 margin


def lab_to_rgb(lab):
    L, a, b = lab
    fy = (L + 16) / 116
    fx = fy + a / 500
    fz = fy - b / 200

    def finv(t):
        return t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787

    x, y, z = finv(fx) * 0.95047, finv(fy), finv(fz) * 1.08883
    rl = x * 3.2406 + y * -1.5372 + z * -0.4986
    gl = x * -0.9689 + y * 1.8758 + z * 0.0415
    bl = x * 0.0557 + y * -0.2040 + z * 1.0570

    def delin(c):
        c = max(0.0, min(1.0, c))
        return c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055

    return tuple(delin(c) * 255 for c in (rl, gl, bl))


def clips(lab):
    L, a, b = lab
    fy = (L + 16) / 116
    fx, fz = fy + a / 500, fy - b / 200

    def finv(t):
        return t ** 3 if t ** 3 > 0.008856 else (t - 16 / 116) / 7.787

    x, y, z = finv(fx) * 0.95047, finv(fy), finv(fz) * 1.08883
    for c in (x * 3.2406 + y * -1.5372 + z * -0.4986,
              x * -0.9689 + y * 1.8758 + z * 0.0415,
              x * 0.0557 + y * -0.2040 + z * 1.0570):
        if c < -0.005 or c > 1.005:
            return True
    return False


def solve(fg, bg, target):
    """Minimal-|ΔL| in-gamut Lab variant of fg reaching target contrast on bg."""
    L0, a0, b0 = audit.rgb_to_lab(fg)
    lighten = audit.luminance(bg) < audit.luminance(fg[:3])
    step = 0.5 if lighten else -0.5
    L, ca, cb = L0, a0, b0
    for _ in range(400):
        L += step
        if not 0 <= L <= 100:
            return None
        while clips((L, ca, cb)) and abs(ca) + abs(cb) > 1:
            ca, cb = ca * 0.97, cb * 0.97
        rgb = lab_to_rgb((L, ca, cb))
        if audit.wcag(rgb, bg) >= target:
            return rgb
    return None


def main():
    only = set(sys.argv[1:])
    themes = audit.parse_themes(audit.THEME_CSS.read_text(encoding="utf-8"))
    for theme in audit.THEMES:
        if only and theme not in only:
            continue
        tokens = themes[theme]
        for pair in audit.USED_PAIRS:
            element, fg_spec, layers, threshold, tier = pair[:5]
            if tier == "WAIVED" or (len(pair) == 6 and theme not in pair[5]):
                continue
            fg = audit.resolve_color(tokens, fg_spec)
            bg = audit.composite([audit.resolve_color(tokens, s) for s in layers])
            ratio = audit.wcag(fg, bg)
            if ratio >= threshold + 0.35:
                continue
            fixed = solve(fg, bg, threshold + HEADROOM)
            if fixed is None:
                print(f"  {theme:<16} {element:<24} {ratio:.2f}:1 → UNSOLVABLE")
                continue
            hexval = "#%02x%02x%02x" % tuple(round(c) for c in fixed)
            print(f"  {theme:<16} {element:<24} {ratio:.2f}:1 → "
                  f"{hexval} ({audit.wcag(fixed, bg):.2f}:1)")


if __name__ == "__main__":
    main()
