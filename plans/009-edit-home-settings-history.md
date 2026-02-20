# Plan: md-preview-and-annotate — Edit Mode, Home Screen, Settings & UI Polish

## Enhancement Summary

**Deepened on:** 2026-02-18
**Research agents used:** 8 (UI polish, settings panel, edit mode, git versioning, home screen, version history browser, security sentinel, performance oracle)

### Key Improvements from Research
1. **Security hardening**: Path traversal defense for `/api/save`, git hash validation (`^[0-9a-f]{4,40}$`), CSRF origin checking, atomic file writes
2. **Performance**: `ThreadingHTTPServer` (one-line change), canvas-based edit gutter (not 10K DOM elements), Web Worker for diff on large files, store diff stats in commit messages (zero extra diffs for version history)
3. **Click-outside**: Upgraded from simple click handler to dual mousedown+mouseup pattern with AbortController lifecycle management and selection guard
4. **Opacity**: Changed from `body.style.opacity` (makes text translucent) to per-surface `rgba()` backgrounds with alpha channel
5. **Edit mode**: `document.execCommand('insertText')` preserves native undo stack; Tab/Shift+Tab indent handling; shared scroll container architecture
6. **Home screen**: Atomic JSON writes via tempfile + `os.replace()`, `Intl.RelativeTimeFormat` for timestamps, stretched-link card pattern, skeleton loading
7. **Version history**: Vertical timeline with dots/line, stats embedded in commit messages for O(1) retrieval, keyboard navigation (Up/Down/Enter/R/Escape)

### New Considerations Discovered
- **CSRF on localhost**: Any website can POST to `localhost:3031`—must check Origin/Referer headers
- **Git flag injection**: User-supplied "hashes" starting with `-` are interpreted as git flags—must validate + use `--` separator
- **Edit diff bottleneck**: Myers diff on 10K-line file takes 50-100ms per tick—needs Web Worker or partial-region diff
- **Frontmatter cache leak**: `_fm_cache` in `frontmatter.py` grows unboundedly—add LRU eviction at 20 entries

---

## Context

Building on the existing md-preview-and-annotate tool (zero-dependency Python markdown previewer), this plan adds 9 features organized in implementation order. Features 1-4 are quick UI fixes, Features 5-9 are major new capabilities.

---

## Feature 1: Gutter Panel Click-Outside-to-Close

**Problem**: Annotations overlay only closes via toggle button or X button.

### `annotations.js` — modify `openGutterOverlay()` (~line 28)

Use dual mousedown+mouseup pattern with AbortController for reliable lifecycle management. This prevents false triggers during text selection and ensures cleanup on close.

```javascript
let _gutterDismissCtrl = null;

function openGutterOverlay() {
  const gutter = document.getElementById('annotations-gutter');
  gutter.classList.add('overlay-open');

  /* Clean up any previous listener set */
  if (_gutterDismissCtrl) _gutterDismissCtrl.abort();
  _gutterDismissCtrl = new AbortController();
  const signal = _gutterDismissCtrl.signal;

  const ignoreSelectors = [
    '#annotations-gutter',
    '#annotations-toggle',
    '.annotation-carousel',
    '.annotation-highlight'
  ];

  let mousedownOutside = false;

  /* Dual-event pattern: mousedown+mouseup must BOTH be outside */
  document.addEventListener('mousedown', (e) => {
    mousedownOutside = !ignoreSelectors.some(sel =>
      e.target.closest(sel)
    );
  }, { signal });

  document.addEventListener('mouseup', (e) => {
    /* Selection guard: don't dismiss if user was selecting text */
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;

    const upOutside = !ignoreSelectors.some(sel =>
      e.target.closest(sel)
    );
    if (mousedownOutside && upOutside) {
      closeGutterOverlay();
    }
  }, { signal });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGutterOverlay();
  }, { signal });
}

function closeGutterOverlay() {
  const gutter = document.getElementById('annotations-gutter');
  gutter.classList.remove('overlay-open');
  if (_gutterDismissCtrl) {
    _gutterDismissCtrl.abort();
    _gutterDismissCtrl = null;
  }
}
```

### Research Insights

**Best Practices:**
- Dual mousedown+mouseup prevents false dismissal during text selection drags
- `AbortController` auto-removes all listeners on close—no manual `removeEventListener` needed
- `ignoreSelectors` array makes it easy to add more exclusions (e.g., annotation form inputs)
- Selection guard via `window.getSelection().toString().length` prevents dismissal when user finishes selecting text

**Edge Cases:**
- Click starts inside gutter, drags outside → `mousedownOutside=false` → no dismiss (correct)
- Escape during annotation form input → should dismiss or not? Current: always dismisses. Could add form dirty check.

---

## Feature 2: Annotations Toggle Button — Lighter Background

### `responsive.css` — modify `#annotations-toggle` (~line 9)

Use glassmorphism with `@supports` fallback for older hardware:

```css
#annotations-toggle {
  background: rgba(30, 30, 46, 0.7);     /* opaque enough without blur */
  border: 1px solid var(--ctp-surface1);
}

@supports (backdrop-filter: blur(8px)) {
  #annotations-toggle {
    background: rgba(30, 30, 46, 0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
}

[data-theme="latte"] #annotations-toggle {
  background: rgba(230, 233, 239, 0.8);
}

@supports (backdrop-filter: blur(8px)) {
  [data-theme="latte"] #annotations-toggle {
    background: rgba(230, 233, 239, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
}
```

### Research Insights

**Performance:**
- `backdrop-filter: blur()` creates a GPU-composited layer—free for a single small element on modern macOS
- Cap blur at 12px—diminishing visual returns above that, increasing GPU cost
- Do NOT apply `backdrop-filter` to large elements (home screen bg, settings panel)
- `@supports` fallback uses higher opacity (0.7/0.8) so it looks fine without blur

---

## Feature 3: TOC Font Size Control (Independent from Body)

**Problem**: Body font adjust (`--base-size`) doesn't affect TOC, but user wants independent TOC sizing.

### `theme.js` — add TOC font size state and functions

