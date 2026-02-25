# Architecture

## Overview

A zero-dependency Python markdown previewer that runs entirely from stdlib. Six CDN scripts (marked.js, highlight.js, Phosphor Icons, Twemoji, Vibrant.js, Motion One) load on first page view and are browser-cached thereafter. Motion One is optional—all animations fall back to CSS `@keyframes` if unavailable.

## Data Flow

```
CLI (__main__.py)
  │
  ├─ serve → server.py (PreviewHandler on port 3031)
  │            │
  │            ├─ GET / → template.py assembles HTML shell
  │            │           (inlines 16 JS modules + palette.js + 14 CSS modules)
  │            │
  │            ├─ GET /api/tabs → list open tabs
  │            ├─ GET /api/content → reads .md file, returns content + mtime + frontmatter
  │            ├─ GET /api/annotations → annotations.py loads sidecar JSON, runs orphan cleanup
  │            ├─ GET /api/tags → tag array for a tab
  │            ├─ GET /api/recent → recent.py returns recently opened files
  │            ├─ GET /api/browse-dir → enriched directory listing (word counts, summaries,
  │            │                        preview images, annotation/version counts, badges)
  │            ├─ GET /api/preview-image → serves image files from tab/browse directories
  │            ├─ GET /api/versions → history.py lists git-backed version history
  │            ├─ GET /api/version → history.py retrieves content at a specific commit
  │            ├─ GET /api/diff → diff.py compares two markdown files
  │            ├─ GET /api/workspace → active workspace JSON
  │            ├─ GET /api/workspaces/recent → recently opened workspaces
  │            ├─ GET /api/file-metadata → enriched metadata for a single file
  │            ├─ POST /api/add → open file as new tab
  │            ├─ POST /api/close → close a tab
  │            ├─ POST /api/annotate → annotations.py writes sidecar JSON
  │            │                       (bookmark type also → bookmarks.py → ~/.claude/bookmarks/)
  │            ├─ POST /api/resolve → toggle resolved state, archive to .resolved.json
  │            ├─ POST /api/reply → threaded reply to annotation
  │            ├─ POST /api/delete-annotation → permanently delete annotation
  │            ├─ POST /api/save → atomic write + auto-commit to history.py
  │            ├─ POST /api/restore → history.py restores file to a previous version
  │            ├─ POST /api/rename → renames file + sidecar files on disk
  │            ├─ POST /api/browse → macOS file picker (osascript)
  │            ├─ POST /api/browse-folder → macOS folder picker
  │            ├─ POST /api/browse-file → macOS file picker (markdown only)
  │            ├─ POST /api/recent/remove → removes a file from recent list
  │            ├─ POST /api/tags → add/remove tags in sidecar JSON
  │            ├─ POST /api/workspace → create/overwrite workspace file
  │            ├─ POST /api/workspace/open → activate a workspace
  │            ├─ POST /api/workspace/close → deactivate workspace
  │            ├─ POST /api/workspace/add-folder → append folder to workspace
  │            ├─ POST /api/workspace/add-file → pin file to workspace
  │            ├─ POST /api/workspace/remove → remove folder/file from workspace
  │            ├─ POST /api/workspace/rename → rename workspace
  │            ├─ POST /api/workspace/save-as → save dialog + create workspace
  │            └─ POST /api/export-pdf → pdf_export.py via headless Chrome CDP
  │
  ├─ --add → HTTP POST to running server's /api/add (tab reuse)
  └─ --annotate → annotations.py direct write (no server needed)
```

## Component Roles

### `__main__.py` (~448 lines)
- CLI argument parsing (argparse)
- Three modes: `serve` (default), `--add` (tab reuse), `--annotate` (CLI write)
- Tab reuse detection: tries GET to existing server before starting new one
- Chrome `--app` mode launch with fallback to `webbrowser.open()`
- Blocks on `server.serve_forever()` with `KeyboardInterrupt` handler

### `server.py` (~791 lines)
- `PreviewHandler(BaseHTTPRequestHandler)` — single handler class
- 36 REST API endpoints (14 GET, 22 POST)
- Tab management via module-level dicts: `_tabs`, `_tab_files`, `_tab_order` (protected by `_tabs_lock`)
- Tab IDs are SHA-256 hashes of absolute file paths
- Content polling: client fetches `/api/content` every 500ms, server returns file mtime for change detection
- Inline editing: `/api/save` writes content atomically (tempfile + `os.replace`), auto-commits to history
- Version history: `/api/versions`, `/api/version`, `/api/restore` backed by `history.py`
- File management: `/api/rename` (renames file + sidecars), `/api/browse` (macOS file picker)
- Workspace browsing: `/api/browse-dir` returns enriched directory listings with thread-safe `_browse_cache` + `_browse_cache_lock`
- Preview images: `/api/preview-image` serves images restricted to tab/browse directories
- Static file serving for assets referenced by markdown content (images, etc.)

