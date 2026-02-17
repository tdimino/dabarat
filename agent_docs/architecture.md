# Architecture

## Overview

A zero-dependency Python markdown previewer that runs entirely from stdlib. Three CDN scripts (marked.js, highlight.js, Phosphor Icons) load on first page view and are browser-cached thereafter.

## Data Flow

```
CLI (__main__.py)
  │
  ├─ serve → server.py (PreviewHandler on port 3031)
  │            │
  │            ├─ GET / → template.py assembles HTML shell
  │            │           (inlines app.js + palette.js + styles.css)
  │            │
  │            ├─ GET /api/content → reads .md file, returns content + mtime
  │            ├─ GET /api/annotations → annotations.py loads sidecar JSON, runs orphan cleanup
  │            ├─ POST /api/annotate → annotations.py writes sidecar JSON
  │            │                       (bookmark type also → bookmarks.py → ~/.claude/bookmarks/)
  │            └─ POST /api/tags → annotations.py reads/writes "tags" array in sidecar JSON
  │
  ├─ --add → HTTP POST to running server's /api/add (tab reuse)
  └─ --annotate → annotations.py direct write (no server needed)
```

## Component Roles

### `__main__.py` (267 lines)
- CLI argument parsing (argparse)
- Three modes: `serve` (default), `--add` (tab reuse), `--annotate` (CLI write)
- Tab reuse detection: tries GET to existing server before starting new one
- Chrome `--app` mode launch with fallback to `webbrowser.open()`
- Blocks on `server.serve_forever()` with `KeyboardInterrupt` handler

### `server.py` (345 lines)
- `PreviewHandler(BaseHTTPRequestHandler)` — single handler class
- 13 REST endpoints (6 GET, 7 POST)
- Tab management via module-level dicts: `_tabs`, `_tab_files`, `_tab_order`
- Tab IDs are SHA-256 hashes of absolute file paths
- Content polling: client fetches `/api/content` every 500ms, server returns file mtime for change detection
- Static file serving for assets referenced by markdown content (images, etc.)

### `template.py` (116 lines)
- Reads `static/` files at import time, inlines them into a single HTML document
- CDN dependencies: marked.js (markdown), highlight.js (syntax), Phosphor Icons
- Google Fonts: Cormorant Garamond, DM Sans, Victor Mono
- Passes `defaultAuthor` config to JS via `window.MDPREVIEW_CONFIG`

### `annotations.py` (110 lines)
- Sidecar JSON format: `file.md.annotations.json` alongside each document
- Schema: `{ version: 1, tags: [...], annotations: [...] }`
- Orphan cleanup: compares annotation anchor text against current markdown content, removes stale annotations
- Resolve workflow: moves resolved annotations to `file.md.annotations.resolved.json`
- Tag management: `add_tag()`, `remove_tag()`, `get_tags()` — stored in sidecar JSON `"tags"` array

### `bookmarks.py` (110 lines)
- Global persistence to `~/.claude/bookmarks/`
- `INDEX.md` with most-recent-first entries
- Per-snippet files in `snippets/` subdirectory
- Filename format: `{date}-{slug}.md` with deduplication counter
- Called by server when annotation type is `bookmark`

## Key Design Decisions

- **Sidecar JSON, never modify source markdown** — annotations live in separate files
- **Polling over WebSocket** — 500ms interval, simpler than WebSocket for stdlib-only constraint
- **Tab IDs = SHA-256 of absolute path** — deterministic, collision-resistant
- **Orphan cleanup on read** — runs every time annotations are fetched, no separate GC process
- **Single HTML document** — template.py inlines everything, no separate asset requests