```javascript
let tocSize = parseInt(localStorage.getItem('mdpreview-toc-fontsize') || '0');
/* 0 = default (no override), otherwise offset in px from defaults */

function applyTocFontSize() {
  document.documentElement.style.setProperty('--toc-size-offset', tocSize + 'px');
  const display = document.getElementById('toc-font-size-display');
  if (display) display.textContent = tocSize === 0 ? 'A' : (tocSize > 0 ? '+' + tocSize : tocSize);
  localStorage.setItem('mdpreview-toc-fontsize', tocSize);
}

function adjustTocFont(delta) {
  tocSize = Math.max(-4, Math.min(6, tocSize + delta));
  applyTocFontSize();
}
```

### `template.py` — add TOC font controls in `#toc-chrome`

After the theme toggle, add a second set of +/- buttons labeled for TOC:

```html
<span style="width:6px"></span>
<button class="ctrl-btn" onclick="adjustTocFont(-1)" title="TOC smaller"><i class="ph ph-text-aa"></i></button>
<span id="toc-font-size-display" style="...same as font-size-display...">A</span>
<button class="ctrl-btn" onclick="adjustTocFont(1)" title="TOC larger"><i class="ph ph-text-aa"></i></button>
```

### `base-layout.css` — apply `--toc-size-offset` to TOC entries

Use `calc()` to offset each TOC level's font-size:

```css
#toc .toc-h1 { font-size: calc(13px + var(--toc-size-offset, 0px)); }
#toc .toc-h2 { font-size: calc(12px + var(--toc-size-offset, 0px)); }
#toc .toc-h3 { font-size: calc(11.5px + var(--toc-size-offset, 0px)); }
#toc .toc-h4 { font-size: calc(11px + var(--toc-size-offset, 0px)); }
```

### Research Insights

**Performance:** TOC has at most 100-200 entries. Changing `--toc-size-offset` triggers reflow only on those elements. Cost: sub-1ms. No optimization needed.

---

## Feature 4: CSS Opacity Toggle (Ghostty-Style)

### `theme.js` — REVISED: per-surface rgba() backgrounds

**CRITICAL CHANGE**: Do NOT use `body.style.opacity`—it makes ALL content (including text) translucent. Instead, use per-surface `rgba()` backgrounds that embed the alpha channel.

```javascript
const OPACITY_STEPS = [1.0, 0.95, 0.90, 0.85, 0.80, 0.70];
let opacityIndex = parseInt(localStorage.getItem('mdpreview-opacity-idx') || '0');

/* Catppuccin base colors for each surface */
const SURFACE_COLORS = {
  mocha: { base: [30,30,46], mantle: [24,24,37], crust: [17,17,27] },
  latte: { base: [239,241,245], mantle: [230,233,239], crust: [220,224,232] }
};

function applyOpacity() {
  const alpha = OPACITY_STEPS[opacityIndex];
  const theme = currentTheme || 'mocha';
  const colors = SURFACE_COLORS[theme];

  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  document.documentElement.style.setProperty('--body-bg', rgba(colors.base, alpha));
  document.documentElement.style.setProperty('--toc-bg', rgba(colors.mantle, alpha));
  document.documentElement.style.setProperty('--crust-bg', rgba(colors.crust, alpha));

  localStorage.setItem('mdpreview-opacity-idx', opacityIndex);
}

function toggleOpacity() {
  opacityIndex = (opacityIndex + 1) % OPACITY_STEPS.length;
  applyOpacity();
}

/* Re-apply on theme toggle */
// Add call to applyOpacity() inside applyTheme()

/* Cmd+U keybinding */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
    e.preventDefault();
    toggleOpacity();
  }
});
```

### CSS changes

Replace hard-coded backgrounds with CSS variables:

```css
body { background: var(--body-bg, var(--ctp-base)); }
#toc { background: var(--toc-bg, var(--ctp-mantle)); }
#tab-bar { background: var(--crust-bg, var(--ctp-crust)); }
```

### Research Insights

**Why not `body.style.opacity`:**
- `opacity` affects ALL descendants—text becomes translucent, unreadable at low values
- Per-surface `rgba()` keeps text at full opacity, only backgrounds become translucent
- Floor at 0.70 (6 discrete steps) prevents accidentally making window invisible

**Security:**
- Validate opacity index from localStorage against `OPACITY_STEPS.length` bounds
- Never apply raw localStorage values to style properties

### Command palette integration

Register in `palette.js` CommandPalette commands:
```javascript
{ name: 'Toggle Transparency', icon: 'ph-eye', action: toggleOpacity, category: 'View' }
```

---

## Feature 5: Settings Panel (via Command Palette)

### Architecture

Settings panel lives inside the existing command palette modal. When user selects "Settings" or types `>settings`, the palette switches from command list to a settings view. Uses same pattern as existing tag mode (`_tagMode`).

### `palette.js` — add settings mode

**Settings state**: stored in `localStorage` with `mdpreview-*` keys, same as existing preferences.

**Settings schema** (data-driven, with validation):
```javascript
const SETTINGS_SCHEMA = [
  { category: 'Appearance', items: [
    { key: 'theme', label: 'Theme', type: 'toggle', options: ['mocha', 'latte'],
      get: () => currentTheme,
      set: (v) => { if (['mocha','latte'].includes(v)) { currentTheme = v; applyTheme(); } }
    },
    { key: 'fontsize', label: 'Body Font Size', type: 'slider', min: 11, max: 22, step: 1,
      get: () => currentSize,
      set: (v) => { v = Math.max(11, Math.min(22, parseInt(v))); currentSize = v; applyFontSize(); }
    },
    { key: 'tocfontsize', label: 'TOC Font Size Offset', type: 'slider', min: -4, max: 6, step: 1,
      get: () => tocSize,
      set: (v) => { v = Math.max(-4, Math.min(6, parseInt(v))); tocSize = v; applyTocFontSize(); }
    },
    { key: 'opacity', label: 'Window Opacity', type: 'slider', min: 0, max: 5, step: 1,
      get: () => opacityIndex,
      set: (v) => { opacityIndex = Math.max(0, Math.min(5, parseInt(v))); applyOpacity(); }
    },
  ]},
  { category: 'Editor', items: [
    { key: 'author', label: 'Default Author', type: 'text',
      get: () => defaultAuthor,
      set: (v) => { /* sanitize and update */ }
    },
    { key: 'tocwidth', label: 'TOC Width', type: 'slider', min: 180, max: 500, step: 10,
      get: () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--toc-width')),
      set: (v) => { /* update CSS var + localStorage */ }
    },
  ]},
];
```

