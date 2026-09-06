---
title: "refactor: Dabarat aesthetic, color-system, and optimization upgrade pass"
type: refactor
status: completed
date: 2026-09-06
project: /Users/tomdimino/Desktop/Programming/dabarat
---

# Dabarat: Aesthetic · Color · Optimization Audit and Upgrades

> On execution start: copy this plan to `docs/plans/2026-09-06-001-refactor-aesthetic-color-optimization-plan.md` (ce-plan convention; plan mode restricted writes to this file).

## Context

Tom asked for an audit of Dabarat on three axes (aesthetic, color, optimization) with sensible upgrades, then added a concrete P0 mid-audit: the instance dropdown renders as a gray box inside a gray box, unlabeled, and must be fixed color-wise in every theme with a hint of what it is.

Method: three parallel code explorations (typography/layout, color tokens/audit tooling, performance hot paths) with file:line evidence, live measurements against a running instance, the post-audit screenshot matrix, and an independent Codex GPT-5.6-sol review (findings folded in below where they add or correct). The August color audit (`docs/color-audit-2026-08.md`) closed every registered contrast pair; this pass is about what that audit *did not register*, the tokens the app defines but never uses, and the wire.

**Measured baseline** (live instance :49425, 2026-09-06):

| Metric | Value |
|---|---|
| `GET /` page weight | 547,563 B uncompressed (gzip → 117,983 B, 4.6×) |
| Compression / cache headers on shell | none / none (no `Cache-Control`, `ETag`) |
| HTTP | 1.0, `Connection: close` — every poll is a new TCP connection + thread |
| Read-mode poll | `/api/content` + `/api/annotations` every **500 ms** (`POLL_ACTIVE_MS`), no `document.hidden` gate; inactive tabs + `/api/tabs` every 2 s |
| Idle requests/min | 271 + 30·(N−1) tabs → 1,141/min (19/s) at 30 tabs; body sent and discarded on every poll |
| Parser-blocking CDN scripts | 6 (marked unpinned, twemoji `@latest`, hljs 121 KB full build, phosphor via unpkg root, vibrant, marked-footnote); 11 Tiptap ESM imports eager on every load |
| Server idle CPU | 34 s over 5.7 days (negligible — the cost is wire + client) |
| `versions.db` | 56 MB, 2,508 versions / 427 files, indexed correctly |
| Orphaned `~/.dabarat/instances/*.tabs.json` | 7 with no PID, oldest July 10 — nothing sweeps them |
| Color audit live run | P0=0 P1=0 **P2=78 P3=6** (findings.txt is 15 days stale, says P2=80 P3=0) |

**Decisions made by Tom (structured questions, this session):**
1. **Heading tiers on Ink/Vellum → tonal**: h3 keeps a single rubric accent; h4/h5 in `--ctp-text` differentiated by weight/size/small-caps. The other six themes keep their accent headings.
2. **Status bar → readable**: migrate to `--home-meta`/`--home-control`, re-solve on crust, register as P1 (extends the home "everything readable" decision of 2026-08-19).
3. **Token scope → without spacing**: radius, z-index, elevation, duration/easing tokens + the `.btn` recipe. Spacing literals stay.
4. **Measure → keep 900px behind a `--measure` token**: zero visual change.

---

## Workstream 0 — Instance dropdown: surface, contrast, identity (P0, lands first)

**Files**: `dabarat/static/css/base-layout.css` (:593–603 `.tab-context-menu`, :736–820 instance block), `dabarat/static/js/tabs.js` (:974–1024 `showInstanceMenu`), `scripts/color-audit/audit.py`

### Diagnosis
1. `.instance-menu` inherits `.tab-context-menu` → `background: var(--ctp-surface0)`, border `--ctp-surface1`; `.instance-row.self` adds `rgba(blue, .08)` on top. An 8% tint on surface0 is invisible on dark themes → box-in-box; on light themes surface0 is the documented "cold slab" (`#ccd0da` Latte, `#dfdad9` Dawn).
2. `.instance-row-self` ("this window") = raw `--ctp-blue` on `rgba(blue, .15)` over the self-row wash over surface0. Codex measured the real nested composite: **fails six themes** (Mocha 3.89, Latte 2.91, Dawn 3.10, Tokyo Storm 3.63, Ink 4.09, Tokyo Light 2.93); `--home-meta` fails on every self row and every light-theme row. Not in `USED_PAIRS`.
3. `.instance-row-ago` / `.instance-row-files` use `--home-meta`, solved only on `--ctp-base` and `--card-bg` (audit.py:251–252). Dark themes pass by accident (`--card-bg` *is* surface0 there); light themes were never measured on this surface.
4. Shadow `rgba(var(--ctp-mantle-rgb), .35)`: mantle is near-white on light themes → no shadow, flat slab. `--elevation-1/2` (theme-variables.css:118–128) exist for exactly this and are consumed by 4 of 69 `box-shadow` rules.
5. No header: bare rows. The overflow menu (`.tab-overflow-header`, base-layout.css:655) and version panel (`#version-panel-title` 8px kicker) both carry an identity line.

