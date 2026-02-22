# Changelog

All notable changes to Markdown Dabarat.

## [Unreleased] — 2026-02-20

### Workspace System
- **`.dabarat-workspace` files** — JSON schema (`version`, `name`, `folders[]`, `files[]`) for VS Code-style multi-root workspaces; readable, git-committable
- **Workspace CRUD** — `workspace.py` module with atomic writes, thread-safe mutations, recent tracking (`~/.dabarat/workspaces.json`, max 10)
- **13 new API endpoints** — workspace GET/POST, open, add-folder, add-file, remove, rename, save-as, browse-folder, browse-file, recent workspaces, file-metadata
- **Multi-root sidebar** — collapsible folder sections with per-entry file lists, pinned files section, `[+]` dropdown menu (Add Folder/File, New/Open Workspace), remove buttons on sections and entries
- **Merged card grid** — fan-out `Promise.all` across folder roots + pinned files; sections with folder name headers, stats, and remove actions
- **Recent workspaces bar** — horizontal card strip on home screen showing previously opened workspaces with folder/file counts and relative timestamps
- **Command palette integration** — 5 workspace commands (New, Open, Add Folder, Add File, Close Workspace); workspace-specific commands hidden when no workspace active
- **CLI `--workspace` flag** — `dabarat --workspace research.dabarat-workspace` loads workspace on startup; allows workspace-only launch (no file args required)
- **macOS native dialogs** — `osascript` for folder picker, file picker, and save-as dialogs
- **Empty state rotating quotes** — 30 curated quotes from Tom di Mino, classical sources (Plato, Heraclitus, Sappho, Thales), Harrison, Gordon, Astour, and Tamarru; cycles every 5 minutes with 300ms opacity crossfade; Cormorant Garamond italic typography

### Home Page Redesign
- **Workspace-driven home page** — TOC sidebar transforms into a directory browser when home screen is active; selecting a folder populates the main area with file cards
- **Enhanced `/api/browse-dir`** — returns rich metadata (word counts, summaries, preview images, annotation/version counts, frontmatter badges) with thread-safe caching
- **Image lightbox** — click any content image to open a sleek overlay with blur backdrop, keyboard navigation (arrows, Escape), and zoom support
- **Image effects** — content images get subtle border, layered shadows, hover lift + glow, zoom cursor; theme-aware Latte overrides
- **Motion One animations** — staggered card entrance, sidebar cascade, card removal animation, view toggle crossfade; progressive enhancement with `if (window.Motion)` guards
- **Wider card layout** — single-column cards at full width, 2-column at 900px+, 3-column at 1600px+; equal-height via flexbox
- **Smart file-type badges** — 10 pattern matchers detect prompt, agent config, plan, spec, readme, architecture, changelog, todo, license, and research files
- **Card description field** — pulls from frontmatter `description` > frontmatter `summary` > server-extracted summary
- **Workspace/Recent toggle** — switch between directory workspace view and recently opened files
- **Focus-visible states** — keyboard accessibility for cards, buttons, sidebar entries

### Home Page Polish
- **Simplified home cards** — removed redundant `home-card-desc` description line, stripped leading H1 from markdown preview (avoids filename duplication), reduced preview height 120→80px, increased grid gap 16→20px
- **Tab overflow handling** — tabs shrink with `flex-shrink:1` (min-width 60px, max-width 160px) and filename ellipsis; edge fade gradient indicators appear when tabs overflow; auto-scroll to active tab on switch; tab bar wrapped in `#tab-bar-wrapper` for fade positioning
- **Tab bar full-width** — `body.home-active` now clears `margin-right: 0` on both `#main-area` and `#tab-bar`, eliminating the 260px dead zone from the hidden annotations gutter
- **True-center empty state** — `.home-screen` uses flex column layout; `.home-empty` fills remaining space with `flex: 1` + `justify-content: center` for genuine vertical centering
- **Reduced empty state weight** — icon 48→36px, heading 22→18px, opacity 0.4→0.3 for quieter ambient UI
- **Ghost button for empty CTA** — "Open File" in empty state uses transparent background with `--ctp-surface1` border instead of filled blue; hover fills to `--ctp-surface0`
- **No duplicate buttons** — header "Open File" action suppressed in empty state; only the centered CTA appears
- **Sidebar button labels** — Workspace/Recent icon-only buttons now show text labels ("Files", "Recent") for discoverability
- **Segmented toggle** — Files/Recent buttons grouped in a `.ws-toggle` container with shared background, visually distinct from the "Open" action button
- **Button sizing** — sidebar buttons bumped from 10px/4px-padding to 11px/5px-padding with 28px min-height (desktop target per Vercel WIG)
- **Focus progressive pattern** — `.ws-btn` and `.home-open-btn` both follow `:focus` / `:focus-visible` / `:focus:not(:focus-visible)` convention

