# Client Architecture

16 JS modules in `static/js/` (concatenated into single inline script) + standalone `palette.js` (~1191 lines).

## Concatenated Modules (~4281 lines total)

### State
- `tabs` — object keyed by tab ID, holds `{ filepath, filename, content, mtime, scrollY }`
- `activeTabId` — currently displayed tab
- `currentFrontmatter` — parsed YAML frontmatter for the active tab (null if none)
- `annotationsCache` — keyed by tab ID, holds annotation arrays
- `tagsCache` — keyed by tab ID, holds tag arrays
- `annotateSelection` — current text selection for annotation creation
- `lastRenderedMd` / `lastRenderedAnnotationsKey` — deduplication keys to skip redundant DOM updates
- `emojiStyle` — active emoji set (`twitter`, `openmoji`, `noto`, `native`); persisted to localStorage
- `homeScreenActive` — whether the home/workspace screen is shown (suppresses content polling)
- `_cachedTocContent` — cached TOC innerHTML during home screen display, restored on hide

### Rendering Pipeline
1. `poll()` runs every 500ms, fetches `/api/content` for active tab
2. If `mtime` changed, sets `currentFrontmatter` from response, calls `render(md)` which:
   - Skips if `md === lastRenderedMd`
   - Parses markdown via `marked.parse()` (GFM mode)
   - Builds TOC from h1–h4 headings
   - Assigns heading IDs (`slugify(text) + '-' + index`)
   - Runs `hljs.highlightElement()` on code blocks
   - Calls `renderFrontmatterIndicator()` — clickable bar showing name, version, type, var count
   - Calls `applyVariableHighlights()` — wraps `{{var}}` and `${var}` in colored pills (BEFORE annotations)
   - Calls `applyEmojiStyle(content)` — renders emoji as SVGs via twemoji (or openmoji/noto CDN based on `emojiStyle`)
   - Calls `applyAnnotationHighlights()` to wrap annotated text in `<mark>` elements
   - Calls `attachLightboxToContent()` — attaches click handlers to content images (excludes `.emoji` and `.tpl-var-img`), rebuilds `_lightboxImages` array
3. Scroll spy updates active heading in TOC (throttled via `requestAnimationFrame`)

### Frontmatter System
- **Indicator bar**: `renderFrontmatterIndicator(fm)` — compact bar above content with name + badge pills
- **Popup**: `showFrontmatterPopup(fm)` — modal with metadata grid (model, temp, author, created), labels, tags, variables table, depends_on; scroll-locked backdrop with Escape/click-outside dismiss
- **Variable highlighting**: `applyVariableHighlights(fm)` — DOM TreeWalker finds `{{var}}` and `${var}` in text nodes, wraps in `.tpl-var-pill` spans with CSS-only tooltips from frontmatter schema; skips `<pre>`, `<code>`, already-highlighted nodes; processes in forward order using fragment replacement

### Annotation System
- **Text anchoring**: `findTextRange(container, searchText)` finds anchor text across DOM nodes
  - Fast path: single text node match
  - Slow path: concatenates all text nodes, finds match position, maps back to DOM range
  - Normalized fallback: handles `§`↔`Section`, whitespace collapse, case-insensitive matching
- **Highlight rendering**: `applyAnnotationHighlights()` wraps anchored text in `<mark class="annotation-highlight">` with data attributes
  - Multi-node spans: wraps partial range from start node when `surroundContents` can't span nodes
- **Bubble rendering**: `renderAnnotations()` builds the gutter panel with author, timestamp, type icon, body, replies, resolve/delete buttons
- **Carousel**: text selection triggers a floating 5-button carousel positioned above the selection; clicking a type opens the annotation form in the gutter

### Tab System
- Tab bar rendered by `renderTabBar()` — click to switch, X to close, + to add
- `switchTab()` saves scroll position, resets render caches, fetches content
- Tab reuse: server-side `--add` flag sends POST to running instance
- Cross-file links: clicking a `.md` link in content calls `openFileAsTab()` via POST `/api/add`

### Tags
- `fetchTags()` / `addTag()` / `removeTag()` manage server round-trips
- `renderTagPills()` updates status bar pills and tab bar dots (max 3 dots per tab)
- Tag colors shared with `CommandPalette.TAG_COLORS` (uses CSS variable references for theme-aware rendering)

### Theme & Preferences
- Theme: `localStorage('dabarat-theme')` — `mocha` or `latte`, applied via `data-theme` attribute
- Font size: `localStorage('dabarat-fontsize')` — 11–22px range, applied via CSS `--base-size`
- TOC width: `localStorage('dabarat-toc-width')` — 180–500px, draggable resize handle
- Active tab: `localStorage('dabarat-active-tab')` — restored on reload
- Emoji style: `localStorage('dabarat-emoji-style')` — `twitter` (default), `openmoji`, `noto`, `native`; twemoji's parser detects emoji, `EMOJI_CDNS` callbacks swap the CDN URL per set

## palette.js (~1191 lines)

### CommandPalette Object
Self-contained module with state, DOM construction, keyboard handling, command registry.

### Command Registry
- Built-in categories: File, View, Tags
- Dynamic commands: tab switching, close tab, recent files
- Third-party registration: `CommandPalette.register(category, commands)`

### Tag Mode
- Triggered by `#` prefix in search or "Add Tag..." command
- 7 predefined tags + 6 prompt tags with Catppuccin colors via CSS variable references (`var(--ctp-*)` / `rgba(var(--ctp-*-rgb), alpha)`)—auto-adapt to Mocha/Latte theme
- Custom tags: type any name, press Enter to create
- Tags persist via POST `/api/tags` → sidecar JSON