**Mode switching** (same pattern as tag mode):
```javascript
_settingsMode: false,

_enterSettingsMode() {
  this._settingsMode = true;
  this._input.placeholder = 'Search settings...';
  this._renderSettingsPanel();
},

_exitSettingsMode() {
  this._settingsMode = false;
  this._input.placeholder = 'Type a command...';
  this._input.value = '';
  this._renderCommands();
},
```

**Rendering**: Back arrow + category headers with sticky positioning. Each control type (toggle, slider, text) has a builder function. Changes apply immediately.

### Research Insights

**Best Practices:**
- Range slider uses `--range-pct` CSS variable for filled track via `linear-gradient`
- `requestAnimationFrame` coalescing for slider drag (prevents repaint jank with large documents):
  ```javascript
  let rafPending = {};
  function onSliderChange(key, value, setter) {
    if (rafPending[key]) return;
    rafPending[key] = true;
    requestAnimationFrame(() => { setter(value); rafPending[key] = false; });
  }
  ```
- Version migration via `SETTINGS_VERSION` key for future schema changes

### `palette.css` — add settings panel styles

Compact settings rows: label left, control right. Category headers with Catppuccin accent borders. Slider styled with `--ctp-blue` accent.

---

## Feature 6: Edit Markdown Mode

### Architecture

**Approach**: Textarea-based editing with a canvas-based diff gutter. When edit mode is active:
1. Hide rendered `#content`, show `#edit-view` (textarea + canvas gutter)
2. Textarea contains raw markdown
3. On each keystroke (debounced **500ms**), compute line-level diff against saved version
4. Render colored canvas gutter: green (added), yellow (changed), red (deleted)
5. "Save" button writes to disk + auto-commits to git history

### New files
- `static/js/editor.js` — edit mode logic, diff gutter, save handler
- `static/css/editor.css` — textarea styling, gutter markers, toolbar

### `editor.js` — core functions

```javascript
let editState = {
  active: false,
  dirty: false,
  savedContent: '',
  baseContent: '',
  savedLines: [],   /* Pre-split at enter time — avoid re-splitting on every diff */
  tabId: null
};

function enterEditMode() {
  editState.active = true;
  editState.dirty = false;
  editState.tabId = activeTabId;
  editState.savedContent = tabs[activeTabId].content;
  editState.baseContent = tabs[activeTabId].content;
  editState.savedLines = editState.baseContent.split('\n');

  document.body.classList.add('edit-mode');
  document.getElementById('content').style.display = 'none';
  document.getElementById('edit-view').style.display = 'flex';

  const textarea = document.getElementById('edit-textarea');
  textarea.value = editState.savedContent;
  textarea.focus();
  updateEditGutter();
}

function exitEditMode(discard) {
  if (!discard && editState.dirty) {
    if (!confirm('Discard unsaved changes?')) return;
  }
  editState.active = false;
  editState.dirty = false;
  document.body.classList.remove('edit-mode');
  document.getElementById('edit-view').style.display = 'none';
  document.getElementById('content').style.display = '';
  lastRenderedMd = '';
  render(tabs[activeTabId].content);
}

async function saveEdit() {
  const content = document.getElementById('edit-textarea').value;
  const res = await fetch('/api/save', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ tab: activeTabId, content: content })
  });
  const data = await res.json();
  if (data.ok) {
    tabs[activeTabId].content = content;
    tabs[activeTabId].mtime = data.mtime;
    editState.savedContent = content;
    editState.baseContent = content;
    editState.savedLines = content.split('\n');
    editState.dirty = false;
    updateEditGutter();
    updateEditStatus('Saved');
  }
}
```

### Diff gutter — CANVAS-BASED (not DOM elements)

For a 10,000-line file, DOM-based gutter would create 10K `<div>` elements. Use a `<canvas>` instead:

```javascript
function updateEditGutter() {
  const current = document.getElementById('edit-textarea').value.split('\n');
  const opcodes = myersDiff(editState.savedLines, current);
  renderGutterCanvas(opcodes);
}

function renderGutterCanvas(opcodes) {
  const canvas = document.getElementById('edit-gutter-canvas');
  const textarea = document.getElementById('edit-textarea');
  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
  const ctx = canvas.getContext('2d');

  canvas.height = textarea.scrollHeight;
  canvas.width = 4;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const COLORS = {
    insert: getComputedStyle(document.documentElement).getPropertyValue('--ctp-green').trim(),
    delete: getComputedStyle(document.documentElement).getPropertyValue('--ctp-red').trim(),
    replace: getComputedStyle(document.documentElement).getPropertyValue('--ctp-yellow').trim()
  };

  for (const [tag, i1, i2, j1, j2] of opcodes) {
    if (tag === 'equal') continue;
    ctx.fillStyle = COLORS[tag] || COLORS.replace;
    const y = j1 * lineHeight;
    const h = Math.max((j2 - j1) * lineHeight, 2);
    ctx.fillRect(0, y, 4, h);
  }
}

/* Debounce at 500ms (not 300ms) — halves computation frequency */
const _editGutterDebounce = debounce(updateEditGutter, 500);
```

### Myers diff (~55 lines JS)

```javascript
function myersDiff(oldLines, newLines) {
  /* Lightweight Myers diff returning opcodes:
     [['equal',i1,i2,j1,j2], ['insert',...], ['delete',...], ['replace',...]] */
  // ... ~55 lines, port of Python difflib SequenceMatcher logic
  // For files > 5000 lines, consider Web Worker (see performance notes)
}
```

### Tab/Shift+Tab handling with undo preservation

```javascript
textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    if (e.shiftKey) {
      /* Outdent: remove leading 2 spaces */
      // ... replaceSelection logic
    } else {
      document.execCommand('insertText', false, '  ');
    }
  }
  if (e.key === 'Enter') {
    /* Auto-indent: match leading whitespace of current line */
    // ... plus list continuation (- / * / 1.)
  }
});

/* Track dirty state */
textarea.addEventListener('input', () => {
  editState.dirty = textarea.value !== editState.savedContent;
  updateEditStatus(editState.dirty ? 'Modified' : 'Saved');
  _editGutterDebounce();
});

/* Prevent accidental navigation */
window.addEventListener('beforeunload', (e) => {
  if (editState.active && editState.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
```

