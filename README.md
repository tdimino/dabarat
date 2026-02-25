<p align="center">
  <img src="tanit.svg" alt="Tanit" width="120">
</p>

# Dabarat

AI-native markdown previewer with annotations, bookmarks, and live reload. Zero dependencies.

![Dark theme overview](screenshots/01-dark-full.png)

## Features

- **Live-reload preview** — 500ms polling detects file changes automatically
- **Multi-tab support** — open multiple `.md` files; cross-file linking via `--add`
- **Tab reuse** — launching a new file while the server is running adds it as a tab instead of restarting
- **5 annotation types** — Comment, Question, Suggestion, Important, Bookmark
- **Selection-based carousel** — select any text, pick an annotation type from the floating UI
- **Threaded replies** — reply to any annotation inline
- **Resolve/archive workflow** — resolved annotations move to a separate archive file
- **Global bookmark index** — bookmarks persist to `~/.claude/bookmarks/` with an `INDEX.md` and per-snippet files
- **Auto-cleanup of orphaned annotations** — when anchor text is deleted, its annotations are removed on next load
- **6 Catppuccin themes** — 3 dark (Mocha, Rosé Pine, Tokyo Storm) + 3 light (Latte, Rosé Pine Dawn, Tokyo Light), toggled in the status bar or settings panel
- **Resizable TOC sidebar** — drag the right edge to adjust width (persisted across sessions)
- **Switchable emoji styles** — Twitter (Twemoji), OpenMoji, Google Noto Color Emoji, or native OS emoji
- **Command palette** — `Cmd+K` / `Ctrl+K` for quick access to commands, tabs, and recent files
- **File tagging** — predefined + custom tags as colored pills in palette header, status bar, and tab bar
- **Prompt engineering support** — `.prompt.md` files with YAML frontmatter render metadata indicator bars and variable highlighting
- **Inline editing** — `Cmd+E` to edit raw markdown with change-tracking gutter, auto-save with atomic writes
- **Side-by-side diff** — compare any two markdown files with word-level granularity, synchronized scroll
- **Version history** — git-backed timeline panel with diff stats, compare any version, one-click restore
- **Workspace system** — VS Code-style `.dabarat-workspace` files with multi-root folders and pinned files
- **Image lightbox** — click any content image for overlay with blur backdrop, keyboard nav, zoom
- **Motion One animations** — staggered card entrance, sidebar cascade, view transitions; progressive enhancement
- **PDF export** — CLI or browser (`Cmd+K` → "Export PDF...") via headless Chrome CDP with theme preservation
- **Finder integration (macOS)** — `Dabarat.app` registers as default `.md` handler for double-click, drag-and-drop, and Open With

## Quick Start

```bash
python3 -m md_preview_and_annotate document.md
```

Opens in Chrome `--app` mode (falls back to default browser). No install, no build step, no dependencies.

```bash
# Multiple files
python3 -m md_preview_and_annotate file1.md file2.md

# Tab reuse — if the server is already running, new files open as tabs automatically
python3 -m md_preview_and_annotate another-file.md

# Open a workspace (multi-root folders + pinned files)
python3 -m md_preview_and_annotate --workspace research.dabarat-workspace

# Custom port and author
python3 -m md_preview_and_annotate document.md --port 8080 --author "Alice"

# Annotate from CLI (no browser needed)
python3 -m md_preview_and_annotate --annotate document.md \
  --text "some passage" --comment "This needs revision" --type suggestion
```

## Screenshots

### Annotation Panel

![Light theme with TOC sidebar, annotations panel, and background image](screenshots/03-annotations.png)

*Catppuccin Latte with background image, TOC sidebar, and annotation panel. Select any text to leave a note—each annotation is anchored to a specific passage with author, timestamp, and type badge.*

### Light Theme — Workspace with Smart Badges

![Light theme workspace showing Recent Files with smart badges and directory browser](screenshots/02-light-workspace.png)

*Workspace home in Catppuccin Latte. Recent Files view with smart badges (plan, readme, changelog, agent config), markdown previews, word counts, and directory browser sidebar.*

### Workspace Home with Quotes

![Workspace home screen with empty state quote and background image](screenshots/05-workspace-home.png)

*Empty workspace home with curated quotes cycling every 5 minutes. Background image visible through semi-transparent surfaces. Directory browser in the sidebar.*

## How It's Different

| Feature | Dabarat | markdown-annotations-svelte | md-review | Specmark |
|---------|---------|---------------------------|-----------|----------|
| Dependencies | **0** (Python stdlib) | Svelte + npm ecosystem | Node.js + npm | Web service |
| Annotation types | 5 (comment, question, suggestion, flag, bookmark) | Comments only | Inline comments | AI feedback |
| Themes | 6 Catppuccin (3 dark + 3 light) | Basic | Terminal | Web UI |
| Live reload | Yes (500ms) | No | No | N/A |
| Multi-tab | Yes | No | Yes | No |
| Threaded replies | Yes | No | No | No |
| Bookmark persistence | Global index | No | No | No |
| Tab reuse | Yes (automatic) | No | No | No |
| Multi-root workspaces | Yes (.dabarat-workspace) | No | No | No |
| Cross-file links | Yes | No | No | No |
| Orphan auto-cleanup | Yes | No | No | No |
| Last updated | 2026 | 2020 (abandoned) | 2026 | 2026 |

