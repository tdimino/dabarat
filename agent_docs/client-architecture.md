# Client Architecture

Two JS modules — `app.js` (rendering, state, annotations, frontmatter, variable highlighting) and `palette.js` (command palette + tags).

## app.js (~1480 lines)

### State
- `tabs` — object keyed by tab ID, holds `{ filepath, filename, content, mtime, scrollY }`
- `activeTabId` — currently displayed tab
- `currentFrontmatter` — parsed YAML frontmatter for the active tab (null if none)
- `annotationsCache` — keyed by tab ID, holds annotation arrays
- `tagsCache` — keyed by tab ID, holds tag arrays
- `annotateSelection` — current text selection for annotation creation
- `lastRenderedMd` / `lastRenderedAnnotationsKey` — deduplication keys to skip redundant DOM updates

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
   - Calls `applyAnnotationHighlights()` to wrap annotated text in `<mark>` elements
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
- Tag colors shared with `CommandPalette.TAG_COLORS`

### Theme & Preferences
- Theme: `localStorage('mdpreview-theme')` — `mocha` or `latte`, applied via `data-theme` attribute
- Font size: `localStorage('mdpreview-fontsize')` — 11–22px range, applied via CSS `--base-size`
- TOC width: `localStorage('mdpreview-toc-width')` — 180–500px, draggable resize handle
- Active tab: `localStorage('mdpreview-active-tab')` — restored on reload

## palette.js (~650 lines)

### CommandPalette Object
Self-contained module with state, DOM construction, keyboard handling, command registry.

### Command Registry
- Built-in categories: File, View, Tags
- Dynamic commands: tab switching, close tab, recent files
- Third-party registration: `CommandPalette.register(category, commands)`

### Tag Mode
- Triggered by `#` prefix in search or "Add Tag..." command
- 7 predefined tags with Catppuccin colors: draft, reviewed, final, important, archived, research, personal
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
