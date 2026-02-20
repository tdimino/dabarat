# Dabarat Home Page Redesign

## Context

The current home page works but feels utilitarian—a detached sidebar explorer alongside a modest 2-column card grid, with the TOC hidden entirely. The file browser is disconnected from the card view: you can browse a directory in the sidebar, but the main area only shows "Recent Files" from a global list. There's no concept of a *workspace* where picking a folder populates the cards. Cards are narrow (2-per-row in ~900px), images in markdown have no lightbox, and the page loads with a basic CSS slide-in animation.

This plan redesigns the home page into a workspace-driven document hub with exceptional visual polish.

---

## Files to Modify

| File | Role | Changes |
|------|------|---------|
| `static/js/home.js` | Home screen logic | Rewrite: workspace mode, auto-populate cards from directory, wider card layout, Framer Motion orchestration |
| `static/css/home.css` | Home screen styles | Rewrite: full-width cards, glassmorphism, image effects, lightbox CSS, Framer Motion keyframes |
| `static/js/render.js` | Markdown render pipeline | Add: image click → lightbox handler, image wrapper with effects |
| `static/css/typography.css` | Image styling | Add: image border/glow effects, hover states, figure captions |
| `static/css/base-layout.css` | TOC sidebar | Modify: home-active state repurposes TOC as file browser instead of hiding it |
| `template.py` | HTML shell | Add: Framer Motion CDN, lightbox overlay DOM, new CSS module for lightbox |
| `server.py` | API endpoints | Enhance: `/api/browse-dir` to return richer metadata (file sizes, preview images, word counts) for workspace cards |
| `recent.py` | Recent files | Minor: ensure workspace entries are compatible with existing recent tracking |
| `static/css/responsive.css` | Breakpoints | Update: responsive rules for wider cards and workspace layout |

New files:
| File | Purpose |
|------|---------|
| `static/js/lightbox.js` | Image lightbox module (sleek overlay with zoom, pan, keyboard nav) |
| `static/css/lightbox.css` | Lightbox styles (backdrop blur, smooth transitions, minimal chrome) |

---

## Implementation

### 1. Workspace-Driven Home Page

**Concept**: When you land on the home page (no tabs open or click the home button), the TOC sidebar transforms into a directory browser. Selecting a folder populates the main area with cards for every `.md`/`.markdown`/`.txt` file in that directory. The "Recent Files" section becomes a secondary view toggle.

**TOC Sidebar → File Browser (when home-active)**

Instead of `toc.style.display = 'none'` (current behavior), the TOC sidebar *stays visible* and its content is swapped:

```
┌─ TOC Sidebar (repurposed) ───────────┐
│ [Collapse] ──────── [Font] [Theme]   │  ← chrome bar stays
│                                       │
│  WORKSPACE                            │  ← replaces "INDEX" label
│  ~/Desktop/Programming/               │  ← current workspace path
│                                       │
│  [Open Folder]  [Recent ↻]           │  ← toggle between workspace/recent
│                                       │
│  📁 agent_docs/                       │
│  📁 examples/                         │
│  📁 screenshots/                      │
│  ── ── ── ── ── ── ── ──            │
│  📄 README.md              3.2k ✏️   │
│  📄 CLAUDE.md              2.1k 💬4  │
│  📄 ARCHITECTURE.md        1.8k      │
│  📄 notes.txt              0.4k      │
│                                       │
│  ── ── ── ── ── ── ── ──            │
│  12 files · 24.6k words              │  ← workspace stats
└───────────────────────────────────────┘
```

Changes to `base-layout.css`:
- `body.home-active #toc` → keep `display: flex`, don't hide
- `body.home-active #toc-scroll` → receives file browser DOM instead of heading list
- `body.home-active #toc-label` → text changes to "WORKSPACE"
- `body.home-active #main-area` → keeps `margin-left: var(--toc-width)` (sidebar still visible)

