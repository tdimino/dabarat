# Color Theory Audit — 8 Themes × Markdown Elements

**Date**: 2026-08-04
**Method**: Computed audit over `dabarat/static/css/theme-variables.css` plus every CSS module that paints markdown or chrome. ~50 foreground/surface pairs per theme, alpha washes composited onto true surfaces before measuring. Three metrics per pair: WCAG 2.1 contrast ratio (4.5:1 body text, 3:1 large text/UI), APCA-W3 Lc (perceptual cross-check), CIE76 ΔE (accent distinguishability). Plus four structural checks: surface-ramp monotonicity, accent collisions, dark↔light chroma parity, and light-theme override completeness.
**Tooling**: `scripts/color-audit/audit.py` (rerunnable, exits 1 on any P0) · full machine-readable inventory in `scripts/color-audit/findings.txt` · kitchen-sink fixture at `scripts/color-audit/fixture.md` · 8-theme screenshot matrix in `scripts/color-audit/shots/` (via `shots.py`).

**Totals**: **P0 = 8 · P1 = 111 · P2 = 82 · P3 = 14**

This report is findings-only. No fixes have been applied — the fix pass is a separate follow-up, gated on review of the proposals below.

---

## P0 — Contrast failures on primary reading surfaces

Body-register elements a reader cannot avoid: links, italic, blockquote text. All on `--ctp-base`.

| Theme | Element | Measured | Token | Proposed change |
|-------|---------|----------|-------|-----------------|
| Latte | link | 4.34:1 (needs 4.5) | `--ctp-blue: #1e66f5` — theme-variables.css:103 | Darken to ~`#1a5cd7` (≈4.9:1) — Catppuccin's own Latte blue is known-marginal; a 6% darken keeps the hue |
| Latte | italic | 4.34:1 | `--italic-color: #1e66f5` — theme-variables.css:143 | Follows the link fix automatically if both move; or point italic at a darker dedicated value |
| Latte | link hover | 2.81:1 | `--ctp-lavender: #7287fd` — theme-variables.css:104 | Hover must not *lose* contrast. Either darken lavender to ~`#5265e0`, or invert the convention on light themes: hover darkens toward `--ctp-mauve` |
| Rosé Pine Dawn | link | 3.30:1 | `--ctp-blue: #56949f` — theme-variables.css:261 | Rosé Pine Dawn's "pine" `#286983` (currently `--ctp-teal`, 5.6:1) is the palette's intended link color; swap blue slot to pine or darken foam to ~`#3e7a85` |
| Rosé Pine Dawn | italic | 3.30:1 | `--italic-color: #56949f` — theme-variables.css:299 | Same remedy as link |
| Rosé Pine Dawn | blockquote | 3.50:1 (composited over `--blockquote-bg`) | `--blockquote-color: #907aa9` — theme-variables.css:300 | Darken toward Dawn's iris `#56526e` register, ~`#6d5a8a` reaches 4.6:1 over the wash |
| Rosé Pine Dawn | link hover | 3.65:1 | `--ctp-lavender: #907aa9` — theme-variables.css:262 | Darken to ~`#755d94` |
| Vellum | link hover | 4.44:1 | `--ctp-lavender: #7a6a8c` — theme-variables.css:515 | 2-point darken to ~`#71617f` clears 4.5; the resting iron-gall link (`#3d4d6a`, 7.5:1) is fine |

Pattern: **every P0 is a light theme, and five of eight are the link/hover pair.** The dark themes' link colors all clear 6:1+. The root cause is reusing upstream palette accents (Catppuccin Latte blue, Rosé Pine Dawn foam) as text colors on white-adjacent bases — they were designed as UI accents, not body-text inks.

---

## P1 — Secondary elements (111 findings, grouped by pattern)

Full row-level inventory: `scripts/color-audit/findings.txt` lines 14–125. Grouped here because the 111 rows collapse into seven root causes.

### 1. hljs syntax tokens on light themes (~40 findings)
Code blocks sit on `--ctp-mantle`, and the custom token mapping (typography.css:217–237) feeds raw accent variables to hljs classes. On Latte and Rosé Pine Dawn nearly the whole token set fails: Latte string 2.75, number 2.45, operator/property (sky) 2.30, type (yellow) 2.15, meta (pink) 2.17; Dawn is worse across the board (string 3.14, number/type 2.05, symbol 2.60). Tokyo Light and Vellum fail on about half the set.