### `editor.css` — layout

```css
#edit-view {
  display: none;
  flex-direction: column;
  height: calc(100vh - 34px);
}
.edit-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: var(--ctp-mantle);
  border-bottom: 1px solid var(--ctp-surface0);
  position: sticky;
  top: 34px;
  z-index: 4;
}
#edit-save-btn {
  background: var(--ctp-surface0);
  border: 1px solid var(--ctp-surface1);
  color: var(--ctp-text);
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
#edit-save-btn.dirty {
  background: var(--ctp-green);
  color: var(--ctp-base);
  border-color: var(--ctp-green);
}
.edit-body {
  display: flex;
  flex: 1;
  overflow-y: auto;  /* Parent scrolls textarea + gutter together */
}
#edit-gutter-canvas {
  width: 4px;
  flex-shrink: 0;
}
#edit-textarea {
  flex: 1;
  font-family: 'Victor Mono', monospace;
  font-size: var(--base-size);
  line-height: 1.65;
  background: var(--ctp-base);
  color: var(--ctp-text);
  border: none;
  resize: none;
  padding: 24px 32px;
  outline: none;
  overflow: hidden;  /* Let parent scroll */
}
body.edit-mode { /* Subtle blue tint to indicate editing */ }
.edit-status {
  font-size: 11px;
  color: var(--ctp-overlay0);
  font-family: 'Victor Mono', monospace;
}
```

### `template.py` — add edit view HTML

Inside `#main-area`, after `#diff-view`:

```html
<div id="edit-view" style="display:none">
  <div class="edit-toolbar">
    <button id="edit-save-btn" title="Save (Cmd+S)"><i class="ph ph-floppy-disk"></i> Save</button>
    <button id="edit-discard-btn" title="Discard"><i class="ph ph-x"></i> Discard</button>
    <button id="edit-history-btn" title="Version History"><i class="ph ph-clock-counter-clockwise"></i></button>
    <span class="edit-status" id="edit-status"></span>
  </div>
  <div class="edit-body">
    <canvas id="edit-gutter-canvas" width="4"></canvas>
    <textarea id="edit-textarea" spellcheck="true"></textarea>
  </div>
</div>
```

### `server.py` — add `POST /api/save` (HARDENED)

```python
elif parsed.path == "/api/save":
    tab_id = body.get("tab", "")
    content = body.get("content", "")

    # Security: tab must be in open tabs (server-side allowlist)
    if tab_id not in self._tabs:
        self._json_response({"error": "tab not found"}, 404)
        return

    # Security: content size limit (10MB)
    if len(content.encode('utf-8')) > 10 * 1024 * 1024:
        self._json_response({"error": "content too large"}, 413)
        return

    filepath = self._tabs[tab_id]["filepath"]

    # Security: atomic write via temp file + os.replace()
    try:
        import tempfile
        dir_name = os.path.dirname(filepath)
        fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                f.write(content)
            os.replace(tmp_path, filepath)  # Atomic on POSIX
        except:
            os.unlink(tmp_path)
            raise

        mtime = os.path.getmtime(filepath)
        self._tabs[tab_id]["content"] = content
        self._tabs[tab_id]["mtime"] = mtime

        # Auto-commit to version history
        from . import history
        version_hash = history.commit(filepath)
        self._json_response({"ok": True, "mtime": mtime, "version": version_hash})
    except OSError as e:
        self._json_response({"error": str(e)}, 500)
```

### `polling.js` — skip polling during edit mode AND home screen

Add to `poll()` top:
```javascript
if (editState && editState.active) { setTimeout(poll, POLL_ACTIVE_MS); return; }
if (homeScreenActive) { setTimeout(poll, POLL_ACTIVE_MS); return; }
```

### Research Insights

**Performance:**
- **500ms debounce** (not 300ms)—imperceptible to users, halves computation frequency
- **Pre-split saved lines** at enter-edit-mode time (avoids re-splitting 1MB string every tick)
- **Canvas gutter** replaces 10K DOM elements with a single draw call
- **Web Worker for large files**: If targeting 10K+ lines, inline the diff worker via Blob URL from `template.py`
- Memory: ~6-8MB for a 1MB file (textarea + savedContent + baseContent + savedLines + diff arrays)—acceptable

**Undo preservation:**
- `document.execCommand('insertText')` is "deprecated" but universally supported with no replacement—all browsers still implement it
- Native undo/redo (Cmd+Z/Cmd+Shift+Z) works automatically when using execCommand
- `replaceSelection()` helper with execCommand + fallback for Tab handling

### Command palette + keybinding

- `Cmd+E` toggles edit mode
- Palette command: "Edit Markdown" / "Exit Edit Mode"

---

## Feature 7: Git-Based Version History

### Architecture

**Shared history repo** at `~/.mdpreview/history/` — one git repo for all files. Each file tracked by its absolute path hash. Simpler than per-file repos, easier to manage.

### New file: `history.py` (HARDENED)

