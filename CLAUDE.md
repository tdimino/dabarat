# md-preview-and-annotate

Zero-dependency Python markdown previewer with annotations, bookmarks, and live reload.

## Stack
- Python 3.10+ (stdlib only — no pip dependencies)
- CDN: marked.js, highlight.js, Phosphor Icons (cached after first load)
- Catppuccin Mocha (dark) + Latte (light) themes

## Structure
- `md_preview_and_annotate/server.py` — HTTP server + 13 REST API endpoints
- `md_preview_and_annotate/template.py` — HTML shell assembly (inlines JS + CSS)
- `md_preview_and_annotate/annotations.py` — Sidecar JSON I/O + orphan cleanup
- `md_preview_and_annotate/bookmarks.py` — Global `~/.claude/bookmarks/` persistence
- `md_preview_and_annotate/__main__.py` — CLI entry point (serve, add, annotate)
- `md_preview_and_annotate/static/app.js` — Client rendering, carousel, gutter, tag state (`tagsCache`, `fetchTags`, `renderTagPills`)
- `md_preview_and_annotate/static/palette.js` — Command palette module (file metadata header, tag mode via `#` prefix, `TAG_COLORS`)
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
- Tags stored in sidecar JSON `"tags"` array. Predefined: draft, reviewed, final, important, archived, research, personal. Custom tags supported via command palette `#` prefix

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Serve HTML shell |
| GET | `/api/content?tab={id}` | Raw markdown + mtime |
| GET | `/api/tabs` | List all open tabs |
| GET | `/api/annotations?tab={id}` | Load annotations (runs orphan cleanup) |
| GET | `/api/tags?tab={id}` | Read tags for a tab |
| GET | `/{path}` | Serve static files relative to tab directories |
| POST | `/api/add` | Open a file as a new tab |
| POST | `/api/close` | Close a tab |
| POST | `/api/annotate` | Add annotation (bookmarks also persist to ~/.claude/) |
| POST | `/api/resolve` | Resolve/unresolve annotation → archive |
| POST | `/api/reply` | Add threaded reply to annotation |
| POST | `/api/delete-annotation` | Delete annotation |
| POST | `/api/tags` | Add/remove tag (`{tab, action, tag}`) |