### Why this exists

Most markdown annotation tools either require a heavy framework (Svelte, React, Electron) or operate only in the terminal. This tool is:

- **Zero-dependency** — pure Python stdlib server. No npm, no pip install, no build step.
- **Modular** — 12 Python modules + 16 JS modules + 14 CSS modules, concatenated at serve time into a single HTML document.
- **AI-native** — built for Claude Code workflows. Annotate from CLI, bookmark to `~/.claude/`.
- **Beautiful** — Catppuccin theming with Cormorant Garamond, DM Sans, and Victor Mono typography. Motion One animations for staggered card entrance, sidebar cascade, and view transitions.

Six CDN scripts (marked.js, highlight.js, Phosphor Icons, Twemoji, Vibrant.js, Motion One) load on first page view and are cached by the browser. Motion One is optional—all animations fall back to CSS `@keyframes` if the CDN is unavailable. After first load, the tool works fully offline.

## CLI Reference

```
dabarat <file.md> [file2.md ...] [OPTIONS]
dabarat --workspace <path.dabarat-workspace> [OPTIONS]

Options:
  --port PORT            Server port (default: 3031)
  --author NAME          Default annotation author name (default: "Tom")
  --workspace FILE       Open a .dabarat-workspace file
  --max-instances N      Limit concurrent server instances (default: 5)
  --add FILE             Add a file to a running server instance
  --export-pdf FILE      Export to PDF via headless Chrome [-o out.pdf] [--theme mocha]
  --annotate FILE        Write an annotation to sidecar JSON (no server)
    --text TEXT            Anchor text to annotate
    --comment TEXT          Annotation body
    --type TYPE            comment | question | suggestion | important | bookmark
    --author NAME          Author name (default: "Claude")
```

## Finder Integration (macOS)

```bash
cd macos && bash build.sh      # Build Dabarat.app → ~/Applications/
brew install duti               # One-time
duti -s com.minoanmystery.dabarat .md all   # Set as default
```

See [docs/finder-integration.md](docs/finder-integration.md) for details.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/annotations.md](docs/annotations.md) | Schema, types, workflow, tags, CLI usage |
| [docs/command-palette.md](docs/command-palette.md) | Commands, tag mode, custom registration |
| [docs/workspaces.md](docs/workspaces.md) | Schema, creation, management, home page |
| [docs/finder-integration.md](docs/finder-integration.md) | macOS .app bundle, default handler, troubleshooting |
| [docs/backstory.md](docs/backstory.md) | Name etymology: D-B-R root, Lady of the Labyrinth |
| [docs/ecosystem.md](docs/ecosystem.md) | The ~/.claude/ directory and Claude Code integration |

## Architecture

```
md_preview_and_annotate/
├── __main__.py          # CLI entry point (serve, add, annotate, export-pdf, workspace)
├── server.py            # HTTP server + 36 REST API endpoints
├── template.py          # HTML shell assembly (inlines 16 JS + 14 CSS modules)
├── pdf_export.py        # CDP-based PDF export (stdlib WebSocket, zero deps)
├── annotations.py       # Sidecar JSON I/O + orphan cleanup + tag persistence
├── bookmarks.py         # Global ~/.claude/bookmarks/ persistence
├── frontmatter.py       # YAML frontmatter parser (stdlib, pyyaml fallback)
├── diff.py              # Side-by-side markdown diff engine (SequenceMatcher)
├── history.py           # Git-backed version history (~/.dabarat/history/)
├── recent.py            # Recently opened files + metadata extraction
├── workspace.py         # .dabarat-workspace CRUD + recent workspaces
└── static/
    ├── js/              # 16 modules concatenated in dependency order
    ├── css/             # 14 modules concatenated in dependency order
    └── palette.js       # Command palette + tag mode (Cmd+K)

macos/
├── build.sh             # Builds Dabarat.app AppleScript droplet
├── Info.plist           # UTI declarations, bundle metadata
└── INDEX.md
```

**Data flow:** `__main__.py` → `server.py` → `template.py` assembles a single HTML document (all JS/CSS inlined) → client renders markdown via marked.js → annotations round-trip through `server.py` ↔ `annotations.py` sidecar JSON. Bookmarks persist via `bookmarks.py` → `~/.claude/bookmarks/`. Edit mode saves via `/api/save` (atomic write + auto-commit to `history.py`).

## Origins

Where the name comes from: the Semitic root D-B-R, Plassmann's four-stage model, and the Lady of the Labyrinth. See [**docs/backstory.md**](docs/backstory.md).

## Companion Projects

Dabarat is part of the [Claudius](https://github.com/tdimino/claudius) ecosystem:

| Project | Description |
|---------|-------------|
| [claude-code-minoan](https://github.com/tdimino/claude-code-minoan) | Skill/agent/hook framework for Claude Code |
| [claudicle](https://github.com/tdimino/claudicle) | 4-layer soul agent framework for AI personalities |

## License

MIT
