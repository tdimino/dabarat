# Plan: Module 7 (Flow Visualizer) + Frontend Modularization

**Date**: 2026-02-17
**Repo**: `/Users/tomdimino/Desktop/Programming/md-preview-and-annotate/`
**Continues**: Phase 4 of the [prompt engineering plan](sequential-swinging-willow.md)

## Context

Phases 1–3 are complete (frontmatter, variables, highlighting, manifest panel, diff view, prompt tags). Module 7 (Flow Visualizer) is the final module. The user also requested modularization of the bloated frontend files:

| File | Lines | Target |
|------|-------|--------|
| `app.js` | 2133 | Split into 12 JS modules (~50–360 lines each) |
| `styles.css` | 2417 | Split into 11 CSS modules (~60–475 lines each) |
| Python files | 100–380 | Already good — no changes needed |

**Strategy**: Modularize first, then add flow as a clean new module. This avoids touching the same monolith twice and lets flow.js drop into the established pattern.

**Key insight**: `template.py` inlines all JS/CSS into a single HTML document. We split source files into `static/js/` and `static/css/` directories, then concatenate in dependency order at serve time. All functions remain in global scope — zero import/export changes needed. CSS cascading order is preserved exactly.

---

## Phase 1: Frontend Modularization

### Step 1: Create directory structure

```
static/
  js/
    state.js          (~20 lines)  — global vars, config
    utils.js          (~12 lines)  — slugify, escapeHtml
    theme.js          (~80 lines)  — font, theme, TOC resize
    render.js         (~110 lines) — render(), buildToc(), scroll spy, word count
    frontmatter.js    (~220 lines) — indicator bar, popup modal
    variables.js      (~360 lines) — highlighting, manifest panel, fill & preview
    tags.js           (~70 lines)  — fetchTags, addTag, removeTag, renderTagPills
    tabs.js           (~190 lines) — tab bar, switching, cross-file links
    annotations.js    (~520 lines) — highlights, bubbles, CRUD, text selection, gutter overlay
    diff.js           (~330 lines) — diff mode, scroll sync, resize
    polling.js        (~100 lines) — poll loop
    init.js           (~50 lines)  — bootstrap, init() call
  css/
    theme-variables.css  (~85 lines)  — Catppuccin Mocha + Latte color vars
    base-layout.css      (~390 lines) — resets, TOC, main area, tab bar
    typography.css       (~155 lines) — markdown elements, hljs tokens
    annotations.css      (~475 lines) — gutter, bubbles, carousel, form
    status-print.css     (~65 lines)  — status bar, print media
    responsive.css       (~63 lines)  — 1400px breakpoint
    palette.css          (~230 lines) — command palette, tag pills, hint badge
    frontmatter.css      (~325 lines) — indicator bar, popup, variable pills
    variables-panel.css  (~300 lines) — gutter tabs, cards, fill-in, preview overlay
    diff.css             (~322 lines) — diff header, stats, panels, blocks
  palette.js  (unchanged — stays top-level, loaded separately)
```

### Step 2: Extract JS modules from `app.js`

Split by the natural boundaries identified in exploration:

| Module | Source lines | Key exports |
|--------|-------------|-------------|
| `state.js` | 1–26 | `tabs`, `activeTabId`, `currentFrontmatter`, caches, fill-in state |
| `utils.js` | 104–113 | `slugify()`, `escapeHtml()` |
| `theme.js` | 25–102 | `applyFontSize()`, `adjustFont()`, `applyTheme()`, `toggleTheme()`, `toggleToc()`, TOC resize IIFE |
| `render.js` | 165–272 | `render()`, `buildToc()`, `updateActiveHeading()`, `updateWordCount()` |
| `frontmatter.js` | 274–490 | `renderFrontmatterIndicator()`, `showFrontmatterPopup()` |
| `variables.js` | 492–849 | `applyVariableHighlights()`, `switchGutterTab()`, `renderVariables()`, `buildVariableCard()`, `highlightVariableInContent()`, `toggleFillInMode()`, `resetFillInValues()`, `showVariablesPreview()`, `closeVariablesPreview()`, `_previewEscHandler` |
| `tags.js` | 850–917 | `fetchTags()`, `addTag()`, `removeTag()`, `renderTagPills()` |
| `tabs.js` | 919–1106, 1623–1659 | `renderTabBar()`, `switchTab()`, `fetchTabContent()`, `closeTab()`, `showAddFileInput()`, `openFileAsTab()` |
| `annotations.js` | 115–163, 1108–1621 | `updateAnnotationsBadge()`, `openGutterOverlay()`, `closeGutterOverlay()`, `findTextRange()`, `applyAnnotationHighlights()`, `renderAnnotations()`, CRUD, carousel, form handlers |
| `diff.js` | 1661–1987 | `diffState`, `enterDiffMode()`, `exitDiffMode()`, `renderDiff()`, scroll sync, resize, Escape handler |
| `polling.js` | 1988–2083 | `poll()` |
| `init.js` | 2085–2133 | `init()` + call |

