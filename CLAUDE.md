# Markdown Dabarat

Zero-dependency Python markdown previewer with annotations, bookmarks, and live reload.

Part of the [Claudius](https://github.com/tdimino/claudius) ecosystem.

> Python package directory: `md_preview_and_annotate/` (unchanged for import compatibility)

## Stack
- Python 3.10+ (stdlib only — no pip dependencies)
- CDN: marked.js, highlight.js, Phosphor Icons, Twemoji, Vibrant.js, Motion One (cached after first load)
- Catppuccin Mocha (dark) + Latte (light) themes

## Structure

### Python
- `server.py` — HTTP server + 22 REST API endpoints
- `template.py` — HTML shell assembly (concatenates JS/CSS modules, inlines into single doc)
- `annotations.py` — Sidecar JSON I/O + orphan cleanup
- `bookmarks.py` — Global `~/.claude/bookmarks/` persistence
- `frontmatter.py` — YAML frontmatter parser (stdlib, pyyaml fallback) + mtime cache
- `diff.py` — Side-by-side markdown diff engine
- `history.py` — Git-based file version history
- `recent.py` — Recently opened files tracking
- `__main__.py` — CLI entry point (serve, add, annotate)

### JavaScript (`static/js/` — 16 modules, concatenated in order)
- `state.js` — Global vars, config
- `utils.js` — `slugify()`, `escapeHtml()`, `formatTimeAgoShared()`
- `theme.js` — Font size, theme toggle, emoji style, TOC resize
- `render.js` — `render()`, `buildToc()`, scroll spy, word count, lightbox hook
- `frontmatter.js` — Indicator bar, popup modal
- `variables.js` — Highlighting, manifest panel, fill-in, preview
- `tags.js` — Tag CRUD, pill rendering
- `tabs.js` — Tab bar, switching, cross-file links
- `annotations.js` — Highlights, bubbles, CRUD, carousel, gutter overlay
- `diff.js` — Diff mode, scroll sync, resize
- `editor.js` — Inline editing, change tracking
- `history-ui.js` — Version history panel
- `lightbox.js` — Image lightbox (zoom, keyboard nav, blur backdrop)
- `home.js` — Workspace-driven home page, directory browser, file cards, Motion One animations
- `polling.js` — 500ms poll loop
- `init.js` — Bootstrap

### CSS (`static/css/` — 14 modules, concatenated in order)
- `theme-variables.css` — Catppuccin Mocha/Latte color vars + RGB companions
- `base-layout.css` — Resets, TOC, main area, tab bar, home-active TOC sidebar
- `typography.css` — Markdown elements, hljs tokens, image effects (border, glow, hover lift)
- `annotations.css` — Gutter, bubbles, carousel, form
- `status-print.css` — Status bar, print media
- `responsive.css` — Responsive breakpoints (1400px gutter, 900px TOC, 600px compact)
- `palette.css` — Command palette, tag pills, hint badge
- `frontmatter.css` — Indicator bar, popup, variable pills
- `variables-panel.css` — Gutter tabs, cards, preview overlay
- `diff.css` — Diff header, panels, blocks
- `editor.css` — Inline editor, change highlights
- `history-ui.css` — Version history panel
- `lightbox.css` — Image lightbox overlay, backdrop blur, navigation
- `home.css` — Workspace cards, directory browser, smart badges, Motion One keyframes

### Standalone
- `static/palette.js` — Command palette + tag mode (Cmd+K) — loaded separately

## Install
- `pip install -e .` from project root — installs `dabarat`, `dbrt`, `mdpreview`, and `mdp` globally

## Commands
- Run: `dabarat document.md` (or `dbrt`, `mdpreview`, `mdp`, `python3 -m md_preview_and_annotate`)
- Add tab: `dabarat --add another.md`
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
- Emoji style switchable via `Cmd+K` → Settings → Emoji Style: Twitter (Twemoji), OpenMoji, Noto Color Emoji, or Native. Uses twemoji's parser as universal emoji detector with swappable CDN URLs (`EMOJI_CDNS` in `theme.js`). `applyEmojiStyle()` runs after `marked.parse()` in `render.js`; `img.emoji` CSS rule sizes inline. Preference persisted in `localStorage('dabarat-emoji-style')`
- **Config dir**: `~/.dabarat/` (history, instances, recent.json). Auto-migrates from `~/.mdpreview/` on first run.
- **localStorage prefix**: `dabarat-*` keys. Migration IIFE in `state.js` copies `mdpreview-*` → `dabarat-*` on first load.
- **Color convention**: Never use hardcoded rgba channel values—use `rgba(var(--ctp-*-rgb), alpha)` from `theme-variables.css`. RGB companions (`--ctp-yellow-rgb`, `--ctp-blue-rgb`, etc.) auto-switch per theme. Latte overrides only needed when alpha values differ from Mocha defaults. TAG_COLORS in `palette.js` also uses CSS variable references for theme-awareness.
- **Event delegation**: Never use inline `onclick` handlers in dynamically-built HTML—use `data-*` attributes + `addEventListener` event delegation. This prevents XSS via HTML entity decoding in path strings.
- **Motion One**: Optional animation CDN loaded as ES module (`@motionone/dom`). Assigns `window.Motion` with `animate`, `stagger`, `spring`. All call sites MUST guard with `if (window.Motion)` for progressive enhancement. Falls back to CSS `@keyframes` animations.
- **Image lightbox**: Content images (excluding `.emoji` and `.tpl-var-img`) get `cursor: zoom-in` and open a lightbox overlay on click. Lightbox supports keyboard navigation (arrows, Escape), blur backdrop, and zoom.
- **Workspace home page**: When home screen is active, TOC sidebar repurposes as directory browser. `_cachedTocContent` saves/restores TOC innerHTML during transitions. `buildToc()` in `render()` always overwrites restored cache immediately after tab activation.
- **Thread safety**: `_browse_cache` in `server.py` protected by `threading.Lock()`. All shared module-level dicts under `ThreadingHTTPServer` require lock protection.
- **Size-gated extraction**: `_extract_word_count`, `_extract_summary`, `_extract_preview`, `_extract_preview_image` all gated behind 1MB file size check in browse-dir handler.

## Detailed Docs
- @agent_docs/architecture.md
- @agent_docs/api-reference.md
- @agent_docs/client-architecture.md