```python
"""Git-backed version history for markdown files (stdlib + git CLI)."""
import hashlib, os, re, subprocess, datetime, difflib

HISTORY_DIR = os.path.expanduser("~/.mdpreview/history")
GIT_HASH_RE = re.compile(r'^[0-9a-f]{4,40}$')

_version_cache = {}  # filepath -> (head_hash, versions_list)

def _ensure_repo():
    """Initialize git repo if needed."""
    git_dir = os.path.join(HISTORY_DIR, ".git")
    if not os.path.isdir(git_dir):
        os.makedirs(HISTORY_DIR, mode=0o700, exist_ok=True)
        subprocess.run(["git", "init"], cwd=HISTORY_DIR, capture_output=True, timeout=10)
        subprocess.run(["git", "config", "user.name", "mdpreview"], cwd=HISTORY_DIR, capture_output=True, timeout=5)
        subprocess.run(["git", "config", "user.email", "system@mdpreview"], cwd=HISTORY_DIR, capture_output=True, timeout=5)
        # Performance: enable commit graph
        subprocess.run(["git", "config", "core.commitgraph", "true"], cwd=HISTORY_DIR, capture_output=True, timeout=5)

def _validate_hash(value):
    """Validate git hash. Raises ValueError if invalid."""
    if not isinstance(value, str) or not GIT_HASH_RE.match(value):
        raise ValueError(f"Invalid git hash: {value}")
    return value

def _file_key(filepath):
    """Stable key for a file based on absolute path."""
    return hashlib.sha256(os.path.abspath(filepath).encode()).hexdigest()[:12]

def commit(filepath):
    """Copy file into history repo, commit with embedded diff stats. Returns commit hash."""
    _ensure_repo()
    key = _file_key(filepath)
    basename = os.path.basename(filepath)
    dest = os.path.join(HISTORY_DIR, f"{key}_{basename}")

    # Read old content for diff stats
    old_content = ""
    if os.path.exists(dest):
        with open(dest, encoding='utf-8') as f:
            old_content = f.read()

    with open(filepath, encoding='utf-8') as src:
        new_content = src.read()

    with open(dest, 'w', encoding='utf-8') as dst:
        dst.write(new_content)

    # Compute diff stats NOW (both versions in memory—zero cost later)
    old_lines = old_content.splitlines()
    new_lines = new_content.splitlines()
    diff = list(difflib.unified_diff(old_lines, new_lines, lineterm=''))
    added = sum(1 for l in diff if l.startswith('+') and not l.startswith('+++'))
    removed = sum(1 for l in diff if l.startswith('-') and not l.startswith('---'))

    subprocess.run(["git", "add", "--", os.path.basename(dest)], cwd=HISTORY_DIR, capture_output=True, timeout=10)
    msg = f"{basename} | +{added}/-{removed} | {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    subprocess.run(["git", "commit", "-m", msg], cwd=HISTORY_DIR, capture_output=True, timeout=10)
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=HISTORY_DIR, capture_output=True, text=True, timeout=5)

    # Invalidate cache
    _version_cache.pop(filepath, None)

    return result.stdout.strip()

def list_versions(filepath, limit=50):
    """Return list of {hash, date, message, added, removed} for a file. Cached."""
    _ensure_repo()
    key = _file_key(filepath)
    basename = os.path.basename(filepath)
    tracked = f"{key}_{basename}"

    # Check cache validity via HEAD hash
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=HISTORY_DIR, capture_output=True, text=True, timeout=5
    ).stdout.strip()

    cached = _version_cache.get(filepath)
    if cached and cached[0] == head:
        return cached[1]

    result = subprocess.run(
        ["git", "log", "--format=%H|%aI|%s", "-n", str(limit), "--", tracked],
        cwd=HISTORY_DIR, capture_output=True, text=True, timeout=10
    )
    versions = []
    for line in result.stdout.strip().split('\n'):
        if '|' not in line: continue
        h, date, msg = line.split('|', 2)
        # Parse embedded stats from commit message: "file.md | +5/-3 | 2026-02-18 14:32:00"
        added, removed = 0, 0
        stats_match = re.search(r'\+(\d+)/-(\d+)', msg)
        if stats_match:
            added, removed = int(stats_match.group(1)), int(stats_match.group(2))
        versions.append({"hash": h, "date": date, "message": msg, "added": added, "removed": removed})

    _version_cache[filepath] = (head, versions)
    return versions

def get_version_content(filepath, commit_hash):
    """Return file content at a specific version."""
    _validate_hash(commit_hash)
    key = _file_key(filepath)
    basename = os.path.basename(filepath)
    tracked = f"{key}_{basename}"
    result = subprocess.run(
        ["git", "show", f"{commit_hash}:{tracked}"],
        cwd=HISTORY_DIR, capture_output=True, text=True, timeout=10
    )
    return result.stdout if result.returncode == 0 else None

def restore(filepath, commit_hash):
    """Restore file to a specific version. Auto-commits current first."""
    _validate_hash(commit_hash)
    commit(filepath)  # Save current state before restoring
    content = get_version_content(filepath, commit_hash)
    if content is not None:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        commit(filepath)  # Commit the restore as a new version
    return content
```

### Research Insights

**Performance:**
- **Stats in commit messages**: `+5/-3` embedded at commit time. `list_versions()` parses them from the message string—zero extra `git diff` calls. This turns O(N * diff_cost) into O(1) per version display.
- **Cache `list_versions()`** keyed on HEAD hash. Only recomputes when a new commit is made.
- **`timeout=10`** on all subprocess calls prevents hangs on malicious input or broken repos.

**Security:**
- **Hash validation**: `^[0-9a-f]{4,40}$` regex rejects flag injection (`--output=/tmp/exfil`)
- **`--` separator**: All git commands use `--` to separate flags from paths
- **Never `shell=True`**: All subprocess calls use list form
- **`mode=0o700`** on `~/.mdpreview/history/` directory

### `server.py` — add version history endpoints (HARDENED)

```python
# All endpoints validate tab_id against _tabs allowlist
# All hash parameters validated against GIT_HASH_RE

GET /api/versions?tab={id}       → list_versions(filepath) [cached]
GET /api/version?tab={id}&hash=X → get_version_content(filepath, validated_hash)
POST /api/restore                → { tab, hash } → restore, return new content
```

### `server.py` — CSRF origin checking

Add to ALL state-changing endpoints (POST/PUT/DELETE):

```python
def _check_origin(self):
    """Reject requests from foreign origins."""
    origin = self.headers.get('Origin', '')
    allowed = {'http://localhost:3031', 'http://127.0.0.1:3031'}
    if self.command in ('POST', 'PUT', 'DELETE'):
        if origin and origin not in allowed:
            self._json_response({"error": "forbidden"}, 403)
            return False
    return True
```

### `server.py` — switch to `ThreadingHTTPServer`

**One-line change with massive impact**—prevents git subprocess calls from blocking the poll endpoint:

```python
# In server.py start() / __main__.py
server = http.server.ThreadingHTTPServer(("127.0.0.1", port), PreviewHandler)
```

Add `threading.Lock` around `_tabs` dict mutations:

