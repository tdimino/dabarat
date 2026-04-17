# Markdown Dabarat

Zero-dependency Python markdown previewer with annotations, bookmarks, and live reload.

Part of the [Claudius](https://github.com/tdimino/claudius) ecosystem.

## Stack
- Python 3.10+ (stdlib only — no pip dependencies)
- CDN: marked.js, highlight.js, Phosphor Icons, Twemoji, Vibrant.js, Motion One (cached after first load)
- 8 themes: 4 dark (Ink, Mocha, Rosé Pine, Tokyo Storm) + 4 light (Vellum, Latte, Rosé Pine Dawn, Tokyo Light). Ink + Vellum are The Scholar's Codex pair — parchment-and-iron-gall register with tungsten gold and rubricated red-ochre signature accents.

## Structure

### Python
- `server.py` — HTTP server + 36 REST API endpoints
- `template.py` — HTML shell assembly (concatenates JS/CSS modules, inlines into single doc)
- `annotations.py` — Sidecar JSON I/O + orphan cleanup
- `bookmarks.py` — Global `~/.claude/bookmarks/` persistence
- `frontmatter.py` — YAML frontmatter parser (stdlib, pyyaml fallback) + mtime cache
- `diff.py` — Side-by-side markdown diff engine
- `history.py` — Git-based file version history
- `recent.py` — Recently opened files tracking
- `workspace.py` — `.dabarat-workspace` CRUD, recent workspaces tracking
- `pdf_export.py` — CDP-based PDF export (headless Chrome, stdlib WebSocket, zero deps)
- `__main__.py` — CLI entry point (serve, add, annotate, export-pdf, workspace)

### JavaScript (`static/js/` — 16 modules, concatenated in order)
- `state.js` — Global vars, config
- `utils.js` — `slugify()`, `escapeHtml()`, `formatTimeAgoShared()`
- `theme.js` — Font size, theme toggle, emoji style, TOC resize
- `render.js` — `render()`, `buildToc()`, scroll spy, word count, table scroll wrapping, lightbox hook
- `frontmatter.js` — Indicator bar, popup modal
- `variables.js` — Highlighting, manifest panel, fill-in, preview
- `tags.js` — Tag CRUD, pill rendering
- `tabs.js` — Tab bar (visible window capping, +N overflow dropdown, dynamic widths 80-160px), switching, cross-file links
- `annotations.js` — Highlights, bubbles, CRUD, carousel, gutter overlay
- `diff.js` — Diff mode, scroll sync, resize
- `editor.js` — Inline editing, word/char-level change tracking (Myers line diff → greedy word diff → char diff), transparent textarea + mirror overlay, ghost text deletion markers
- `history-ui.js` — Version history panel
- `lightbox.js` — Image lightbox (zoom, keyboard nav, blur backdrop)
- `home.js` — Workspace-driven home page, directory browser, file cards, Motion One animations
- `polling.js` — 500ms poll loop
- `init.js` — Bootstrap

### CSS (`static/css/` — 14 modules, concatenated in order)
- `theme-variables.css` — 8 theme blocks (Ink/Vellum/Mocha/Latte/Rosé Pine/Rosé Pine Dawn/Tokyo Storm/Tokyo Light) with color vars, RGB companions, `--interactive-hover-bg`, `--interactive-muted-bg`
- `base-layout.css` — Resets, TOC, main area, tab bar (no scroll—visible window only), home-active TOC sidebar
- `typography.css` — Markdown elements, hljs tokens, image effects (border, glow, hover lift)
- `annotations.css` — Gutter, bubbles, carousel, form
- `status-print.css` — Status bar, print media
- `responsive.css` — Responsive breakpoints (1400px gutter, 900px TOC, 600px compact)
- `palette.css` — Command palette, tag pills, hint badge, shortcut labels
- `frontmatter.css` — Indicator bar, popup, variable pills
- `variables-panel.css` — Gutter tabs, cards, preview overlay
- `diff.css` — Diff header, panels, blocks
- `editor.css` — Inline editor, mirror overlay, change highlights (`.hl-add`/`.hl-mod`/`.hl-line-add`/`.hl-del-mark`), ghost text deletion annotations, edit-mode atmosphere (yellow caret, dirty state deepening), light theme overrides
- `history-ui.css` — Version history panel
- `lightbox.css` — Image lightbox overlay, backdrop blur, navigation
- `home.css` — Workspace cards, directory browser, smart badges, Motion One keyframes, `.ws-toggle` segmented control, `.home-empty` flex-centered empty state with ghost button

### Standalone
- `static/palette.js` — Command palette + tag mode (Cmd+K), shortcut display — loaded separately

### macOS (`macos/`)
- `build.sh` — Builds `Dabarat.app` AppleScript droplet → `~/Applications/`
- `Info.plist` — UTI declarations, bundle metadata (`com.minoanmystery.dabarat`)
- `INDEX.md` — Build and usage documentation

## Install
- `pip install .` from project root — installs `dabarat`, `dbrt`, `mdpreview`, and `mdp` globally (non-editable required for Finder "Open With" — editable installs hit macOS TCC on `~/Desktop/`)
- `pip install -e .` for development — changes take effect immediately but Finder integration won't work (TCC blocks `~/Desktop/` access from AppleScript droplets)

## Commands
- Run: `dabarat document.md` (or `dbrt`, `mdpreview`, `mdp`, `python3 -m dabarat`)
- Workspace: `dabarat --workspace research.dabarat-workspace`
- Add tab: `dabarat --add another.md`
- Export PDF: `dabarat --export-pdf file.md [-o output.pdf] [--theme mocha]`
- CLI annotate: `dabarat --annotate file.md --text "passage" --comment "note" --type suggestion`

## Conventions
- Annotations stored in sidecar JSON (`file.md.annotations.json`) — original markdown never modified
- Resolved annotations archived to `file.md.annotations.resolved.json`
- Bookmarks persist globally to `~/.claude/bookmarks/INDEX.md` + per-snippet files
- Default port: 3031, default author: "Tom"
- Orphan cleanup runs on every annotation fetch — stale anchors removed automatically
- Tags stored in sidecar JSON `"tags"` array; 7 predefined + 6 prompt tags + custom via palette `#` prefix
- `.prompt.md` files auto-detect YAML frontmatter → indicator bar + click-to-open metadata popup
- `{{variable}}` and `${variable}` template slots highlighted as colored pills with schema tooltips
- Blockquotes: no italic (matches GitHub/VS Code/Typora convention) — `em` and `code` inside blockquotes reset to `font-style: normal` to prevent Victor Mono cursive rendering
- Emoji style: 4 options (Twemoji, OpenMoji, Noto, Native) via `EMOJI_CDNS` in `theme.js`. `applyEmojiStyle()` runs after `marked.parse()`
- **Config dir**: `~/.dabarat/` (history, instances, recent.json). Auto-migrates from `~/.mdpreview/` on first run.
- **localStorage prefix**: `dabarat-*` keys. Migration IIFE in `state.js` copies `mdpreview-*` → `dabarat-*` on first load.
- **Color convention**: Never use hardcoded rgba channel values—use `rgba(var(--ctp-*-rgb), alpha)` from `theme-variables.css`. RGB companions (`--ctp-yellow-rgb`, `--ctp-blue-rgb`, etc.) auto-switch per theme. Latte overrides only needed when alpha values differ from Mocha defaults. TAG_COLORS in `palette.js` also uses CSS variable references for theme-awareness.
- **Vellum shadow exception**: Vellum uses warm umber shadows (`rgba(70, 48, 20, ...)`) instead of the neutral `rgba(0, 0, 0, ...)` used by every other theme. Pure-black shadows punch cold holes into its warm parchment base; the convention break is documented inline in `theme-variables.css` and should not be "normalized" back.
- **Interactive token convention**: For hover/focus states on surfaces that use `--card-bg` (white in light themes), use `var(--interactive-hover-bg)` (dark: `--ctp-surface1`, light: `--ctp-crust`) and `var(--interactive-muted-bg)` (dark: `rgba(surface1, 0.85)`, light: `rgba(0,0,0,0.06)`) instead of raw `var(--ctp-surface1)` which is invisible on white.
- **Event delegation**: Never use inline `onclick` handlers in dynamically-built HTML—use `data-*` attributes + `addEventListener` event delegation. This prevents XSS via HTML entity decoding in path strings.
- **Motion One**: Optional animation CDN loaded as ES module (`@motionone/dom`). Assigns `window.Motion` with `animate`, `stagger`, `spring`. All call sites MUST guard with `if (window.Motion && !_prefersReducedMotion)` for progressive enhancement + accessibility. `_prefersReducedMotion` is a `const` in `state.js`. Falls back to CSS `@keyframes` animations. See `@agent_docs/motion-one.md` for full call site reference.
- **Image lightbox**: Content images (excluding `.emoji` and `.tpl-var-img`) get `cursor: zoom-in` and open lightbox on click
- **Workspace system**: See `@agent_docs/workspace-system.md` for full internals. Key state: server-side `_active_workspace`/`_active_workspace_path`, client-side in `state.js`
- **PDF export**: `pdf_export.py` uses headless Chrome CDP with zero page margins (`@page { margin: 0 }`, CDP margins: 0). Visual spacing via `#content { padding: 0.6in }` in print mode. Export mode: `?theme=X&export=1` skips polling + emits render-complete sentinel. `print-color-adjust: exact` preserves dark backgrounds. `html` gets theme background in print to prevent outline artifacts on dark themes. Light themes override both `html` and `body` to `#fff`.
- **Finder integration (macOS)**: `Dabarat.app` droplet at `~/Applications/`. Bundle ID: `com.minoanmystery.dabarat`. Rebuild after Python upgrade: `bash macos/build.sh`. Default handler: `duti -s com.minoanmystery.dabarat .md all`
- **Thread safety**: `_browse_cache` in `server.py` protected by `threading.Lock()`. All shared module-level dicts under `ThreadingHTTPServer` require lock protection.
- **Size-gated extraction**: `_extract_word_count`, `_extract_summary`, `_extract_preview`, `_extract_preview_image` all gated behind 1MB file size check in browse-dir handler.
- **Edit mode change tracking**: Three-tier diff (Myers line → greedy word → char) rendered via transparent textarea + `<pre>` mirror overlay. Mirror text must be character-for-character identical to textarea value (the alignment invariant). Highlight classes: `.hl-add` (green, new), `.hl-mod` (yellow, modified char), `.hl-line-add` (green wash, new line), `.hl-del-mark` (ghost text via `::after` + `data-del` attribute, red strikethrough above deletion point). `body.edit-mode` and `body.edit-dirty` classes control atmosphere (yellow caret, background wash deepening). `_splitWords()` regex `/(\s*\S+)/g` attaches leading whitespace to tokens—do not change without verifying diff accuracy.

## On-Demand References

Read these when relevant to the current task:

- `agent_docs/architecture.md` — Data flow, component roles, design decisions
- `agent_docs/api-reference.md` — All 36 REST API endpoints with JSON schemas
- `agent_docs/client-architecture.md` — 16 JS modules: state, rendering pipeline, annotation system
- `agent_docs/workspace-system.md` — Workspace CRUD, multi-root sidebar, CLI flag, quotes system
- `agent_docs/motion-one.md` — Motion One call sites, guard pattern, animation principles