### File Metadata Header
- Shows filename, path, word count, read time, annotation count, tag pills
- Refreshed on every palette open

### Hint Badge
- Floating `Cmd+K` badge in bottom-right corner
- Shows for 5 minutes, reappears after 2 minutes of idle
- Disappears permanently after palette has been used

### Keyboard
- `Cmd+K` / `Ctrl+K` — toggle palette
- `Escape` — close palette (or exit tag mode)
- `Arrow Up/Down` — navigate items
- `Enter` — execute selected command

## editor.js (~304 lines)

### Edit Mode
- `enterEditMode()` — switches to textarea-based raw markdown editing
- `exitEditMode(force)` — returns to rendered view, prompts on unsaved changes
- `editState` — tracks active, dirty, savedContent, baseContent, savedLines
- **Change gutter**: line-by-line diff against saved content, colored indicators (green=add, yellow=change, red=delete)
- **Auto-save**: `POST /api/save` with atomic write, auto-commits to version history
- `updateEditGutter()` — computes line diffs, renders colored markers
- `updateEditStatus()` — status bar indicator (Saved/Unsaved)

## history-ui.js (~145 lines)

### Version History Panel
- `gutterMode` state — toggles between `'none'`, `'annotations'`, `'versions'`
- `openVersionPanel()` / `closeVersionPanel()` — slide-in panel for version timeline
- `loadVersionHistory()` — fetches `GET /api/versions`, renders skeleton loaders during load
- `renderVersionTimeline(versions)` — renders commit entries with relative timestamps, diff stats
- Restore button calls `POST /api/restore` to revert file to a previous version

## lightbox.js (~113 lines)

### Image Lightbox
- `openLightbox(src, alt, index)` — opens overlay with image at native resolution, sets counter
- `closeLightbox()` — hides overlay, restores body scroll, optional Motion One fade-out
- `attachLightboxToContent()` — called after `render()`, queries all `img:not(.emoji):not(.tpl-var-img)` in content, attaches click handlers with `data-lightbox-index`, builds `_lightboxImages` array
- **Private state**: `_lightboxImages` (array of `{src, alt}`), `_lightboxIndex` (current position)
- **Keyboard**: Left/Right arrows navigate, Escape closes
- **DOM**: All 4 references (`overlay`, `img`, `caption`, `counter`) null-guarded; overlay closed on re-render to prevent stale index
- **Motion One**: `if (window.Motion)` guard on open/close animations; CSS fallback via `opacity` transition
- **Zero cross-module dependencies** — only called from `render.js` via `typeof attachLightboxToContent === 'function'` feature-check

## home.js (~555 lines)

### Workspace-Driven Home Page
- `showHomeScreen()` — sets `homeScreenActive = true`, adds `body.home-active` class, caches TOC innerHTML in `_cachedTocContent`, injects workspace sidebar into `#toc-scroll`
- `hideHomeScreen()` — restores TOC content from cache (cleared unconditionally), resets `lastRenderedMd = null` to force repaint
- `setHomeView(mode)` — toggles between `'workspace'` and `'recent'` views with Motion One crossfade
- `setWorkspace(dirPath)` — saves to `localStorage('dabarat-browse-dir')`, triggers sidebar + card population
- `openRecentFile(filepath)` — debounced (`_recentFileOpening` flag), calls `POST /api/add` + `switchTab()`
- `removeRecentFile(path, cardEl)` — `POST /api/recent/remove`, Motion One exit animation before DOM removal

### Workspace Sidebar (TOC repurposed)
- `_renderWorkspaceSidebar(dirPath)` — builds sidebar HTML with path, stats, Open/Files/Recent buttons
- `_loadWorkspaceSidebarEntries(dirPath)` — fetches `GET /api/browse-dir`, renders entries with Motion One cascade
- Folder entries navigate into subdirectories; file entries show size badges
- Uses `data-path` attributes + event delegation (no inline `onclick`) for XSS safety
- **Button layout**: "Open" action button (`.ws-btn-action`) + segmented toggle (`.ws-toggle`) containing "Files" and "Recent" view mode buttons—all with visible text labels, 28px min-height, 11px font

### File Cards
- `_renderHomeContent(data, mode)` — builds card grid from browse-dir or recent API response
- **Smart badges**: 10 pattern matchers in `_fileBadges` array detect prompt, agent config, plan, spec, readme, architecture, changelog, todo, license, research files (client-side, heuristic)
- **Card description**: pulls from frontmatter `description` > frontmatter `summary` > server-extracted summary
- **Accent colors**: per-extension color strip (`_accentColors` map) using Catppuccin palette
- **Motion One**: staggered card entrance (`delay: Motion.stagger(0.06)`), guarded with `if (window.Motion)`
- **Equal-height**: flexbox column layout with `flex: 1` on card body
- **Responsive**: single-column default, 2-column at 900px+, 3-column at 1600px+
- **Empty state**: flex-centered in viewport (`.home-empty` with `flex: 1; justify-content: center`), ghost button CTA; header "Open File" action button suppressed when `entries.length === 0` to avoid duplication

### State
- `_fileBrowserPath` — current workspace directory (persisted to localStorage)
- `_homeViewMode` — `'workspace'` or `'recent'` (persisted to localStorage)
- `_cachedTocContent` — saved TOC innerHTML (cleared unconditionally in `hideHomeScreen()`)
- `_recentFileOpening` — debounce flag for rapid click prevention