### Step 3: Extract CSS modules from `styles.css`

Split at established section boundaries. Each module gets a section header comment.

### Step 4: Update `template.py` — concatenation logic

Replace single-file reads with ordered concatenation:

```python
_JS_DIR = os.path.join(_STATIC_DIR, "js")
_CSS_DIR = os.path.join(_STATIC_DIR, "css")

_JS_MODULES = [
    "state.js", "utils.js", "theme.js", "render.js",
    "frontmatter.js", "variables.js", "tags.js", "tabs.js",
    "annotations.js", "diff.js", "polling.js", "init.js",
]

_CSS_MODULES = [
    "theme-variables.css", "base-layout.css", "typography.css",
    "annotations.css", "status-print.css", "responsive.css",
    "palette.css", "frontmatter.css", "variables-panel.css",
    "diff.css",
]

def _concat_modules(directory, modules):
    parts = []
    for mod in modules:
        with open(os.path.join(directory, mod)) as f:
            parts.append(f"/* ── {mod} ── */\n{f.read()}")
    return "\n\n".join(parts)
```

Then in `get_html()`:
```python
css = _concat_modules(_CSS_DIR, _CSS_MODULES)
js = _concat_modules(_JS_DIR, _JS_MODULES)
palette_js = _read_static("palette.js")  # unchanged
```

### Step 5: Verify modularized build

Run with example files, test all features: tabs, render, frontmatter, variables, annotations, diff, palette, theme toggle. Compare behavior 1:1 with original.

### Step 6: Remove original monoliths

Delete `static/app.js` and `static/styles.css` after verification.

---

## Phase 2: Flow Visualizer (Module 7)

### Step 7: Create `flow.py` (~80 lines)

New file: `md_preview_and_annotate/flow.py`

Functions:
- `scan_directory(directory)` — list `.prompt.md` files, extract slug/name/type/depends_on from frontmatter
- `detect_cycles(nodes)` — DFS cycle detection, returns list of cycle edge tuples
- `generate_mermaid(nodes, cycles)` — build `graph TD` definition with type-based node styles (`chat`=blue, `text`=green, `code`=peach) and `click {slug} onFlowNodeClick` callbacks
- `build_flow(directory)` — pipeline: scan → detect → generate, returns `{mermaid, nodes, cycles, cycle_warning}`

Reuses `frontmatter.get_frontmatter()` — no new dependencies.

### Step 8: Add `/api/flow` endpoint to `server.py`

```python
elif parsed.path == "/api/flow":
    tab_id = params.get("tab", [None])[0]
    if tab_id and tab_id in self._tabs:
        directory = os.path.dirname(self._tabs[tab_id]["filepath"])
        result = flow.build_flow(directory)
        self._json_response(result)
    else:
        self._json_response({"error": "tab not found"}, 404)
```

Uses `tab` parameter (consistent with all other endpoints). Derives directory from tab's filepath.

### Step 9: Create `js/flow.js` (~150 lines)

State: `flowState = { active: false, nodeData: null }`