```python
import threading

class PreviewHandler(http.server.BaseHTTPRequestHandler):
    _tabs = {}
    _tabs_lock = threading.Lock()
```

### `template.py` and `_JS_MODULES` / `_CSS_MODULES`

Add `"editor.js"` and `"editor.css"` to the module lists.

---

## Feature 8: Home Screen

### Architecture

Home screen shows when no files are open, or accessible via a command/icon. Displays recent files with metadata.

### Data persistence

**Server-side**: `~/.mdpreview/recent.json` — capped at 20 entries, with checksum for staleness detection.

**JSON schema**:
```json
{
  "version": "1.0",
  "entries": [
    {
      "path": "/absolute/path/to/file.md",
      "filename": "file.md",
      "lastOpened": "2026-02-18T14:32:00Z",
      "wordCount": 2847,
      "annotationCount": 3,
      "versionCount": 5,
      "tags": ["draft", "research"],
      "summary": "Deep research on Minoan-Semitic etymologies and cultural transmission patterns...",
      "checksum": "abc123def456"
    }
  ]
}
```

### New file: `recent.py` (HARDENED)

```python
"""Recent files persistence with atomic writes and staleness detection."""
import json, os, hashlib, tempfile, re
from pathlib import Path
from datetime import datetime, timezone

RECENT_FILE = os.path.expanduser("~/.mdpreview/recent.json")
MAX_RECENT = 20
MAX_FILE_READ = 1 * 1024 * 1024  # 1MB for metadata extraction
ALLOWED_EXT = {'.md', '.markdown', '.txt'}

def _atomic_write(filepath, data):
    """Write JSON atomically via temp file + os.replace()."""
    json_str = json.dumps(data, indent=2)
    dir_name = os.path.dirname(filepath)
    os.makedirs(dir_name, mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=dir_name, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(json_str)
        os.replace(tmp, filepath)
    except:
        os.unlink(tmp)
        raise

def _checksum(filepath):
    """Quick MD5 checksum for staleness detection."""
    try:
        return hashlib.md5(Path(filepath).read_bytes()).hexdigest()[:12]
    except:
        return ""

def _validate_entry(entry):
    """Validate a recent entry before reading its file."""
    path = entry.get('path', '')
    if not isinstance(path, str) or not os.path.isfile(path):
        return False
    _, ext = os.path.splitext(path)
    if ext.lower() not in ALLOWED_EXT:
        return False
    try:
        if os.stat(path).st_size > MAX_FILE_READ:
            return False
    except:
        return False
    return True

def _extract_summary(filepath, max_chars=200):
    """Extract first non-header paragraph, stripped of formatting."""
    try:
        text = Path(filepath).read_text(encoding='utf-8', errors='ignore')
    except:
        return ""
    # Strip YAML frontmatter
    if text.startswith('---'):
        parts = text.split('---', 2)
        if len(parts) >= 3:
            text = parts[2]
    # Strip code blocks
    text = re.sub(r'```[\s\S]*?```', '', text)
    # Find first paragraph (non-header, non-list)
    for para in re.split(r'\n\s*\n+', text.strip()):
        if para.startswith('#') or re.match(r'^\s*[-*+]\s', para):
            continue
        clean = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', para)  # strip links
        clean = re.sub(r'!\[.*?\]\([^\)]+\)', '', clean)  # strip images
        clean = re.sub(r'[*_`]+', '', clean)  # strip emphasis
        clean = re.sub(r'\s+', ' ', clean).strip()
        if not clean:
            continue
        if len(clean) > max_chars:
            cut = clean[:max_chars].rfind(' ')
            clean = clean[:cut if cut > max_chars * 0.7 else max_chars] + '…'
        return clean
    return ""

def load():
    """Load recent files, filtering stale entries."""
    if not os.path.exists(RECENT_FILE):
        return []
    try:
        with open(RECENT_FILE, 'r') as f:
            data = json.load(f)
        entries = data.get('entries', []) if isinstance(data, dict) else []
        valid = [e for e in entries[:MAX_RECENT] if _validate_entry(e)]
        if len(valid) < len(entries):
            save(valid)
        return valid
    except:
        return []

def save(entries):
    _atomic_write(RECENT_FILE, {"version": "1.0", "entries": entries[:MAX_RECENT]})

def add_entry(filepath, content=None, tags=None):
    """Add or update a recent file entry (called on every file open)."""
    path = os.path.abspath(filepath)
    entries = load()
    entries = [e for e in entries if e['path'] != path]
    entry = {
        'path': path,
        'filename': os.path.basename(path),
        'lastOpened': datetime.now(timezone.utc).isoformat(),
        'wordCount': len((content or '').split()),
        'annotationCount': 0,  # filled by caller
        'versionCount': 0,     # filled by caller
        'tags': tags or [],
        'summary': _extract_summary(path),
        'checksum': _checksum(path)
    }
    entries = [entry] + entries[:MAX_RECENT - 1]
    save(entries)
```

### `server.py` — new endpoints

```python
GET /api/recent           → recent.load() → list of recent entries
```

### `home.js` — new JS module

Renders home screen into `#content` when no active tab. Fetches `/api/recent`, builds card list.

**Relative timestamps** using native `Intl.RelativeTimeFormat`:

```javascript
const _rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto', style: 'short' });

function formatTimeAgo(isoTimestamp) {
  const diffMs = new Date(isoTimestamp) - new Date();
  const units = [
    ['day', 86400000], ['hour', 3600000], ['minute', 60000], ['second', 1000]
  ];
  for (const [name, ms] of units) {
    if (Math.abs(diffMs) >= ms) return _rtf.format(Math.round(diffMs / ms), name);
  }
  return 'now';
}
```

**Card structure**: Stretched-link pattern (entire card clickable, action buttons at higher z-index):

```html
<article class="home-card">
  <a href="#" class="home-card-link" data-filepath="..."></a>
  <div class="home-card-content">
    <h3 class="home-card-filename">research-notes.md</h3>
    <p class="home-card-path">~/Desktop/research-notes.md</p>
    <p class="home-card-summary">The Minoan-Semitic connection reveals...</p>
    <div class="home-card-meta">
      <span>📝 3</span> <span>📊 1,240 w</span>
      <span class="home-card-time" data-timestamp="...">2 hrs ago</span>
    </div>
    <div class="home-card-actions">
      <button data-action="history">History</button>
      <button data-action="open">Open</button>
    </div>
  </div>
</article>
```