### Fix
- **Surface**: `.instance-menu { background: var(--card-bg); border-color: var(--ctp-surface1); box-shadow: var(--elevation-2); }` — every token below is already solved and audited on CARD. Dark themes: pixel-identical background; light: white/parchment card with a real shadow.
- **Self row**: drop the fill; inset rubric rule `box-shadow: inset 2px 0 0 var(--ctp-blue)` (same idiom as frontmatter bar / h2 rule), `padding-left` +2px.
- **Badge**: `.instance-row-self { color: var(--badge-blue-fg); background: rgba(var(--ctp-blue-rgb), .15); font-size: 10px }` — `badge blue .15` on CARD already audited (audit.py:260).
- **Meta/files/actions**: keep `--home-meta` / `--home-control` (audited on CARD, :252/:254). Action-button border → solid `var(--ctp-surface1)` (the 0.8-alpha wash is invisible on white). `.instance-row:hover { background: var(--interactive-muted-bg) }`.
- **Identity hint** (`tabs.js` `renderRows`): header `<div class="instance-menu-header" id="instance-menu-title"><span class="instance-menu-kicker">Windows</span><span class="instance-menu-count">N open</span></div>` reusing `.tab-overflow-header` layout. Per Codex pushback: readable size (11px DM Sans, `--home-control`), not an 8px decorative kicker; "Dabarat" is already supplied by the trigger; pluralize the count; dialog gets `aria-labelledby="instance-menu-title"`. Footer hint line (`.instance-menu-hint`, `--home-meta`, 10px): "Each window is its own server on 127.0.0.1". Indicator `title` → "Windows — click to list".
- **Interaction** (Codex): trigger gets synchronized `aria-expanded`; the dialog receives initial focus (first row or first button) on open and **returns focus to the indicator on dismiss** (`tabs.js:~1060` dismiss path). Anchored non-modal dialog → focus entry/return yes, hard trap no.
- **Audit registration**: `("instance self badge", "var(--badge-blue-fg)", [CARD, blue .15])`, `("instance meta (card)", "var(--home-meta)", [CARD])` alias row, and `("menu header (card)", "var(--home-control)", [CARD])` — expected to pass on existing values; registered so the surface can never silently regress.
- **Shadow sweep** (same commit, mechanical): all 18 `rgba(var(--ctp-mantle-rgb), α)` and 3 `--ctp-crust-rgb` box-shadows → `--elevation-1` (menus, pills, bubbles) or `--elevation-2` (palette, fm-popup, lightbox, banner). Vellum keeps its umber override (theme-variables.css:785).

### Verification
`audit.py` exit 0 with both new rows passing ×8; `shots.py` gains an `instances-<theme>.png` capture (CDP-invoke `showInstanceMenu()` with a seeded sibling); eyeball Latte, Dawn, Mocha. `pip install .` + restart instances.

---

## Workstream 1 — Color-system integrity (bugs, coverage, parity)

**Files**: `theme-variables.css`, `palette.js`, `theme.js`, `base-layout.css`, `annotations.css`, `diff.css`, `frontmatter.css`, `variables-panel.css`, `status-print.css`, `typography.css`, `lightbox.css`, `scripts/color-audit/{audit,shots}.py`