*Proposed*: introduce per-theme `--hljs-*` override tokens on the four light themes (the `--code-fg` precedent at theme-variables.css:149/305/641 already does exactly this for inline code — extend the idea to the token set), rather than darkening the shared accents and distorting headings/pills that use the same variables.

### 2. `--ctp-overlay1` as muted text — fails on ALL 8 themes (~25 findings)
Card meta, figcaption, footnote backref, and (at the 3:1 UI bar) list markers all use `--ctp-overlay1`, which is a *border/overlay* tier in Catppuccin's semantics, not a text tier. Worst: Tokyo Storm 2.35:1, Vellum 2.42:1, Ink 3.18:1; even Mocha only reaches 4.44:1.

**This tier is intentionally muted** — de-emphasis is the design intent. It still fails the letter of WCAG. *Proposed*: a semantic `--muted-fg` token per theme, tuned to land at 4.5–5:1 (i.e., promote most themes one step to `--ctp-overlay2`/`--ctp-subtext0` territory), replacing `overlay1` in text contexts only. Decision needed from Tom: strict AA compliance vs. deliberate whisper-tier with a documented exemption.

### 3. hljs comment — the single worst readability offender (all 8 themes)
`--ctp-overlay0` on mantle: **Tokyo Storm 1.74:1**, Vellum 1.78:1, Latte 2.14, Dawn 2.13, Rosé Pine 2.33, Ink 2.36, Tokyo Light 2.53, Mocha 3.59. The Tokyo Storm screenshot confirms it — comments are functionally invisible. Comments are *content*, not chrome. *Proposed*: dedicated `--hljs-comment` per theme at ≥4.5:1, keeping the desaturated character (e.g., Tokyo Storm `#787fa8` instead of `#414868`).

### 4. Template variable pills (~10 findings)
`{{mustache}}` (mauve) and `${dollar}` (teal) text over their own 0.18-alpha washes fail on Ink (3.55/3.67), Rosé Pine (2.86 teal), Dawn (3.00 mauve), Tokyo Storm (3.38 mauve), Tokyo Light (3.96/4.31), Vellum (3.50 teal), Latte (3.71/2.72). *Proposed*: raise wash alpha slightly and darken/brighten pill text per mode — or reuse the `--code-fg` strategy with two dedicated pill-fg tokens.

### 5. History chip (new this session)
`--ctp-crust` on `--ctp-blue` fails on Latte 3.71, Rosé Pine Dawn 2.86, Tokyo Light 4.26 (history-ui.css `.history-chip`). Crust is near-white on light themes but blue is mid-tone. *Proposed*: light themes use `--ctp-base`→no; simplest is white text on the four light themes' blues won't work either (Dawn blue too light) — use `--ctp-text` on a `rgba(var(--ctp-blue-rgb), 0.15)` wash instead of solid blue, matching the pill idiom.