### `template.py` (~227 lines)
- Reads `static/` files at import time, inlines them into a single HTML document
- Concatenates 16 JS modules + 14 CSS modules with `/* ── module.js ── */` delimiters
- CDN dependencies: marked.js (markdown), highlight.js (syntax), Phosphor Icons, Twemoji (emoji), Vibrant.js (color extraction), Motion One (animations, optional)
- Google Fonts: Cormorant Garamond, DM Sans, Victor Mono
- Lightbox overlay DOM injected into HTML body
- Passes `defaultAuthor` config to JS via `window.DABARAT_CONFIG`

### `annotations.py` (109 lines)
- Sidecar JSON format: `file.md.annotations.json` alongside each document
- Schema: `{ version: 1, tags: [...], annotations: [...] }`
- Orphan cleanup: compares annotation anchor text against current markdown content, removes stale annotations
- Resolve workflow: moves resolved annotations to `file.md.annotations.resolved.json`
- Tag management: `add_tag()`, `remove_tag()`, `get_tags()` — stored in sidecar JSON `"tags"` array

### `bookmarks.py` (109 lines)
- Global persistence to `~/.claude/bookmarks/`
- `INDEX.md` with most-recent-first entries
- Per-snippet files in `snippets/` subdirectory
- Filename format: `{date}-{slug}.md` with deduplication counter
- Called by server when annotation type is `bookmark`

### `frontmatter.py` (166 lines)
- Extracts YAML frontmatter delimited by `---` at file start (handles BOM, CRLF)
- Stdlib-only `parse_yaml_subset()` for scalars, inline lists, block lists, list-of-dicts
- Falls back to `pyyaml` (`yaml.safe_load`) if installed
- Mtime-keyed cache: `(filepath, mtime)` → `(frontmatter_dict, body_str)`
- Called by `server.py` in `/api/content` — returns `frontmatter` field alongside `content`

### `pdf_export.py` (~294 lines)
- CDP-based PDF export using headless Chrome and a raw stdlib WebSocket client (`socket` + `struct` + `base64`, no library)
- Discovers Chrome binary on macOS/Linux/Windows
- Launches `--headless --print-to-pdf` with `--remote-debugging-port`
- WebSocket connection to CDP endpoint for page load detection + `Page.printToPDF`
- Theme preservation: passes `?theme=X&export=1` query params to server URL
- Called by `__main__.py` via `--export-pdf` flag, or from browser via `Cmd+K` → "Export PDF..."

### `diff.py` (108 lines)
- Side-by-side markdown diff engine using `difflib.SequenceMatcher`
- `prepare_diff()` returns structured block list with insert/delete/change/equal types
- Called by server for `/api/diff` endpoint

### `history.py` (172 lines)
- Git-backed version history stored in `~/.dabarat/history/`
- Files tracked by SHA-256 hash of absolute path (collision-resistant)
- `commit(filepath)` — auto-commits current content after each save
- `list_versions(filepath)` — returns commit log with hashes, timestamps, diffs
- `get_version_content(filepath, hash)` — retrieves content at a specific commit
- `restore(filepath, hash)` — writes historical content back to file + commits
- Git hash validation via regex to prevent command injection

### `recent.py` (~118 lines)
- Recently opened files persisted to `~/.dabarat/recent.json`
- Atomic writes via `tempfile.mkstemp` + `os.replace()`
- Thread-safe with `threading.Lock`
- Max 20 entries, validates file existence and allowed extensions (.md, .markdown, .txt)
- Extracts title from first heading for display
- Metadata extraction helpers used by both `recent.py` and `server.py`'s `/api/browse-dir`:
  - `_extract_word_count(filepath)` — word count from file content
  - `_extract_summary(filepath)` — first non-heading paragraph
  - `_extract_preview(filepath)` — first ~500 chars of content
  - `_extract_preview_image(filepath)` — first image reference in markdown
  - `_count_versions(filepath)` — git commit count from history

## Key Design Decisions

- **Sidecar JSON, never modify source markdown** — annotations live in separate files
- **Polling over WebSocket** — 500ms interval, simpler than WebSocket for stdlib-only constraint
- **Tab IDs = SHA-256 of absolute path** — deterministic, collision-resistant
- **Orphan cleanup on read** — runs every time annotations are fetched, no separate GC process
- **Single HTML document** — template.py inlines everything, no separate asset requests
- **Event delegation over inline handlers** — `data-*` attributes + `addEventListener` for XSS prevention
- **Progressive enhancement** — Motion One loaded as optional ES module; all call sites guarded with `if (window.Motion)`
- **Thread-safe shared state** — `_tabs_lock`, `_browse_cache_lock`, `recent._lock` protect module-level dicts under `ThreadingHTTPServer`
- **Size-gated metadata extraction** — all file-reading helpers gated behind 1MB size check in browse-dir handler