Changes to `home.js`:
- `showHomeScreen()` → instead of hiding TOC, inject file browser into `#toc-scroll`
- New `renderWorkspaceSidebar(dirPath)` function builds the file tree
- New `setWorkspace(dirPath)` function → saves to localStorage, triggers card population
- `hideHomeScreen()` → restore TOC content from cached heading list

**Main Area — Workspace Cards**

When a workspace is set, the main area shows cards for all markdown files in that directory:

```
┌─ Main Area ─────────────────────────────────────────────────────────┐
│  [Home] [tab1.md] [tab2.md] [+]                            (tabs)  │
│                                                                      │
│  ~/Desktop/Programming/md-preview-and-annotate/                      │
│  12 files · 24.6k words                                              │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  📄 README.md                                     3 days ago │   │
│  │  ~/Desktop/Programming/md-preview-and-annotate/              │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │  # Markdown Dabarat                                     │ │   │
│  │  │  Zero-dependency Python markdown previewer with          │ │   │
│  │  │  annotations, bookmarks, and live reload...              │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  │  ✏️ 3,200 words  💬 4 annotations  🕐 12 versions  #draft   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  📄 CLAUDE.md                                     1 day ago  │   │
│  │  ...                                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

Key changes:
- **Single column layout**: Cards span the full content width (`grid-template-columns: 1fr` default, with a `2-column` option at very wide viewports >1600px)
- **Card minimum width**: ~500px, stretching to fill available space
- **Preview section is taller**: 120px rendered markdown preview (up from 88px)
- **Frontmatter badges larger and more prominent**
- **Remove the old `home-browser` aside** — the file browser is now in the TOC sidebar

**View Modes**:
- **Workspace** (default): shows files from the selected directory
- **Recent**: shows recently opened files (existing behavior, preserved)
- Toggle between them via buttons in the sidebar header

### 2. Enhanced `/api/browse-dir` Response

The server needs to return richer data for workspace cards. Currently it returns basic `name`, `path`, `type`, `badges`, `tags`. Enhance to include:

```json
{
  "path": "/absolute/path",
  "parent": "/parent",
  "stats": { "fileCount": 12, "totalWords": 24600 },
  "entries": [
    {
      "type": "file",
      "name": "README.md",
      "path": "/absolute/path/README.md",
      "size": 3200,
      "mtime": 1708099200.0,
      "wordCount": 3200,
      "annotationCount": 4,
      "versionCount": 12,
      "tags": ["draft"],
      "badges": { "type": "docs", "model": "opus-4.5" },
      "summary": "Zero-dependency Python markdown previewer...",
      "preview": "# Markdown Dabarat\n\nZero-dependency...",
      "previewImage": "/path/to/image.png"
    }
  ]
}
```

Changes to `server.py`:
- Enhance the `browse-dir` handler to call `recent._extract_summary()`, `recent._extract_preview()`, detect preview images, count words, read mtime — essentially the same enrichment `recent.add_entry()` does, but on-demand for all files in a directory
- Add a `stats` object with aggregate counts
- Cache results briefly (in-memory dict keyed by `(dirpath, max_mtime)`) to avoid re-scanning on every request

### 3. Wider Cards with Exceptional Design

**Card structure** (redesigned):

```html
<article class="home-card" data-filepath="...">
  <!-- Color accent strip at top based on file type -->
  <div class="home-card-accent" style="--accent: var(--ctp-blue)"></div>

  <div class="home-card-body">
    <div class="home-card-header">
      <div class="home-card-title-row">
        <i class="ph ph-file-md"></i>
        <h3>README.md</h3>
        <span class="home-card-time">3 days ago</span>
      </div>
      <p class="home-card-path">~/Desktop/Programming/md-preview-and-annotate/</p>
    </div>

    <!-- Frontmatter badges row -->
    <div class="home-card-badges">...</div>

    <!-- Markdown preview — full width, generous height -->
    <div class="home-card-preview">
      <div class="home-card-preview-content">
        <!-- Rendered markdown snippet -->
      </div>
      <div class="home-card-preview-fade"></div>
    </div>

    <!-- Footer with metadata -->
    <div class="home-card-footer">
      <span><i class="ph ph-text-aa"></i> 3,200</span>
      <span><i class="ph ph-chat-dots"></i> 4</span>
      <span><i class="ph ph-clock-counter-clockwise"></i> 12</span>
      <div class="home-card-tags">
        <span class="home-tag">#draft</span>
      </div>
    </div>
  </div>

  <!-- Hover: subtle remove button -->
  <button class="home-card-remove">...</button>