Functions:
- `ensureMermaid()` — lazy CDN load of mermaid@11.4.1, `startOnLoad: false`, Catppuccin `themeVariables`, `securityLevel: 'loose'` (needed for click callbacks; localhost-only tool, trusted data)
- `renderFlow()` — fetches `/api/flow?tab=`, enters flow mode (hides `#content`, shows `#flow-view`), renders header + cycle warning + Mermaid SVG
- `buildAsciiFallback(data)` — text fallback if CDN fails
- `exitFlowMode()` — hides flow view, restores `#content`, forces re-render
- `window.onFlowNodeClick(slug)` — global Mermaid click callback, calls `exitFlowMode()` then `openFileAsTab(filepath)`
- Escape key handler (defers to palette if open, same pattern as diff)

### Step 10: Create `css/flow.css` (~80 lines)

- `#flow-view` — flex column, full viewport minus tab bar and status
- `.flow-header` — title + count badge + close button (same pattern as diff header)
- `.flow-cycle-warning` — red left-border warning banner
- `.flow-diagram` — centered SVG container with overflow scroll
- `.flow-ascii` — Victor Mono pre-formatted fallback
- Latte overrides for warning/count colors

### Step 11: Register in `template.py` and `palette.js`

- Add `"flow.js"` to `_JS_MODULES` (between `"diff.js"` and `"polling.js"`)
- Add `"flow.css"` to `_CSS_MODULES` (after `"diff.css"`)
- Add `#flow-view` placeholder div in template HTML (inside `#main-area`, after `#diff-view`)
- Add "Show Flow Diagram" command to palette View category:
  ```javascript
  { id: 'show-flow', label: 'Show Flow Diagram', icon: 'ph-flow-arrow',
    action: () => { if (typeof renderFlow === 'function') renderFlow(); }
  }
  ```

### Step 12: Wire integrations

- `polling.js`: skip poll when `flowState.active` (same pattern as `diffState.active`)
- `diff.js` Escape handler: also check `flowState.active` and defer
- `tabs.js` `switchTab()`: call `exitFlowMode()` if flow is active

---

## Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | Create `static/js/` dir + 12 JS modules (extract from app.js) | 12 new files |
| 2 | Create `static/css/` dir + 10 CSS modules (extract from styles.css) | 10 new files |
| 3 | Update `template.py` concatenation logic | template.py |
| 4 | Verify all features work identically | (test) |
| 5 | Delete `app.js` and `styles.css` originals | 2 files removed |
| 6 | Create `flow.py` | flow.py (new) |
| 7 | Add `/api/flow` to server | server.py |
| 8 | Create `js/flow.js` | flow.js (new) |
| 9 | Create `css/flow.css` | flow.css (new) |
| 10 | Register in template + palette | template.py, palette.js |
| 11 | Wire polling/diff/tab integrations | polling.js, diff.js, tabs.js |
| 12 | Playwright test | /tmp/test-flow.js |

---

## Edge Cases

- **No `.prompt.md` files in directory**: `renderFlow()` shows nothing / silent no-op
- **All files have empty `depends_on`**: Valid graph with isolated nodes, no edges
- **Circular dependencies**: Cycle warning banner, edges still rendered (no crash)
- **Mermaid CDN offline**: ASCII fallback with node list and dependency arrows
- **Theme toggle while flow active**: Mermaid uses fixed colors from init; re-rendering on theme change is out of scope (flow is transient view)
- **Flow mode + diff mode**: Mutually exclusive — `renderFlow()` exits diff first if active
- **Narrow viewport (<1400px)**: Flow diagram scrolls horizontally; header stays fixed

---

## Verification

**Modularization**:
1. Open with 3 example files — confirm tabs, render, frontmatter, annotations, diff, palette, variables, theme all work
2. View page source — confirm module comment markers (`/* ── state.js ── */` etc.) appear in order
3. Run the full Playwright test suite from `/tmp/test-vars-panel.js` — all 12 tests pass

**Flow Visualizer**:
1. `Cmd+K` → "Show Flow Diagram" — confirm 3 nodes render (qakat-system, qakat-output-formats, joseph-campbell-qakat)
2. Confirm edge: qakat-system → qakat-output-formats
3. Click qakat-system node — confirm file opens as tab, flow mode exits
4. Escape key exits flow mode
5. Temporarily add circular dep — confirm warning banner appears
6. Block CDN — confirm ASCII fallback renders
7. Test Latte theme — confirm colors adapt