### Security Fixes
- **XSS prevention** — replaced all inline `onclick` handlers with `data-*` attributes + event delegation (eliminated path injection via HTML entity decoding)
- **Thread-safe browse cache** — `_browse_cache` protected by `threading.Lock()` under `ThreadingHTTPServer`
- **Path traversal defense** — `/api/preview-image` restricted to tab directories and cached browse directories
- **Size-gated extraction** — summary, preview, and image extraction gated behind 1MB file size check

### Bug Fixes
- **Lightbox null guards** — all 4 DOM references guarded; close-on-rerender prevents stale index
- **Stale TOC cache** — `_cachedTocContent` cleared unconditionally in `hideHomeScreen()`
- **Motion One selector fix** — animate DOM NodeList references instead of CSS selector strings
- **Cache deletion detection** — `dir_entry_count` added to cache key tuple

### CSS Cleanup
- **Zero hardcoded rgba** — eliminated all `rgba(0,0,0,...)` and `rgba(255,255,255,...)` values across 9 CSS files; all now use `rgba(var(--ctp-*-rgb), alpha)` pattern
- **Removed dual fade** — eliminated redundant `::after` pseudo-element on card preview
- **Removed redundant rule** — duplicate `body.home-active #main-area` margin handled by responsive.css

---

## [0.3.0] — 2026-02-19

### Origin Header Fix
- **CSRF compliance** — added `Origin` header to `--add` and tab reuse POST requests; fixes 403 errors when adding tabs to a running server

---

## [0.2.0] — 2026-02-18

### Modular Architecture
- **JS modularization** — split monolithic `app.js` (1,480 lines) into 12 modules in `static/js/` (~50-520 lines each), concatenated at serve time by `template.py`
- **CSS modularization** — split `styles.css` (2,417 lines) into 11 modules in `static/css/`, concatenated in dependency order
- **Module comment markers** — each module delimited by `/* -- module.js -- */` in the assembled output

### Edit Mode
- **Inline editing** (`Cmd+E`) — textarea-based raw markdown editor with canvas diff gutter
- **Change tracking** — line-by-line Myers diff against saved version; green (add), yellow (change), red (delete) gutter markers
- **Auto-save** — `POST /api/save` with atomic write (`tempfile` + `os.replace`), auto-commits to git version history
- **Tab/Shift+Tab** — indent/outdent with `document.execCommand` (preserves native undo stack)
- **Dirty state** — `beforeunload` guard, status bar indicator, save button highlight

### Diff Engine
- **Side-by-side markdown diff** — `diff.py` using `difflib.SequenceMatcher` with word-level granularity
- **Synchronized scroll** — left/right panels scroll in sync
- **Resizable split** — drag handle between diff panels

### File History
- **Git-backed version history** — `history.py` stores versions in `~/.dabarat/history/` with SHA-256 path keys
- **Version timeline panel** — slide-in panel with vertical timeline, diff stats embedded in commit messages (`+N/-M`)
- **Compare + Restore** — compare any version against current; restore with auto-save of current state first
- **Keyboard navigation** — Up/Down/Enter/R/Escape in timeline panel

### Lineage Navigation
- **Parent/child prompt lineage** — clickable navigation chips for `depends_on` relationships between `.prompt.md` files
- **`{{N}}` variable badge format** — variable count shown in frontmatter indicator bar