### 6. Heading accents on light themes
Latte h3 (green) 2.96, h4 (yellow) 2.31, h5 (peach) 2.64; Dawn h4/h5 2.16; Vellum h4 2.90 — all against the 3:1 large-text bar. The Dawn screenshot shows h4/h5 visibly washed out. *Proposed*: darken the yellow/peach slots on light themes (they're the least text-safe hues in every palette) or remap h4/h5 to darker accents on light themes only.

### 7. Chrome oddments
External badge (peach on peach-wash over mantle): fails 5 themes, worst Dawn 1.89. Timeline +/- stats and dates on mantle: marginal on Latte/Dawn/Vellum. Latte/Dawn table header (blue on mantle) 4.04/3.14 — borderline-acceptable as large-ish bold text but flagged.

---

## P2 — Harmony and consistency (82 findings)

### Accent collisions (ΔE < 10)
Rosé Pine and Rosé Pine Dawn are the worst by design: the upstream palette has ~6 accents mapped onto 14 Catppuccin slots, so **10 slot-pairs per theme are ΔE 0.0 — literally identical** (green=blue=sky, pink=red=maroon, peach=yellow, mauve=lavender, teal=sapphire...). Tokyo Light collapses 8 pairs, Tokyo Storm 5, Vellum 2 (sapphire=blue is the deliberate iron-gall signature). Ink and Mocha only have near-misses (ΔE 6–9). Consequence: anything that relies on slot *difference* — h3 vs. link, pill vs. pill, diff added vs. info — silently merges on these themes. Acceptable if intentional; worth a documented mapping table either way.

### Light-theme override completeness (37 findings)
The "all four light themes appear together" convention (CLAUDE.md) is violated in six files — these blocks name `latte` (sometimes + dawn + tokyo-light) but omit the rest:

- `base-layout.css:171–172, 227` — missing dawn, tokyo-light, vellum
- `diff.css:258, 265, 269, 273, 277` — missing dawn, tokyo-light, vellum
- `frontmatter.css:129–204, 486–496, 540–546` (18 blocks) — missing dawn, tokyo-light, vellum
- `lightbox.css:22` — missing dawn, tokyo-light, vellum
- `typography.css:184, 188` — missing dawn, tokyo-light, vellum
- `variables-panel.css:49, 55, 298–307` — `:49/:55` missing vellum only; `:298–307` missing all three
- `annotations.css:72`, `status-print.css:172` — missing vellum only

Some may be benign (latte-specific alpha tweaks per the convention's own carve-out), but frontmatter.css and diff.css look like genuine gaps — vellum/dawn/tokyo-light get dark-theme values there.

### Chroma drift
Mocha accents average chroma 31 vs. Latte 62 — Δ31. Switching mocha↔latte doubles color intensity; the pastel↔saturated jump is upstream Catppuccin's choice, noted for awareness, not necessarily action.

### Vellum surface ramp (real finding)
Luminance not monotonic in depth order: base 0.898 → mantle 0.840 → **crust 0.760 < surface0 0.792** → surface1 0.654. Anything layering surface0 *on* crust (e.g., a card on the sidebar) renders lighter than its backdrop, inverting perceived depth. One-token fix: nudge Vellum `--ctp-surface0` below 0.76 luminance.

---

## P3 — Margin passes (<0.35 from threshold)

14 pairs pass but with no headroom — one font-weight or antialiasing change from failing: Tokyo Light inline code (`--code-fg: #085570` at theme-variables.css:641, 4.64:1 — its own comment admits it's the floor), Latte/Tokyo Light blockquote, Dawn h1/h2/h3 (3.30 vs 3.0), hljs keyword on Ink/Tokyo Light/Tokyo Storm, Vellum hljs operator/property and timeline date, Ink/Tokyo Light list markers. No action needed; don't darken these surfaces further without rechecking.

---

## Structural observations (outside the pair matrix)

1. **No `a:visited` styling in any theme** — visited and unvisited links are indistinguishable. Deliberate minimalism or gap; flagging once.
2. **No read-mode `::selection` styling** — selection falls back to browser default (OS blue), which clashes with every theme, most violently with Vellum/Ink's parchment-and-iron register.
3. **h6 is achromatic and tiny** in all themes (confirmed in both screenshots) — it reads as body-text-sized gray, weaker than the paragraph it heads. Consider small-caps + letterspacing rather than color.
4. **Warning semantics split between peach and yellow** across modules (external badge uses peach, dirty-state uses yellow, unseen dots use peach) — pick one "attention" hue per severity and document it.
5. **Harness note**: annotation washes don't render in the screenshot matrix — the sidecar writes succeed (shots.py now fails loudly if they don't), but washes are painted from `annotationsCache`, which only the polling loop fills, and `?export=1` disables polling. Wash findings therefore rest on computed compositing only; a non-export capture pass would close that gap.

---

## Recommended fix order (for the follow-up pass, pending review)

1. **P0 batch** — 8 token edits in theme-variables.css, all light themes. Smallest diff, largest reader impact.
2. **hljs comment token** — one new variable × 8 themes; kills the worst offender class.
3. **Light-theme hljs override set** — per-theme `--hljs-*` tokens, extending the `--code-fg` precedent.
4. **`--muted-fg` decision** — needs Tom's call on strict-AA vs. documented whisper tier before any edit.
5. **Override-completeness sweep** — mechanical; audit each of the 37 blocks and add missing light themes where values genuinely apply.
6. **Vellum surface0, history chip, pills, headings, badges** — independent small fixes.

Rerun `python3 scripts/color-audit/audit.py` after each batch; the exit code gates on P0s, so CI-style verification is free.