### 1a. Concrete bugs (each a one-commit fix)
| Bug | Where | Fix |
|---|---|---|
| `--ctp-crust-rgb` consumed, defined nowhere → invalid `rgba()` drops the whole `box-shadow` (incl. the light-theme "boosted contrast" annotation-form shadow) | `home.css:901`, `annotations.css:491`, `:519` | absorbed by the W0 shadow sweep (→ `--elevation-1`) |
| `THEME_PREVIEW` has no `ink`/`vellum` → the two signature themes render swatch-less in the picker; Latte blue `#1e66f5` and Tokyo Light `#7847bd` are stale | `palette.js:25–32`, `:799` | derive swatches at runtime from `getComputedStyle` of a detached `[data-theme]` probe element, delete the table; fallback keeps the array |
| Theme-toggle moon/sun opacity swap is Latte-only → control reads backwards on Vellum/Dawn/Tokyo Light | `base-layout.css:184–185` | all four light themes |
| Toggle knob `background: white` on every theme incl. Vellum parchment | `base-layout.css:173` | `var(--card-bg)` |
| Vellum omitted from three "surface0 too heavy" light groups | `annotations.css:75–77`, `variables-panel.css:51–58` | add vellum |
| `_custom` themes get 22 of ~52 tokens: inherit Mocha's literal `--hljs-comment`, `--card-bg`, and `color-scheme: dark` → dark scrollbars on a generated light theme | `theme.js:501–530 _buildThemeVars` | emit `color-scheme`, `--card-bg(-rgb)`, `--card-border`, `--interactive-*`, `--elevation-*`; make the 4 literal `:root` values (`--hljs-comment`, `--bold/italic/blockquote-color`) alias accents so role tokens follow |
| `SURFACE_COLORS` (24 hexes, `theme.js:174–183`) and Vibrant fallbacks (`:590–595`) are hand-copies of the palette | `theme.js` | read via `getComputedStyle` once per theme; delete tables |
| `--toc-active-bg` defined ×8 (Ink's tungsten mark, :634) consumed ×0 | `base-layout.css:236–238` | wire it (`#toc a.active { background: var(--toc-active-bg) }`) — Ink's intended current-section mark becomes visible |

### 1b. Audit coverage — register what ships
**Threshold bug first (P1, from Codex)**: `audit.py:180–184` grants h1–h5 the 3:1 large-text bar, but h3/h4/h5 render at 1.2/1.05/0.95em = 18/15.75/14.25px at the 15px default (smaller at the allowed 11px minimum) — only h1/h2 qualify as large text. At 4.5:1 all three fail on Latte, Dawn, Vellum: **nine hidden failures**. Fix: h3–h5 rows → 4.5 (h2 stays 3.0 at 22.5px semibold; h1 stays 3.0), re-solve `--h3/h4/h5-color` on the failing themes via `solve.py`. Decision 1 (tonal h4/h5 on Ink/Vellum) removes two of those rows from the accent problem entirely.

`USED_PAIRS` additions (all P1 unless noted), values solved with `solve.py` where they fail:
- **Tag colors** (`palette.js TAG_COLORS`, 14 entries, raw accent on 0.20 same-hue wash over base): `archived` fails **all 8** (1.49–2.71), `draft` all light themes. Introduce `--tag-<hue>-fg` role tokens (mirror `--badge-*-fg`, which already exist for 10 hues — reuse them: tag fg = `var(--badge-<hue>-fg)`), audit as `badge <hue> .20 (base)`.
- **External badge on its real surface**: crust + peach .18 (`status-print.css:82–83`), not mantle + .12 (audit.py:303). Latte 4.48 / Vellum 4.44 / Tokyo Light 4.14 fail today → re-solve `--external-badge-fg` on crust.
- **Status bar** (`--ctp-crust` surface): `--ctp-overlay0` text fails all 8 (1.62–3.84). Per decision 2: migrate to `--home-meta`/`--home-control`, register `(crust)` rows, re-solve on crust (the harder surface; card values stay valid because crust is darker on dark / lighter on light — verify per theme). If waived instead: WAIVED rows so it's conscious.
- **Annotation type icons** on surface0 (`annotations.css:330–334`): comment/yellow 1.62–3.12 on light themes → route through `--badge-<hue>-fg`.
- **Editor**: `caret-color: --ctp-yellow` (2.16–2.90 on light base) → `--stat-chg`; `.edit-fmt-btn`, `#edit-status`, `.edit-mode-badge` rows.
- **TOC**: `#toc a`, `#toc-label` on mantle. **Lightbox**, **variables-panel** badges. `.pmc-label` green on **base** (modal), not card.
- `.hljs-variable` → `--hljs-params` (currently raw `--ctp-text`, indistinguishable from body). `--hljs-function`: run `solve.py` for the 3 light themes (passes at 4.86–5.09 by accident).
- **Tooling**: extend `hardcoded_rgba_findings` to 3/6-digit hex and named colors (`white`, `black`, `#fff`); scan `palette.js`/`theme.js` too; add a global "every `var(--x)` referenced in CSS resolves in every theme" pass (would have caught `--ctp-crust-rgb`). `shots.py`: add editor, diff, palette-open, version-panel, instances captures. Delete `findings.txt` from the repo (or regenerate it from `audit.py` in a verify script) — a stale artifact is worse than none.

### 1c. Light-theme override sweep (the 30 Latte-only groups)
`diff.css` (5: all diff washes/badges), `frontmatter.css` (14: `.fm-ind-*`, `.pmc-version/type`), `variables-panel.css` (8), `typography.css:204/207`, `lightbox.css:23`, `base-layout.css:240`. Mechanical: each group gains `vellum`, `rose-pine-dawn`, `tokyo-light`. `override_findings` in audit.py drops from 33 → 0; P2 falls to the 44 structural accent collisions + 1 chroma note.

### 1d. Aesthetic (opinion, gated on decision 1)
- **Codex heading tiers** on Ink/Vellum: h3 keeps its accent as the single rubric; h4/h5 → `--ctp-text` at 600/500 weight; h5 small-caps `.06em` tracking — structure through type, matching the existing h6 rule's stated rationale. Implemented as Ink/Vellum overrides of `--h4-color`/`--h5-color` only, so the other six themes are untouched.
- `::selection` per signature: Ink `rgba(var(--ctp-yellow-rgb), .22)` (tungsten), Vellum `rgba(var(--ctp-blue-rgb), .18)` (iron-gall) — two lines each.
- Vellum print → `#fff` (`status-print.css:209`, `theme.js:246`) contradicts its "NOT pure white" card note; print Vellum on `--ctp-base`.
- **Opinions noted, not scheduled** (Codex + this audit): blockquotes carry wash + 3px rule + `font-style: italic` (`typography.css:88`, `editor.css:269`) and read as alert callouts on light themes — the CLAUDE.md "no italic" rule covers nested `em`/`code`, so this is a design choice, not a bug; an upright quote with wash-or-rule (not both) is the calmer scholarly convention. Table zebra alphas are per-theme intuition (Ink `.25` near-invisible, Vellum `.50` ledger-heavy) → tune by ΔL. `color-mix(in oklab, …)` could retire the 160 `-rgb` companion declarations; `audit.py resolve_color` needs a `color-mix` branch first.

---

## Workstream 2 — Typography & prose parity

**Files**: `typography.css`, `editor.css`, `theme-variables.css`, `home.css`, `history-ui.css`, `template.py`, `render.js`, `README.md`

### 2a. One prose stylesheet, two hosts
`editor.css:175–218` duplicates ~120 lines of `typography.css:28–77` and has drifted five ways: h3/h4/h5 use raw `--ctp-green/yellow/peach` (`:203/209/215`) instead of `--h3/h4/h5-color` (bypassing every per-theme contrast fix), **no h6 rule**, no `h* code` shrink, no `a:visited`, no hyphens. Fix: `typography.css` selectors become `#content h1, .ProseMirror h1 { … }` (etc.); delete the duplicated block from `editor.css`, keep only editor-specific chrome. README:37's "full visual parity" becomes true.

### 2b. Scale reach
- `pre code` 12px, `table` 13px, `th` 12px (`typography.css:145/159/169`, `editor.css:264`) → `0.82em` / `0.88em` / `0.8em` so `--base-size` reaches them.
- Footnote apparatus `0.82em` (`typography.css:257`) → 12.3px default, ~9px at the 11px minimum: raise to `0.875em` (Codex; scholarly apparatus needs to survive sustained reading).
- `hr` currently shares the h1/h2 1px `surface0` underline (`typography.css:108`) so section breaks have no distinct role → shorter centered rule (`width: 40%; margin: 2.4em auto`) in `--ctp-surface1`.
- `--heading-scale` (defined `:131` as `1`, consumed by 11 `calc()`s, never changed by any control): remove it and the calcs.
- `--measure` token (decision 4) consumed at the 4 `900px` literals (`typography.css:6`, `editor.css:164`, `frontmatter.css:16`, `variables-panel.css:265`).
- Home: `.home-title` 28px, `.home-quote-text` 24px → `calc(var(--base-size) * 1.85 / 1.6)`.

### 2c. Micro-typography (zero-risk additions)
`text-wrap: balance` on h1, h2, `.home-title`, `.home-quote-text`, `.home-card-filename`, `.status-banner`; `text-wrap: pretty` on `#content p, li`; `font-variant-numeric: tabular-nums` on `.version-date/.version-stats`, `.home-workspace-stats`, `.ws-stats`, `#font-size-display`, `.instance-row-ago`, diff line numbers; `hyphens: auto` on `.home-card-preview`; one `--font-serif/--font-sans/--font-mono` trio in `:root` replacing the 190 literal stacks (fixes the `Georgia` quoting drift and restores `Noto Sans Hebrew` fallback to the ~95 bare `'DM Sans', sans-serif` sites).

### 2d. Fonts on the wire
- Hebrew families are in the unconditional `<link>` (`template.py:57`) though README:28 says they load only when Hebrew is present. Split them into a second `<link>` injected by `render.js` on first `/[֐-׿]/` match (one regex on the markdown string, already in hand at `updateWordCount`).
- Verify Cormorant 500/700-italic cuts are used (grep `font-weight` under serif selectors); drop unused axes from the request.

### 2e. Reduced-motion live
`state.js:32` snapshots `matchMedia('(prefers-reduced-motion)')` once; add a `change` listener that updates the flag (CSS blanket already updates live, JS half doesn't).

---

## Workstream 3 — Design tokens & component consistency

**Files**: `theme-variables.css` (token block), then mechanical sweeps across all 14 CSS modules; `tabs.js`, `home.js`

### 3a. Tokens (scope per decision 3)
```
--radius-xs: 4px; --radius-sm: 6px; --radius-md: 8px; --radius-lg: 10px; --radius-pill: 999px;
--z-toc: 10; --z-panel: 15; --z-float: 25; --z-status: 30; --z-menu: 100; --z-banner: 300;
--z-palette: 500; --z-modal: 1000; --z-lightbox: 1100;
--dur-fast: 120ms; --dur-base: 180ms; --dur-slow: 280ms;
--ease-standard: cubic-bezier(.4,0,.2,1); --ease-out-back: cubic-bezier(.34,1.56,.64,1); --ease-out-expo: cubic-bezier(.22,1,.36,1);
--elevation-0: 0 0 0 1px rgba(0,0,0,.06);   /* hairline, replaces the 1px-ring literals */
```
Sweeps: 145 radius declarations (19 values → 5), 34 z-index (19 values → 9; **palette moves above banner and lightbox stays above modal**), 69 shadows (→ 3 elevation tokens, done in W0), 11 durations + 3 easings → tokens, 22 `transition: all` → explicit property lists, `150ms`/`0.15s` unified.

### 3b. Button recipe
A `.btn` base (DM Sans 11px, `4px 10px`, `--radius-sm`, `--home-control` fg, `--ctp-surface1` border, `--interactive-muted-bg` hover, `--ctp-blue` 2px `:focus-visible` ring at 2px offset, `scale(.96)` `:active`, `:disabled { opacity:.55; cursor:not-allowed }`) applied to the seven secondary pills: `.home-action-btn`, `.ws-btn`, `.home-open-btn`, `.version-btn`, `.instance-row-actions button`, `.status-banner button`, `#edit-save-btn/#edit-discard-btn`. Per-class rules shrink to deltas. Lavender focus ring in `lightbox.css:121` → blue. Add `:focus-visible` to the 12 unstyled interactive classes (incl. `.ctrl-btn`, `.palette-item`, `.home-card-remove` — the last must also reveal on `:focus-visible`, it's `opacity: 0` until hover).

### 3c. Banners
`home.js:917–924` hand-builds a `.status-banner` (no `role`, no `aria-live`, no dismiss) → call `_showStatusBanner` (`tabs.js:838`). Add `data-severity="warn|error|info"` → border/icon hue yellow/red/blue via tokens (attention-hue rule preserved: yellow = pending, red = failure, blue = info).

### 3d. Stragglers from prior critiques
`.version-excerpt-line` mid-word clip (`history-ui.css:195`) → `text-overflow: ellipsis` + `title`; `scrollbar-width: thin` + `scrollbar-color` per mode on `#content`, `pre`, `.palette-list` (Firefox parity); `accent-color: var(--ctp-blue)` on `:root`; `#edit-save-btn:disabled` clean state. `editor.js:258` hand-builds two more banners → factory.

### 3e. Functional layout bugs (Codex, verified)
- **TOC cannot reopen at ≤900px (P1)**: `responsive.css:164` translates `#toc` off-canvas unconditionally inside the media query; `toggleToc()` (`theme.js:123`) only toggles `body.toc-collapsed`, and there is no `body:not(.toc-collapsed) #toc { transform: none }` mobile rule. Fix: scope the off-canvas transform to `body.toc-collapsed #toc` within the breakpoint (the 900px `matchMedia` listener already adds the class on entry), sync `aria-expanded` on `#toc-restore`.
- **Print light-root override is dead**: `status-print.css:200–208` uses `[data-theme="latte"] html` — `data-theme` is on `<html>` itself, so the descendant selector never matches. → `html[data-theme="latte"], html[data-theme="latte"] body, …`. Also `@page { margin: 0.5in 0 }` (:131) contradicts the documented zero-margin contract (CLAUDE.md, `pdf_export.py`) for browser-print — align to `0` + `#content` padding; `thead { position: static }` in print so repeated table headers work; Vellum prints on `--ctp-base`, not `#fff` (see 1d).
- **Compact editor toolbar (P2)**: `.edit-toolbar` (`editor.css:14`) is one non-wrapping row of 28px controls; the 600px breakpoint (`responsive.css:186`) touches only read content/status. → at ≤600px move secondary formatting into an overflow menu (reuse `_menuKeyNav`), ≥44px primary targets.
- PDF export never passes the supported `date` param (`init.js:58` renders it, `server.py:1645` omits it) → pass ISO date or delete the dead path.

### 3f. Accessibility beyond contrast (Codex)
- **Tab strip**: tabs are pointer-only `div`s (`tabs.js:85`, `:125`) with no `tablist`/`tab` roles, no `tabindex`, no `aria-selected`, no keyboard activation, close × not a button (`template.py:122`). → real tablist with `<button role="tab">`, roving tabindex (ArrowLeft/Right, Home/End), `aria-selected`/`aria-controls`, separate close buttons. Ctrl+Tab cycling stays.
- **Palette and lightbox are visually modal but not focus-modal**: palette (`palette.js:237`, `:1046`) lacks `aria-modal`, `role="combobox"`/`listbox`/`option`, focus containment and return; lightbox (`lightbox.js:5`, `:73`) never receives, traps, or restores focus and images are click-only. → one shared `openDialog(el, {modal, returnTo})` primitive (the frontmatter popup at `frontmatter.js:169/197/443` already does this correctly — extract it), used by palette, lightbox, instance menu.
- **Landmarks**: `#main-area`/`#content` → `<main>`/`<article>`; annotation gutter → `<aside>`; `#version-panel-title` → `<h2>`; home cards `h3` under the page `h1` need an `h2` section heading (`home.js:626`, `:801`); theme-toggle checkbox has no accessible name (`template.py:105`).

---

## Workstream 4 — Transport & load

**Files**: `dabarat/server.py`, `dabarat/template.py`, `dabarat/static/js/polling.js`, `render.js`, `editor.js`; new `scripts/verify/phase15_transport.py`

**Ground truth that fixes the order** (verified in source):
- `ThreadingHTTPServer` has `daemon_threads=True` **and** `block_on_close=True`. `server.shutdown()` (server.py:982) only stops the accept loop; the hang would be `server.server_close()` (`__main__.py:830`, also the SIGTERM path :194), which joins every handler thread — under keep-alive the thread that served `/api/shutdown` is itself parked in `rfile.readline()` on the browser's open socket (handler `timeout` is `None`).
- `do_POST` (server.py:883–888) returns from `_check_origin` **before** `_read_body`; on keep-alive the unread JSON becomes the next request line on that socket.
- `send_error` paths (789, 793, 809, 813, 825, 1668) already emit `Content-Length` + `Connection: close`; no 30x responses exist.
- Shell bytes depend on title/author/theme/justify/port (server.py:870–875) → the ETag must hash the rendered HTML, not just the bundle.
- `pdf_export._cdp_ws_command` opens a fresh WebSocket per CDP command, so session-scoped `Emulation.*`/`Page.setWebLifecycleState` don't survive — hidden-tab tests must be simulated in-page.

**Steps (each landable alone, in this order):**
1. **Bundle cache** (`template.py:33–44`): module-level `_bundle` rebuilt when `max(st_mtime_ns)` over the 31 module paths moves (31 stats ≈ 50 µs; no dev/installed split). Strip the `/* ── mod ── */` banners + blank lines. Zero transport risk.
2. **`Content-Length` on every body path, still HTTP/1.0**: `_json_response` (:271–278 — every JSON success and 400/403/404/409/500/501/502, incl. `_check_origin` 403s at :285/:293) and `_serve_html_shell` (:876–881). Encode first, then `len()`. Harmless under 1.0; makes step 4 a one-line flip.
3. **`_send_bytes(status, ctype, data, cache_control=None)`**: always `Vary: Accept-Encoding`; gzip (`compresslevel=5, mtime=0` for determinism) when `len > 1400` and the client accepts; compressed `Content-Length`; skip body on HEAD. Route JSON + shell through it. **Exclude** `/api/preview-image` (:818–823, already-compressed images) and the static fallback (:849–854). ~10–15 ms to gzip the shell; memoize `etag → gz_bytes` in step 7.
4. **Flip to HTTP/1.1**: `protocol_version = "HTTP/1.1"`, `timeout = 30` (idle readline raises → `close_connection`), and in `start()` (:1671–1674) subclass the server with `block_on_close = False` so `server_close()` never joins parked keep-alive threads (daemon; reaped at process exit). Fix the POST poison: read the body before the origin check, or set `self.close_connection = True` on origin failure. Wrap the `int(Content-Length)` at :260 in `try` (bad header → 400 + close). Chrome transparently retries a reset reused socket; the client's 6-failure banner threshold absorbs a single hiccup.
5. **Conditional `/api/content`** (:301–324): `?since=<changeKey>`; if equal to the post-`_refresh_tab` key → 200 `{unchanged: true, changeKey, fileMissing?, fileError?}` (flags must ride along so :90–93 still apply ghost state). **200 + small JSON, not 304**: a hand-set `If-None-Match` yields an empty-body 304 in Chrome (Firefox may synthesize 200), `res.json()` throws, and polling.js:110–118 counts it toward the unreachable banner. Client: append `since` at polling.js:86 and :132; add `!data.unchanged &&` to the :94/:136 re-render conditions; `fetchTabContent` (tabs.js:291) stays unconditional. Server lands first (ignores absent `since`), client second.
6. **Hidden gating** (polling.js): after the home-screen block (:80): `if (document.hidden) { _pollTimer = setTimeout(poll, POLL_HIDDEN_MS /*5000*/); return; }`; keep a `_pollTimer` handle on every `setTimeout(poll, …)` (:57, :78, :204); in the `visibilitychange` listener (:7–12) `clearTimeout(_pollTimer); poll();`. Guard re-entrancy with `_pollInFlight` (calling `poll()` without clearing forks a second chain forever). Also drop the redundant `_refresh_tab` + second `annotations.read()` in `/api/annotations` (:378–383).
7. **ETag/304 on the shell**: weak `W/"sha1[:16]"` of the rendered HTML (identity and gzip variants share it); parse `If-None-Match` (split commas, strip `W/`); on match 304 with `ETag` + `Vary`, no body, no `Content-Length`; `Cache-Control: no-cache` so Chrome revalidates on reload. `?theme=`/`?export=1` are read client-side, so one ETag across query strings is correct.
8. **Script loading** (`template.py:52–84`): `defer` on the six classic scripts; `preconnect` for `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `esm.sh`; pin `marked@<current>` and `@twemoji/api@<current>`; Phosphor → the two weight stylesheets (`/src/regular/style.css`, `/src/fill/style.css`) instead of the unpkg root redirect; **Tiptap lazy**: the **12** `import()`s (Codex count) move into `loadTiptap()` awaited by `enterEditMode()` (raw-textarea fallback still triggers on failure); Vibrant lazy behind the image-theme command.
9. **Lazy inactive tabs at startup** (Codex): `init.js:23` fetches full content + tags for every tab on load though `switchTab` (`tabs.js:267`) already lazy-loads. → active tab first; inactive tabs keep only `changeKey` until activation (their 2 s poll then uses `since`, so a never-activated tab costs one tiny reply per 2 s).
10. **HEAD: skip.** Nothing issues HEAD, and `do_GET` has side effects (`_refresh_tab` snapshots, `cleanup_orphans`).

Expected: cold shell 547 KB → ~114 KB; idle loopback traffic at 10 tabs ~20 MB/min → <0.5 MB/min; ~19 conn/s at 30 tabs → 0 new connections; page load without the Tiptap waterfall.

---

## Workstream 5 — Server hot paths & hygiene

**Files**: `history.py`, `server.py`, `recent.py`, `frontmatter.py`, `annotations.py`, `__main__.py`, `instances.py`

- **`_db()`** (`history.py:80–109`): thread-local connection, `PRAGMA journal_mode=WAL` + `_ensure_db` schema script once per process (not per call, 0.57 ms each; browse-dir pays it per file). Keep `synchronous=FULL`? → `NORMAL` under WAL is durable enough for a version store and halves fsyncs; note as a choice.
- **browse-dir** (`server.py:499–648`) and `/api/file-metadata`: read each file **once**, pass text to `_extract_*` text-taking variants (`frontmatter.parse_frontmatter_text` already exists at :131). `recent._version_info` (:619) reads SQLite, not the document, so it correctly sits outside the 1 MB gate (Codex correction) — instead **batch it**: one `history.version_summaries(paths)` query per directory instead of one connection per file. 3.7 ms/file → ~1 ms. Browse-cache key → sorted `(name, mtime_ns, size)` (currently `(path, max float mtime, count)` misses same-second rewrites and size changes); collapse the per-file `except: pass` at :558 into one aggregated partial-results warning.
- **`_fm_cache`** (`frontmatter.py:21`): bounded (256, FIFO like `_browse_cache`) + lock — the only unbounded, unlocked dict, and it holds full document text.
- **Annotation sidecar integrity (P1, Codex)**: `annotations.write` (`annotations.py:43`) is a bare `open("w")` + `json.dump` — no lock, no tempfile/`os.replace`; the polling GET mutates via `cleanup_orphans` while POSTs read-modify-write (`server.py:375`, `:1087`) → last writer wins under `ThreadingHTTPServer`; malformed JSON is read as empty (`:17`) and then overwritten. Fix: per-file `threading.Lock` (keyed dict under a module lock), atomic write via `tempfile` + `os.replace` (the `_write_config` precedent), distinguish parse failure (`.annotations.json.corrupt-<ts>` sidecar + banner) from empty, and **move orphan cleanup off the GET** (run on POST/save and on tab open only) — this also removes the second `annotations.read()` per poll.
- **Swallowed snapshot failures**: `history.snapshot_external` failure is `except: pass` (`history.py:229`, `server.py:236`) against the "every change is revertible" invariant → return status; on failure show a rate-limited `data-severity="warn"` banner ("external change not snapshotted").
- **`/api/save`** opens 3 SQLite connections + 2 extra full reads via `touch_entry` → reuse the content already in hand.
- **Startup** (`__main__.py`): drop the second `_live_instances()` at :804 (re-pays every 1 s probe just to print `Instance N/max`); reconsider `_clear_pyc()` at :766 (defeats bytecode caching every launch); parallelize sibling probes (`ThreadPoolExecutor`, 5 × 1 s → 1 s worst case).
- **Orphan sweep**: in `instances.scan_live`, remove `<port>.tabs.json` whose `.pid` is absent and mtime > 7 days (the 7 July orphans).
- **Annotation highlights** (`annotations.js:223–260`): build the text-node index once per render, reuse across annotations (O(ann × nodes) → O(nodes)); only fires on real content change, so lowest priority.

---

## Workstream 7 — Trust boundary (Codex; adjacent to the asked scope — recommended, separable)

- **In scope now (convention violation)**: `frontmatter.js:62` (indicator chips: `fm.type`, `fm.model`, `fm.version` concatenated into `innerHTML`), `:243` (meta row), `:301` (variables table cells) — CLAUDE.md already mandates textContent-only for frontmatter values (`_fmFieldGrid`). Rebuild those three with `createElement`/`textContent`.
- **Separate pass, Tom's call**: (a) marked output → `innerHTML` unsanitized (`render.js:303`) — a hostile `.md` (or a compromised unpinned CDN script) runs same-origin against the local file API; DOMPurify from cdnjs (allowed CDN) with a strict allowlist, or `marked` with `html: false` (loses intentional inline HTML in docs). (b) Path checks are lexical (`abspath` + prefix at `server.py:727/785/828`; `/api/file-metadata` :427 accepts any file; `/api/add` :890 has no extension restriction) → `realpath` + `commonpath`, extension allowlist. Neither is aesthetic/perf; both are P1 for a tool that opens LLM-generated plan files by hook.

## Workstream 6 — Regression nets

- `scripts/verify/phase15_transport.py` (reuse `report`/`http_json`/`wait_http`/`wait_down`/`Browser`/`launch_code` from phase12): V1 keep-alive — two GETs on one `http.client.HTTPConnection`, `r.version == 11`, no `Connection: close`; V2 `int(Content-Length) == len(body)` for `/`, `/api/tabs`, a 404 JSON, a foreign-Origin 403, the shell fallback; V3 POST drain — 403 then a 200 GET on the same socket; V4 gzip — `Content-Encoding` + `Vary`, decompressed body equals identity body, small JSON stays uncompressed; V5 `since` — `unchanged` with no `content`, rewrite → full body + new key, delete → `fileMissing` rides along; V6 hidden gating via in-page `Object.defineProperty(document,'hidden')` + `visibilitychange` (fetch counter ≤ 1 over 2 s, then immediate poll within 300 ms on unhide); V7 ETag → 304 empty body, both identity and gzip; V8 shutdown with two idle keep-alive connections open → process exits within 2 s; V9 source guard — no `self.wfile.write(` outside `_send_bytes` and the two static handlers.
- `scripts/verify/phase16_tokens.py`: no raw `box-shadow`/`z-index`/`border-radius` literals outside `theme-variables.css`; every `var(--x)` resolves in every theme; `THEME_PREVIEW`/`SURFACE_COLORS` gone or equal to computed palette; editor/reader heading rules share selectors.
- `Server-Timing` header on `/api/content` and `/api/browse-dir` (µs, from `time.perf_counter`) — the project's first perf signal; phase15 asserts browse-dir < 2 ms/file on the fixture dir.
- `audit.py` exit 0 with the W1 rows; `shots.py` full matrix re-shot; docs: `CLAUDE.md` (poll cadence is 500 ms not 2 s; token families; `.btn` recipe; severity banners), `agent_docs/api-reference.md` (`since`, gzip, keep-alive), `docs/color-audit-2026-08.md` addendum 3.

## Build sequence
W0 → W1a (bugs) + W3e TOC bug + W7 frontmatter sinks (all small, all P1) → W4 steps 1–7 (biggest user-visible win after W0) → W1b/1c (threshold fix, coverage, sweep) → W5 annotations integrity → W2 → W3a–d → W3f accessibility → W4 8–9 → W5 rest → W6 docs. W7 (b) is a separate pass. Each workstream is independently landable; commit per milestone; **`pip install .` + restart instances after every batch** (non-editable install trap; stale-server trap). Scope gate: every workstream above touches >3 files — execute them as the numbered sub-steps, one commit each.

## Edge cases (deliverable)
- Keep-alive + `/api/shutdown`: idle sockets must not block `server.shutdown()`; `daemon_threads=True` and `Connection: close` on the shutdown response.
- gzip + `Sec-Fetch-Dest: image` static fallback: never compress already-compressed image bytes; exclude binary paths from the helper.
- `since` short-circuit vs ghost tabs: a missing file must still return `fileMissing: true` even when the last-known key matches.
- Tiptap lazy-load failure (CDN down) → existing raw-textarea fallback must still trigger from `enterEditMode()`.
- Hebrew font lazy link: a tab switch to a Hebrew doc after load must inject exactly once; export mode (`?export=1`) must inject synchronously before the render-complete sentinel.
- `.btn` base on `.version-btn`: history-ui's documented "border-only hover" rationale (history-ui.css:259) survives as a delta rule, not lost in the merge.
- Custom-theme `color-scheme`: derive from `luminance(base) > 0.5`.
- Status-bar tokens re-solved on crust must not regress their card/base rows (audit runs all surfaces).

## Sources
- Exploration reports this session: typography/layout, color tokens/audit tooling, performance (file:line anchors inline); live measurements against :49425; screenshot matrix `scripts/color-audit/shots/` (Aug 19).
- Prior: `docs/color-audit-2026-08.md`, `docs/plans/2026-08-19-001-…`, `.design-critique/20260626-154500__editor-toolbar.md`, `.design-critique/20260819-125726__instances-tabs-history-home.md`, `plans/007` (Partial: Latte annotation overrides).
- Conventions: dabarat `CLAUDE.md` (role tokens, light-theme override rule, whisper tier, attention hues, event delegation, Motion One guards, thread safety).
