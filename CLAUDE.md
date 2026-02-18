# md-preview-and-annotate

Zero-dependency Python markdown previewer with annotations, bookmarks, and live reload.

Part of the [Claudius](https://github.com/tdimino/claudius) ecosystem.

## Stack
- Python 3.10+ (stdlib only — no pip dependencies)
- CDN: marked.js, highlight.js, Phosphor Icons (cached after first load)
- Catppuccin Mocha (dark) + Latte (light) themes

## Structure
- `md_preview_and_annotate/server.py` — HTTP server + 13 REST API endpoints
- `md_preview_and_annotate/template.py` — HTML shell assembly (inlines JS + CSS)
- `md_preview_and_annotate/annotations.py` — Sidecar JSON I/O + orphan cleanup
- `md_preview_and_annotate/bookmarks.py` — Global `~/.claude/bookmarks/` persistence
- `md_preview_and_annotate/frontmatter.py` — YAML frontmatter parser (stdlib, pyyaml fallback) + mtime cache
- `md_preview_and_annotate/__main__.py` — CLI entry point (serve, add, annotate)
- `md_preview_and_annotate/static/app.js` — Client rendering, carousel, gutter, frontmatter popup, variable highlighting
- `md_preview_and_annotate/static/palette.js` — Command palette + tag mode (Cmd+K) + prompt tags
- `md_preview_and_annotate/static/styles.css` — Catppuccin themes + typography + frontmatter/variable styles

## Commands
- Run: `python3 -m md_preview_and_annotate document.md`
- Add tab: `python3 -m md_preview_and_annotate --add another.md`
- CLI annotate: `python3 -m md_preview_and_annotate --annotate file.md --text "passage" --comment "note" --type suggestion`

## Conventions
- Annotations stored in sidecar JSON (`file.md.annotations.json`) — original markdown never modified
- Resolved annotations archived to `file.md.annotations.resolved.json`
- Bookmarks persist globally to `~/.claude/bookmarks/INDEX.md` + per-snippet files
- Default port: 3031, default author: "Tom"
- Orphan cleanup runs on every annotation fetch — stale anchors removed automatically
- Tags stored in sidecar JSON `"tags"` array; 7 predefined + 6 prompt tags + custom via palette `#` prefix
- `.prompt.md` files auto-detect YAML frontmatter → indicator bar + click-to-open metadata popup
- `{{variable}}` and `${variable}` template slots highlighted as colored pills with schema tooltips

## Detailed Docs
- @agent_docs/architecture.md
- @agent_docs/api-reference.md
- @agent_docs/client-architecture.md
