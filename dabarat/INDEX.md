# dabarat

Python package — the core application.

| File | Description |
|------|-------------|
| `__init__.py` | Package metadata (version, author) |
| `__main__.py` | CLI entry point — serve, `--add` (tab reuse), `--annotate` (CLI write) |
| `server.py` | HTTP server (`PreviewHandler`) with 13 REST endpoints |
| `template.py` | HTML shell assembly — inlines JS + CSS from `static/` |
| `annotations.py` | Sidecar JSON I/O, orphan cleanup, tag management |
| `bookmarks.py` | Global `~/.claude/bookmarks/` persistence |
| `static/` | Client-side assets — see [static/INDEX.md](static/INDEX.md) |

## Entry Points

- `python3 -m dabarat file.md` — start server + open browser
- `python3 -m dabarat --add file.md` — add tab to running instance
- `python3 -m dabarat --annotate file.md --text "..." --comment "..." --type comment` — CLI annotation
