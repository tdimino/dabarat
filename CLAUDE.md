# Markdown Dabarat

Zero-dependency Python markdown previewer with annotations, bookmarks, and live reload. Part of the [Claudius](https://github.com/tdimino/claudius) ecosystem.

## Stack
- Python 3.10+ (stdlib only — no pip dependencies)
- CDN: marked.js, marked-footnote, highlight.js, Phosphor Icons, Twemoji, Vibrant.js, Motion One, Tiptap/ProseMirror (cached after first load)
- 8 themes: 4 dark (Ink, Mocha, Rosé Pine, Tokyo Storm) + 4 light (Vellum, Latte, Rosé Pine Dawn, Tokyo Light); Ink + Vellum are The Scholar's Codex pair — pigment jobs in `agent_docs/color-system.md`

## Structure
- 12 Python modules in `dabarat/` — `server.py` (HTTP + 50 endpoints), `template.py` (HTML assembly), `annotations.py`, `bookmarks.py`, `frontmatter.py`, `diff.py`, `history.py`, `recent.py`, `workspace.py`, `pdf_export.py`, `instances.py` (instance discovery), `__main__.py` (CLI entry)
- 16 JS modules in `static/js/` concatenated in dependency order — see `agent_docs/client-architecture.md`
- 14 CSS modules in `static/css/` concatenated in dependency order — theme-variables, base-layout, typography, then feature-specific (annotations, editor, diff, home, etc.)
- `static/palette.js` — Command palette + tag mode (Cmd+K) — loaded separately
- `macos/` — Finder integration: `build.sh` builds `Dabarat.app` droplet, `Info.plist` declares UTIs (`com.minoanmystery.dabarat`)

## Install
- `pip install .` from project root — installs `dabarat`, `dbrt`, `mdpreview`, and `mdp` globally (non-editable required for Finder "Open With" — editable installs hit macOS TCC on `~/Desktop/`)
- The install is a copy: after ANY change under `static/` or `dabarat/`, reinstall and restart every running instance, then confirm the served bundle from `cd ~` (from the project root `import dabarat` resolves to the source tree and hides a stale install)
- `pip install -e .` for development — changes take effect immediately but Finder integration won't work (TCC blocks `~/Desktop/` access from AppleScript droplets)

## Commands
- Run: `dabarat document.md` (or `dbrt`, `mdpreview`, `mdp`, `python3 -m dabarat`)
- Workspace: `dabarat --workspace research.dabarat-workspace`
- Add tab: `dabarat --add another.md`
- Export PDF: `dabarat --export-pdf file.md [-o output.pdf] [--theme mocha]`
- CLI annotate: `dabarat --annotate file.md --text "passage" --comment "note" --type suggestion`
- Default port 3031, default author "Tom", config dir `~/.dabarat/`

## Rules (every session)
- Annotations live in sidecar JSON (`file.md.annotations.json`, resolved → `.annotations.resolved.json`); the source markdown is never modified. Bookmarks persist to `~/.claude/bookmarks/`.
- Colors: never a hex, named color, or raw rgba channel outside `theme-variables.css` — use `rgba(var(--ctp-*-rgb), α)`, the role tokens (`--code-*`, `--hljs-*`, `--home-*`, `--badge-<hue>-fg`, …), and `--elevation-1/2` for shadows. Register every new color+surface pair in `USED_PAIRS` in `scripts/color-audit/audit.py`, then run it (exits 1 on P0) and `scripts/verify/phase17_tokens.py`.
- All four light themes (Latte, Vellum, Rosé Pine Dawn, Tokyo Light) appear together in every `[data-theme]` override group — omitting one regresses that theme silently.
- Whisper-tier contrast waivers (document `--ctp-overlay1` text, the TOC kicker, home ghost controls) are decisions — leave them; everything else passes its tier.
- Design tokens only: no px radius, no z-index ≥ 10, no literal transition duration or `all`, no neutral rgba shadow in a module — use `--radius-*`, `--z-*`, `--dur-*`, `--elevation-*`; new pills are deltas on `.btn`.
- Hover states on `--card-bg` surfaces use `--interactive-hover-bg` / `--interactive-muted-bg`, not raw `--ctp-surface1` (invisible on white).
- Never inline `onclick` in dynamically-built HTML — `data-*` attributes + delegated listeners (XSS via entity-decoded paths). Every `marked.parse` result goes through `sanitizeHtml()` before `innerHTML` (phase15 V12 greps for it). Dropdowns reuse `_menuKeyNav`; anything hover-revealed also reveals on `:focus-within`/`:focus-visible`.
- Motion One call sites guard with `if (window.Motion && !_prefersReducedMotion)` and fall back to CSS keyframes.
- Render `tabBody(tab)`, never raw `content` (frontmatter would leak); save `content`, never `body` (frontmatter would be lost). `_tabLoaded(t)` is the only "do we have the document" test.
- Server handlers never index `self._tabs` directly — use the locked helpers (`_tab_filepath`, `_tab_dirs`, `_refresh_tab`, `_update_tab_content`); every shared module-level dict sits under a lock.
- Ship visual changes one at a time with a screenshot; never strip a signature chrome effect (glows, rails, halo hovers) to "quiet" a surface.

## Regression nets
`python3 scripts/verify/phase<N>_*.py` — 7 TOC navigation (CDP), 8 editor round-trip, 9 save path, 10 SQLite store, 12 instances + tabs, 13 history panel, 14 auto-tabs + preview images, 15 transport, 16 annotation integrity, 17 tokens, 18 lazy tabs. Run the ones that touch what you changed before committing; `scripts/color-audit/shots.py` refreshes the 8-theme screenshot matrix (it registers real pid files — don't restart live instances while it runs).

## On-Demand References
Read the one that owns the code you are about to change:

- `agent_docs/color-system.md` — the full color, typography, and token conventions: role tokens and their audited surfaces, whisper tier, tab bar / editor toolbar / blockquote / table designs, Vellum exceptions. Read before any CSS or palette color change.
- `agent_docs/ui-chrome.md` — client interaction conventions: home rail and cards, `#float-column`, gutter dismissal, compare exit, menus, dialogs, banners, TOC navigation, editor, frontmatter modal. Read before changing anything a user sees or focuses in `static/js/`.
- `agent_docs/server-internals.md` — transport, poll cadence, change detection, instances, tab lifecycle, sidecar and version-store integrity, PDF export, Finder integration. Read before changing `dabarat/*.py`, `polling.js`, `init.js`, or `tabs.js`.
- `agent_docs/architecture.md` — data flow, component roles, design decisions
- `agent_docs/api-reference.md` — REST API endpoints with JSON schemas
- `agent_docs/client-architecture.md` — 16 JS modules: state, rendering pipeline, annotation system
- `agent_docs/workspace-system.md` — workspace CRUD, multi-root sidebar, CLI flag, quotes system
- `agent_docs/motion-one.md` — Motion One call sites, guard pattern, animation principles
- `docs/color-audit-2026-08.md` — color audit record + addenda (role tokens, 2026-09 coverage pass)
