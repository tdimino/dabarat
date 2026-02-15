# md-preview-and-annotate

Zero-dependency Python markdown previewer with annotations, bookmarks, and live reload.

## Stack
- Python 3.10+ (stdlib only — no pip dependencies)
- CDN: marked.js, highlight.js, Phosphor Icons (cached after first load)
- Catppuccin Mocha (dark) + Latte (light) themes

## Structure
- `md_preview_and_annotate/server.py` — HTTP server + 9 REST API endpoints
- `md_preview_and_annotate/template.py` — HTML shell assembly (inlines JS + CSS)
- `md_preview_and_annotate/annotations.py` — Sidecar JSON I/O + orphan cleanup
- `md_preview_and_annotate/bookmarks.py` — Global `~/.claude/bookmarks/` persistence
- `md_preview_and_annotate/__main__.py` — CLI entry point (serve, add, annotate)
- `md_preview_and_annotate/static/app.js` — Client rendering, carousel, gutter
- `md_preview_and_annotate/static/styles.css` — Catppuccin themes + typography

## Commands
- Run: `python3 -m md_preview_and_annotate document.md`
- Add tab: `python3 -m md_preview_and_annotate --add another.md`
- CLI annotate: `python3 -m md_preview_and_annotate --annotate file.md --text "passage" --comment "note" --type suggestion`
- Preview README: `grip README.md 3031`

## Conventions
- Annotations stored in sidecar JSON (`file.md.annotations.json`) — original markdown never modified
- Resolved annotations archived to `file.md.annotations.resolved.json`
- Bookmarks persist globally to `~/.claude/bookmarks/INDEX.md` + per-snippet files
- Default port: 3031, default author: "Tom"
- Orphan cleanup runs on every GET `/api/annotations` — stale anchors removed automatically

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Redirect to first file |
| GET | `/view/<file>` | Serve rendered HTML |
| GET | `/api/content/<file>` | Raw markdown + metadata |
| GET | `/api/annotations/<file>` | Load annotations (runs orphan cleanup) |
| POST | `/api/annotations/<file>` | Save annotations array |
| POST | `/api/annotate` | Add single annotation |
| POST | `/api/resolve` | Resolve annotation → archive |
| POST | `/api/bookmark` | Persist bookmark globally |
| GET | `/static/<path>` | Serve JS/CSS assets |