### Responsive Layout
- **Three-tier breakpoints** — 1400px (gutter collapse), 900px (TOC auto-collapse), 600px (compact mode)
- **Status bar flex truncation** — filepath truncates with ellipsis, word count and tags flex-shrink
- **Annotations toggle glassmorphism** — `backdrop-filter: blur(8px)` with `@supports` fallback

---

## [0.1.3] — 2026-02-17

### Prompt Engineering Support
- **YAML frontmatter parser** — stdlib-only `parse_yaml_subset()` with `pyyaml` fallback; handles BOM, CRLF, inline lists, block lists, list-of-dicts; mtime-cached
- **Metadata indicator bar** — clickable bar above content showing name, version, type, variable count
- **Metadata popup** — full modal with model, temperature, labels, tags, variables table with types/defaults/descriptions, and `depends_on` list
- **Template variable highlighting** — `{{variable}}` (Mustache) and `${variable}` (shell) slots highlighted as colored pills via DOM TreeWalker; CSS-only tooltips from frontmatter schema
- **Variable manifest panel** — gutter tab listing all variables with fill-in mode and rendered preview overlay
- **6 prompt-specific tags** — `prompt:system`, `prompt:user`, `prompt:assistant`, `prompt:chain`, `prompt:cognitive`, `prompt:tested`
- **3 example `.prompt.md` files** — demonstrating the format with real Aldea content

---

## [0.1.2] — 2026-02-16

### File Tagging System
- **Per-file tagging** — 7 predefined tags (`draft`, `reviewed`, `final`, `important`, `archived`, `research`, `personal`) + custom tags via `#` prefix in command palette
- **Tag persistence** — stored in sidecar JSON alongside annotations
- **Tag pills** — colored pills in palette header, status bar, and tab bar (max 3 dots)
- **Palette metadata header** — filename, path, word count, read time, annotation count, tag pills

### Command Palette
- **`Cmd+K` / `Ctrl+K`** — fuzzy search, keyboard navigation, recent files, extensible command registry
- **macOS Finder integration** — `.app` bundle registers as `.md` handler for Open With
- **Hint badge** — floating `Cmd+K` badge, 5-min visible, reappears after 2-min idle, disappears after 3 uses

### Bug Fixes
- **Palette click handling** — fixed closure bug where click handlers captured `flatIdx` by reference; fixed backdrop eating child clicks
- **Image serving** — added static file serving for images/assets referenced in markdown; directory traversal prevention
- **Hint badge positioning** — moved above status bar (`bottom: 42px`)
- **Recents timing** — deferred seeding until tabs populated

### Tab Reuse
- **Automatic tab reuse** — launching `dabarat file.md` while server is running adds the file as a tab instead of restarting

---

## [0.1.1] — 2026-02-15

### Resizable TOC
- **Drag handle** — right edge of TOC sidebar, 180-500px range, persisted to `localStorage`
- **TOC font sizes** — bumped +1px across all heading levels (h1: 13px, h2: 12px, h3: 11.5px, h4: 11px)
- **CSS custom property** — `--toc-width` drives TOC, main area, and collapse animation

---

## [0.1.0] — 2026-02-15

### Initial Release
- **Zero-dependency** — pure Python 3.10+ stdlib server; no pip, no npm, no build step
- **5 annotation types** — Comment, Question, Suggestion, Important, Bookmark
- **Selection-based carousel** — select text, pick annotation type from floating 5-button UI
- **Threaded replies** — reply to any annotation inline
- **Resolve/archive workflow** — resolved annotations move to `file.md.annotations.resolved.json`
- **Global bookmark index** — `~/.claude/bookmarks/INDEX.md` with per-snippet files
- **Orphan auto-cleanup** — stale anchors removed when text is deleted
- **Catppuccin Mocha/Latte themes** — toggled via status bar
- **Live reload** — 500ms polling detects file changes
- **Multi-tab support** — open multiple `.md` files; cross-file linking
- **Smart text anchoring** — selections span bold, italic, and code nodes
- **CLI annotation** — `--annotate` flag writes directly to sidecar JSON
- **Chrome `--app` mode** — frameless window with fallback to default browser
- **CDN dependencies** — marked.js, highlight.js, Phosphor Icons (cached after first load)
- **Typography** — Cormorant Garamond, DM Sans, Victor Mono