</article>
```

**Card CSS** (new design):

```css
.home-card {
  background: var(--ctp-surface0);
  border: 1px solid rgba(var(--ctp-surface1-rgb), 0.5);
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  cursor: pointer;
}

/* Accent strip — 3px colored top border based on file extension */
.home-card-accent {
  height: 3px;
  background: var(--accent, var(--ctp-blue));
}

.home-card:hover {
  border-color: rgba(var(--ctp-lavender-rgb), 0.3);
  transform: translateY(-2px);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(var(--ctp-lavender-rgb), 0.08);
}

/* Cards with preview images get a glass overlay effect */
.home-card-preview-img {
  position: relative;
}
.home-card-preview-img::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 40%,
    rgba(var(--ctp-surface0-rgb), 0.85) 100%
  );
}
```

**Grid layout:**

```css
.home-grid {
  display: grid;
  grid-template-columns: 1fr;    /* single column = max width */
  gap: 16px;
}

/* At very wide viewports, optionally 2 columns */
@media (min-width: 1600px) {
  .home-grid.grid-2col {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

**Card content padding**: 20px 24px (up from 16px 18px)
**Preview height**: 120px (up from 88px)
**Card border-radius**: 12px (up from 10px)

### 4. Framer Motion on the Home Page

**CDN Addition** (in `template.py`):

```html
<script src="https://cdn.jsdelivr.net/npm/framer-motion@11/dist/framer-motion.min.js"></script>
```

Wait — Framer Motion is a React library. Since Dabarat is vanilla JS, we'll use **Motion One** (`motion` package), which is the vanilla JS version by the same team (Matt Perry).

```html
<script src="https://cdn.jsdelivr.net/npm/motion@11/dist/motion.min.js"></script>
```

This gives us `window.Motion` with `animate`, `stagger`, `spring`, `inView`, `scroll` utilities.

**Animations to implement:**

1. **Card entrance** — staggered slide-up + fade:
   ```js
   Motion.animate('.home-card',
     { opacity: [0, 1], y: [24, 0] },
     { delay: Motion.stagger(0.06), duration: 0.4, easing: 'ease-out' }
   );
   ```

2. **Workspace header** — slide in from left:
   ```js
   Motion.animate('.home-header',
     { opacity: [0, 1], x: [-20, 0] },
     { duration: 0.3, easing: [0.22, 1, 0.36, 1] }
   );
   ```

3. **Sidebar file list** — cascade in:
   ```js
   Motion.animate('.hb-entry',
     { opacity: [0, 1], x: [-12, 0] },
     { delay: Motion.stagger(0.03), duration: 0.25 }
   );
   ```

4. **Card removal** — animate out before DOM removal:
   ```js
   await Motion.animate(cardEl,
     { opacity: 0, x: 40, scale: 0.95 },
     { duration: 0.2, easing: 'ease-in' }
   ).finished;
   cardEl.remove();
   ```

5. **View toggle** (workspace ↔ recent) — crossfade:
   ```js
   // Fade out old cards, swap content, fade in new cards
   await Motion.animate('.home-grid', { opacity: 0 }, { duration: 0.15 }).finished;
   // ... swap DOM ...
   Motion.animate('.home-card',
     { opacity: [0, 1], y: [16, 0] },
     { delay: Motion.stagger(0.04), duration: 0.3 }
   );
   ```

6. **Lightbox open/close** — scale + backdrop blur transition (see lightbox section)

Replace the current CSS `@keyframes homeCardSlide` with Motion One calls — remove the `animation-delay` inline styles from card HTML.

### 5. Image Lightbox

**New module: `static/js/lightbox.js`**

A sleek, minimal lightbox that activates when clicking any image in rendered markdown content.

**Behavior:**
- Click image in `#content` → open lightbox overlay
- Lightbox shows the image at native resolution (or screen-fitted)
- Backdrop: `backdrop-filter: blur(12px)` + dark overlay
- Close: click backdrop, press Escape, or click X button
- Keyboard: arrow keys for next/prev image in the document
- Zoom: scroll to zoom, double-click to toggle fit/actual
- Transition: image morphs from its inline position to centered (FLIP animation via Motion One)

**DOM structure** (added to `template.py`):

```html
<div id="lightbox-overlay" class="lightbox" aria-hidden="true">
  <button class="lightbox-close" aria-label="Close"><i class="ph ph-x"></i></button>
  <div class="lightbox-stage">
    <img id="lightbox-img" src="" alt="">
  </div>
  <div class="lightbox-caption" id="lightbox-caption"></div>
  <div class="lightbox-nav">
    <button class="lightbox-prev"><i class="ph ph-caret-left"></i></button>
    <span class="lightbox-counter" id="lightbox-counter"></span>
    <button class="lightbox-next"><i class="ph ph-caret-right"></i></button>
  </div>
</div>
```

**CSS (`static/css/lightbox.css`):**

```css
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s ease;
}
.lightbox.active {
  opacity: 1;
  pointer-events: auto;
}
.lightbox-stage img {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}
```

**JS hook** in `render.js` — after `render()` completes:

```js
// Attach lightbox to all content images (exclude emoji)
content.querySelectorAll('img:not(.emoji)').forEach((img, i) => {
  img.style.cursor = 'zoom-in';
  img.dataset.lightboxIndex = i;
  img.addEventListener('click', (e) => {
    e.preventDefault();
    openLightbox(img.src, img.alt, i);
  });
});
```

### 6. Image Effects in Markdown Content

**2025/2026 image treatment patterns:**

Current CSS for images is minimal: `img { max-width: 100%; border-radius: 8px; margin: 1em 0; }`

Enhanced treatment in `typography.css`:

```css
/* Content images — not emoji, not card previews */
#content img:not(.emoji):not(.tpl-var-img) {
  max-width: 100%;
  border-radius: 10px;
  margin: 1.5em 0;
  border: 1px solid rgba(var(--ctp-surface1-rgb), 0.5);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 0 0 1px rgba(var(--ctp-surface0-rgb), 0.3);
  transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
  cursor: zoom-in;
}

/* Hover: subtle lift + glow */
#content img:not(.emoji):not(.tpl-var-img):hover {
  transform: translateY(-2px) scale(1.005);
  border-color: rgba(var(--ctp-blue-rgb), 0.25);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.25),
    0 0 0 1px rgba(var(--ctp-blue-rgb), 0.12),
    0 0 20px rgba(var(--ctp-blue-rgb), 0.06);
}

/* Latte (light) theme — softer shadows */
[data-theme="latte"] #content img:not(.emoji):not(.tpl-var-img) {
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 0 0 1px rgba(var(--ctp-surface1-rgb), 0.4);
}
[data-theme="latte"] #content img:not(.emoji):not(.tpl-var-img):hover {
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.12),
    0 0 0 1px rgba(var(--ctp-blue-rgb), 0.15),
    0 0 20px rgba(var(--ctp-blue-rgb), 0.04);
}

/* Image figures — when markdown produces <figure> or we wrap standalone images */
.content-figure {
  margin: 2em 0;
  text-align: center;
}
.content-figure figcaption {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  color: var(--ctp-overlay1);
  margin-top: 8px;
  font-style: italic;
}
```

Key design choices:
- **Subtle border** (not heavy) — `1px solid` at low opacity, using theme-aware RGB vars
- **Layered shadows** — inner ring (`0 0 0 1px`) + soft spread (`0 2px 8px`) for depth
- **Hover glow** — faint accent-colored outer glow, like Linear/Notion image hover
- **Lift on hover** — `translateY(-2px)` + `scale(1.005)` for physicality
- **Zoom cursor** — indicates lightbox availability
- **Theme-aware** — separate Latte overrides with softer shadow values

### 7. Animation Library CDN Integration

Since Dabarat is pure vanilla JS (no React, no build system), we use **Motion One** (`@motionone/dom`)—the vanilla JS animation library by Matt Perry (creator of Framer Motion). Same spring physics and easing engine, works with plain DOM elements via `<script>` tag.

Add to `template.py` CDN section:

```html
<script type="module">
  import { animate, stagger, spring } from "https://cdn.jsdelivr.net/npm/@motionone/dom@10.18.0/+esm";
  window.Motion = { animate, stagger, spring };
</script>
```

Fallback: if the ESM import fails on older browsers, the existing CSS `@keyframes homeCardSlide` remains functional (progressive enhancement). All Motion One calls are wrapped in `if (window.Motion)` guards.

Add `lightbox.js` and `lightbox.css` to the module lists:

```python
_JS_MODULES = [
    "state.js", "utils.js", "theme.js", "render.js",
    "frontmatter.js", "variables.js", "tags.js", "tabs.js",
    "annotations.js", "diff.js", "editor.js", "history-ui.js",
    "lightbox.js",  # NEW
    "home.js",
    "polling.js", "init.js",
]

_CSS_MODULES = [
    "theme-variables.css", "base-layout.css", "typography.css",
    "annotations.css", "status-print.css", "responsive.css",
    "palette.css", "frontmatter.css", "variables-panel.css",
    "diff.css", "editor.css", "history-ui.css",
    "lightbox.css",  # NEW
    "home.css",
]
```

Add lightbox overlay DOM to the HTML body (after `#version-panel`, before `#status`).

---

## Build Sequence

1. **`template.py`** — Add Motion One CDN, lightbox DOM, register new CSS/JS modules
2. **`server.py`** — Enhance `/api/browse-dir` with rich metadata (word counts, previews, images, annotations)
3. **`lightbox.js` + `lightbox.css`** — New lightbox module (standalone, no deps on home.js)
4. **`typography.css`** — Image border/glow effects + hover states
5. **`render.js`** — Hook images to lightbox after render, add `cursor: zoom-in`
6. **`base-layout.css`** — Modify `body.home-active` rules: keep TOC visible, repurpose as workspace browser
7. **`home.css`** — Full rewrite: wider single-column cards, workspace header, glassmorphism, enhanced card design
8. **`home.js`** — Full rewrite: workspace mode, TOC-as-browser, Motion One animations, wider card builder
9. **`responsive.css`** — Update breakpoints for new layout

---

## Verification

1. **Launch**: `dabarat README.md` from the md-preview-and-annotate directory
2. **Home page**: Click home button → should see TOC sidebar as file browser with current directory's files, main area showing wide cards
3. **Workspace selection**: Click "Open Folder" in sidebar → pick any directory with .md files → cards populate
4. **Card interaction**: Click a card → opens as tab, home hides, TOC restores to heading view
5. **View toggle**: Switch between Workspace and Recent views in sidebar
6. **Lightbox**: Open a markdown file with images → click an image → lightbox opens with blur backdrop
7. **Lightbox nav**: Arrow keys to navigate between images, Escape to close
8. **Image effects**: Hover over images in markdown content → subtle lift + glow
9. **Animations**: Cards stagger in with Motion One, removal animates out, view toggle crossfades
10. **Responsive**: Resize window → cards remain single-column and readable down to 600px, sidebar collapses at 900px
11. **Theme**: Toggle dark/light → all new elements (lightbox, image effects, cards) adapt via CSS variables
12. **Persistence**: Reload page → last workspace directory is remembered, cards repopulate