**Transition**: 300ms fade between home screen and content view. Pause polling when home screen is active.

**Empty state**: "No Recent Files" with centered icon and "Open File" button.

**Timestamp refresh**: `setInterval(updateTimestamps, 60000)` keeps relative times current.

### `home.css` — new CSS module

Cards with Catppuccin surface colors, hover lift effect (`transform: translateY(-2px)`), tag pills, skeleton loading animation.

### Research Insights

**Best Practices:**
- **Atomic JSON writes** prevent corruption on crash (temp file + `os.replace()`)
- **Checksum in each entry** enables detection of deleted/moved files without filesystem watchers
- **Summary extraction**: regex-based, strips frontmatter/code/links/emphasis, word-boundary truncation
- **Event delegation** on container (efficient for dynamic content)
- **`Intl.RelativeTimeFormat`** is zero-dependency, 10 lines, handles "yesterday" automatically
- **Staggered card animation** (`animation-delay: ${i * 50}ms`) for smooth appearance
- **Action buttons at z-index 3** with `e.stopPropagation()` prevent stretched-link trigger

---

## Feature 9: Version History Browser

### Architecture

Accessible from:
1. Home screen [History] button per file
2. Edit mode toolbar [History] button
3. Command palette "Version History"

### UI Layout — Vertical Timeline Panel

Fixed 280px panel in the right-side gutter space. Vertical line with dots, animated open/close via CSS transform.

```
┌──────────────────────────────┐
│  VERSION HISTORY         [X] │
│  research-notes.md           │
├──────────────────────────────┤
│  ● Current                   │
│    2 minutes ago             │
│    +12 / -3 lines            │
│           [Compare] [Restore]│
├──────────────────────────────┤
│  ○ Feb 18, 3:22 PM          │
│    "Added section on..."     │
│    +45 / -0 lines            │
│           [Compare] [Restore]│
├──────────────────────────────┤
│  ○ Feb 18, 2:15 PM          │
│    ...                       │
└──────────────────────────────┘
```

### Panel CSS

```css
#version-panel {
  position: fixed;
  right: 0; top: 0; bottom: 0;
  width: 280px;
  background: var(--ctp-mantle);
  border-left: 1px solid var(--ctp-surface0);
  transform: translateX(100%);
  transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 15;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
#version-panel.open { transform: translateX(0); }

/* Vertical timeline line */
.version-timeline { position: relative; overflow-y: auto; flex: 1; padding: 12px 0; }
.version-timeline::before {
  content: ''; position: absolute; left: 23px; top: 0; bottom: 0;
  width: 2px; background: linear-gradient(to bottom, var(--ctp-surface1), transparent);
}

/* Timeline entry */
.version-entry {
  padding: 10px 12px 10px 40px; position: relative;
  cursor: pointer; transition: background 150ms; outline: none;
}
.version-entry:hover { background: var(--ctp-surface0); }
.version-entry:focus { background: var(--ctp-surface0); outline: 2px solid var(--ctp-blue); outline-offset: -2px; }

/* Dot marker */
.version-entry::before {
  content: ''; position: absolute; left: 16px; top: 14px;
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--ctp-surface1); border: 2px solid var(--ctp-mantle);
  transition: all 150ms;
}
.version-entry:hover::before { background: var(--ctp-blue); }
.version-entry.current::before { background: var(--ctp-green); }

/* Stats */
.version-stat-add { color: var(--ctp-green); font-family: 'Victor Mono', monospace; font-size: 11px; }
.version-stat-del { color: var(--ctp-red); font-family: 'Victor Mono', monospace; font-size: 11px; }

/* Action buttons (hover-reveal) */
.version-actions { opacity: 0; transition: opacity 150ms; display: flex; gap: 6px; margin-top: 6px; }
.version-entry:hover .version-actions { opacity: 1; }
```

### Panel coexistence with annotations

Mutual exclusion: opening version panel closes annotations gutter, and vice versa. Controlled by a shared `gutterMode` state:

```javascript
let gutterMode = 'none'; // 'none' | 'annotations' | 'versions'

function openVersionPanel() {
  if (gutterMode === 'annotations') closeGutterOverlay();
  gutterMode = 'versions';
  document.getElementById('version-panel').classList.add('open');
  loadVersionHistory();
}

function closeVersionPanel() {
  gutterMode = 'none';
  document.getElementById('version-panel').classList.remove('open');
}
```

### Compare workflow

User clicks [Compare] → fetches version content → opens existing side-by-side diff view:

```javascript
async function compareVersion(hash) {
  const versionContent = await fetch(`/api/version?tab=${activeTabId}&hash=${hash}`).then(r => r.json());
  if (!versionContent.content) return;
  // Reuse existing diff infrastructure
  showDiffView(versionContent.content, tabs[activeTabId].content, `Version ${hash.slice(0,8)}`, 'Current');
}
```

### Restore workflow

Confirmation dialog → save current → restore → reload:

```javascript
async function restoreVersion(hash) {
  if (!confirm('Restore this version? Your current content will be saved first.')) return;
  const res = await fetch('/api/restore', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ tab: activeTabId, hash: hash })
  });
  const data = await res.json();
  if (data.ok) {
    tabs[activeTabId].content = data.content;
    lastRenderedMd = '';
    render(data.content);
    closeVersionPanel();
  }
}
```

### Keyboard navigation

```javascript
document.addEventListener('keydown', (e) => {
  if (gutterMode !== 'versions') return;
  const focused = document.activeElement.closest('.version-entry');
  if (!focused) return;

  switch (e.key) {
    case 'ArrowUp': e.preventDefault(); focusSibling(focused, -1); break;
    case 'ArrowDown': e.preventDefault(); focusSibling(focused, 1); break;
    case 'Enter': case 'c': compareVersion(focused.dataset.hash); break;
    case 'r': restoreVersion(focused.dataset.hash); break;
    case 'Escape': closeVersionPanel(); break;
  }
});
```

