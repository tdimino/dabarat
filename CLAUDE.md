# md-preview-and-annotate

Zero-dependency Python markdown previewer with annotations, bookmarks, and live reload.

Part of the [Claudius](https://github.com/tdimino/claudius) ecosystem.

## Stack
- Python 3.10+ (stdlib only — no pip dependencies)
- CDN: marked.js, highlight.js, Phosphor Icons (cached after first load)
- Catppuccin Mocha (dark) + Latte (light) themes

## Structure

### Python
- `server.py` — HTTP server + 14 REST API endpoints
- `template.py` — HTML shell assembly (concatenates JS/CSS modules, inlines into single doc)
- `annotations.py` — Sidecar JSON I/O + orphan cleanup
- `bookmarks.py` — Global `~/.claude/bookmarks/` persistence
- `frontmatter.py` — YAML frontmatter parser (stdlib, pyyaml fallback) + mtime cache
- `diff.py` — Side-by-side markdown diff engine
- `__main__.py` — CLI entry point (serve, add, annotate)

### JavaScript (`static/js/` — 12 modules, concatenated in order)
- `state.js` — Global vars, config
- `utils.js` — `slugify()`, `escapeHtml()`
- `theme.js` — Font size, theme toggle, TOC resize
- `render.js` — `render()`, `buildToc()`, scroll spy, word count
- `frontmatter.js` — Indicator bar, popup modal
- `variables.js` — Highlighting, manifest panel, fill-in, preview
- `tags.js` — Tag CRUD, pill rendering
- `tabs.js` — Tab bar, switching, cross-file links
- `annotations.js` — Highlights, bubbles, CRUD, carousel, gutter overlay
- `diff.js` — Diff mode, scroll sync, resize
- `polling.js` — 500ms poll loop
- `init.js` — Bootstrap

### CSS (`static/css/` — 10 modules, concatenated in order)
- `theme-variables.css` — Catppuccin Mocha/Latte color vars
- `base-layout.css` — Resets, TOC, main area, tab bar
- `typography.css` — Markdown elements, hljs tokens
- `annotations.css` — Gutter, bubbles, carousel, form
- `status-print.css` — Status bar, print media
- `responsive.css` — 1400px breakpoint
- `palette.css` — Command palette, tag pills, hint badge
- `frontmatter.css` — Indicator bar, popup, variable pills
- `variables-panel.css` — Gutter tabs, cards, preview overlay
- `diff.css` — Diff header, panels, blocks

### Standalone
- `static/palette.js` — Command palette + tag mode (Cmd+K) — loaded separately

## Install
- `pip install -e .` from project root — installs `mdpreview` and `mdp` globally

## Commands
- Run: `mdpreview document.md` (or `mdp document.md`, or `python3 -m md_preview_and_annotate document.md`)
- Add tab: `mdpreview --add another.md`
- CLI annotate: `mdpreview --annotate file.md --text "passage" --comment "note" --type suggestion`

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

## Detailed Docs
- @agent_docs/architecture.md
- @agent_docs/api-reference.md
- @agent_docs/client-architecture.md