### Research Insights

**Performance:**
- **Stats from commit messages**: `list_versions()` parses `+N/-M` from the message string—zero extra `git diff` calls per version entry
- **Skeleton shimmer** while loading: 3 placeholder entries with `background-size: 200%` animation
- **Lazy load older versions**: Show first 20, "Load more" button at bottom

**Panel animation:**
- 280ms `cubic-bezier(0.4, 0, 0.2, 1)` matches Material Design standard easing
- `transform: translateX` is GPU-accelerated (no reflow)

### `server.py` — version diff endpoint

```python
GET /api/version-diff?tab={id}&from=hash1&to=hash2
  → Validates both hashes against GIT_HASH_RE
  → Returns prepare_diff(content_at_hash1, content_at_hash2)
```

---

## Security Checklist

| # | Finding | Severity | Mitigation |
|---|---------|----------|------------|
| 1 | Path traversal in `/api/save` | **CRITICAL** | Tab ID maps to server-side filepath allowlist; atomic writes |
| 2 | Git flag injection via hash params | **HIGH** | Validate `^[0-9a-f]{4,40}$`; always use `--` separator; `timeout=10` |
| 3 | CSRF on localhost endpoints | **MEDIUM** | Check `Origin`/`Referer` headers on all POST; bind `127.0.0.1` only |
| 4 | Path manipulation in `recent.json` | **MEDIUM** | Validate extension, existence, file size before reading |
| 5 | Settings XSS via localStorage | **MEDIUM** | Validate all settings against type/range/enum schema |
| 6 | Unbounded request bodies | **LOW** | Content-Length check before reading; 10MB limit |
| 7 | Event handler leaks | **LOW** | AbortController for all document-level listeners |

**Response headers** (add to all responses):
```python
self.send_header('X-Content-Type-Options', 'nosniff')
self.send_header('X-Frame-Options', 'DENY')
```

---

## Performance Checklist

| # | Issue | Impact | Mitigation |
|---|-------|--------|------------|
| 1 | Single-threaded `HTTPServer` | **CRITICAL** | Switch to `ThreadingHTTPServer` (one-line change) |
| 2 | Myers diff on 10K-line file per keystroke | **CRITICAL** | Canvas gutter, 500ms debounce, Web Worker for large files |
| 3 | N-1 diffs for N versions in timeline | **HIGH** | Embed `+N/-M` stats in commit messages at save time |
| 4 | `git log` per request | **MEDIUM** | Cache `list_versions()` keyed on HEAD hash |
| 5 | Home screen file I/O (20 files) | **MEDIUM** | Cache word counts in `recent.json`; pause polling |
| 6 | Settings slider repaint with large docs | **LOW** | `requestAnimationFrame` coalescing for slider drag |
| 7 | `_fm_cache` unbounded growth | **LOW** | Add LRU eviction at 20 entries |
| 8 | `backdrop-filter` on older hardware | **LOW** | `@supports` fallback with higher opacity |

---

## File Change Summary

| File | Changes |
|------|---------|
| `annotations.js` | Click-outside-to-close with AbortController + dual-event pattern |
| `responsive.css` | Glassmorphism toggle button with `@supports` fallback |
| `theme.js` | TOC font size, per-surface rgba() opacity, Cmd+U keybinding |
| `base-layout.css` | TOC `calc()` font sizes with `--toc-size-offset`; `--body-bg`/`--toc-bg`/`--crust-bg` vars |
| `template.py` | Add edit-view HTML, version-panel HTML, TOC font controls, new module entries |
| `palette.js` | Settings mode, edit/history/transparency commands |
| `palette.css` | Settings panel styles with `requestAnimationFrame` slider handling |
| `server.py` | 5 new endpoints (save, versions, version, restore, recent); `ThreadingHTTPServer`; CSRF check; `_tabs_lock` |
| **`editor.js`** (new) | Edit mode, canvas diff gutter, Myers diff, Tab handling, undo preservation |
| **`editor.css`** (new) | Edit view layout, canvas gutter, toolbar |
| **`history.py`** (new) | Git CLI wrapper with hash validation, stats in commit messages, caching |
| **`recent.py`** (new) | Atomic JSON persistence, staleness detection, summary extraction |
| **`home.js`** (new) | Home screen rendering, relative timestamps, card interactions |
| **`home.css`** (new) | Card grid, stretched-link pattern, skeleton loading, empty state |

## Implementation Order

1. **Infrastructure** (before features): `ThreadingHTTPServer` + `_tabs_lock` + CSRF origin check
2. **Quick fixes** (Features 1-4): gutter close (AbortController), toggle bg (glassmorphism), TOC font, per-surface opacity
3. **Edit mode** (Feature 6): textarea, canvas gutter, Myers diff, save endpoint (hardened)
4. **Version history backend** (Feature 7): history.py with stats-in-commits, cached list_versions
5. **Version history UI** (Feature 9): timeline panel, compare/restore, keyboard nav
6. **Home screen** (Feature 8): recent.py (atomic writes), home view, card rendering
7. **Settings panel** (Feature 5): palette settings mode, schema, rAF slider handling

## Verification

1. **Security**: Attempt path traversal via curl `POST /api/save` with `../` path → 404 (tab not in allowlist)
2. **Security**: Attempt CSRF from external origin → 403 (origin check)
3. **Gutter close**: Open overlay on narrow screen → click outside → closes; text selection does NOT dismiss
4. **TOC font**: Use +/- in TOC chrome → TOC entries scale independently
5. **Opacity**: Cmd+U → backgrounds dim through 6 steps → text stays crisp → Cmd+U cycles back to 100%
6. **Edit mode**: Cmd+E → textarea with raw markdown → type changes → green/yellow/red canvas gutter markers → Save → file updated on disk → Cmd+Z undoes
7. **Version history**: After 3 saves → open History → see 3 versions with `+N/-M` stats → [Compare] shows diff → [Restore] reverts
8. **Home screen**: Launch `mdpreview` with no files → home screen with recent files → click → opens
9. **Settings**: Cmd+K → "Settings" → drag font slider → no jank with large document
10. **Performance**: Open a 10K-line file → edit mode → type rapidly → gutter updates smoothly (canvas, 500ms debounce)
