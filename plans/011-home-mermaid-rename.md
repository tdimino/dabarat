# Plan: Remaining Features — Home Page, Mermaid, Rename

**Project**: `/Users/tomdimino/Desktop/Programming/md-preview-and-annotate`

## Context

Feature 3 (Color Scheme System, Phases A–C), responsive layout, and frontmatter hiding are all done. Three features remain from the master plan at `~/.claude/plans/2026-02-18-markdown-dabarat-mermaid-rename.md`:

1. **Home page** — code exists (`home.js`, `home.css`) but `showHomeScreen()` is never called anywhere. The page is orphaned.
2. **Mermaid diagrams** — zero implementation exists. No CDN, no render hook, no CSS.
3. **Project rename** — still `md-preview-and-annotate` / `mdpreview` / `mdp` everywhere.

Rename goes last because it touches every file. Home page and Mermaid are independent.

---

## Phase D1: Home Page Activation & Polish

### D1.1 — Wire `showHomeScreen()` into `init.js`

**File**: `static/js/init.js` (line 37–40)

After tab content is fetched, if no tabs exist, show the home screen instead of rendering content:

```javascript
if (Object.keys(tabs).length === 0) {
  showHomeScreen();
} else if (activeTabId && tabs[activeTabId]) {
  render(tabs[activeTabId].content);
  document.getElementById('status-filepath').textContent = tabs[activeTabId].filepath;
}
```

### D1.2 — Allow closing the last tab → home screen

**File**: `static/js/tabs.js` (line 114–142)

Remove the `<= 1` early return guard at line 115. When the last tab is closed and `Object.keys(tabs)` becomes empty, call `showHomeScreen()`:

```javascript
async function closeTab(id) {
  // Exit edit/diff mode if active on this tab
  if (editState.active && editState.tabId === id) exitEditMode(true);
  if (diffState.active && diffState.leftTabId === id) exitDiffMode();

  try { await fetch('/api/close', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id}) }); } catch(e) {}

  delete tabs[id];
  delete annotationsCache[id];
  delete lastAnnotationMtimes[id];
  delete tagsCache[id];

  if (id === activeTabId) {
    activeTabId = Object.keys(tabs)[0] || null;
    lastRenderedMd = '';
    if (activeTabId && tabs[activeTabId].content) {
      render(tabs[activeTabId].content);
      document.getElementById('status-filepath').textContent = tabs[activeTabId].filepath;
    } else if (!activeTabId) {
      showHomeScreen();
    }
  }
  renderTabBar();
}
```

### D1.3 — Enhance `showHomeScreen()` / `hideHomeScreen()`

**File**: `static/js/home.js`

When entering home screen: collapse TOC (save prior state), hide annotations gutter/toggle, clear status bar. When leaving: restore everything.

Add state variable:
```javascript
let _tocWasCollapsedBeforeHome = false;
```

In `showHomeScreen()`, after setting `homeScreenActive = true`:
```javascript
_tocWasCollapsedBeforeHome = document.body.classList.contains('toc-collapsed');
document.body.classList.add('toc-collapsed');
document.getElementById('annotations-gutter').style.display = 'none';
document.getElementById('annotations-toggle').style.display = 'none';
document.getElementById('toc-list').innerHTML = '';
document.getElementById('status-filepath').textContent = '';
document.getElementById('word-count').textContent = '';
document.getElementById('last-updated').textContent = '';
document.getElementById('status-tags').innerHTML = '';
```

In `hideHomeScreen()`:
```javascript
function hideHomeScreen() {
  homeScreenActive = false;
  document.getElementById('annotations-gutter').style.display = '';
  document.getElementById('annotations-toggle').style.display = '';
  if (!_tocWasCollapsedBeforeHome) document.body.classList.remove('toc-collapsed');
}
```

### D1.4 — Fix `openRecentFile()` transition

**File**: `static/js/home.js` (lines 84–108)

Reorder: call `hideHomeScreen()` first, then set `activeTabId`, `renderTabBar()`, fetch content. Also handle the `showAddFileInput()` path in `tabs.js` — when a file is added while on home screen, call `hideHomeScreen()`.

### D1.5 — Live metadata in `recent.py`

**File**: `recent.py` (line ~107)

Replace hardcoded `annotationCount: 0` and `versionCount: 0` with actual counts:

```python
from . import annotations as _ann_mod
from . import history as _hist_mod

# In add_entry():
ann_count = 0
try:
    data, _ = _ann_mod.read(path)
    ann_count = len(data.get("annotations", []))
except Exception: pass

ver_count = 0
try:
    ver_count = len(_hist_mod.list_versions(path))
except Exception: pass
```

### D1.6 — Quick Actions row + remove-from-recent

**File**: `static/js/home.js`

Add "Open File..." button above card grid. Add hover "X" button on each card to dismiss from recents.

**File**: `static/css/home.css`

Add `.home-actions`, `.home-action-btn`, `.home-card-remove` styles.

**File**: `server.py`

Add `POST /api/recent/remove` endpoint that filters the entry out and saves.

### D1.7 — Show `versionCount` on home cards

**File**: `static/js/home.js` (card template, line 52–53)

Add after annotationCount:
```javascript
${e.versionCount ? `<span><i class="ph ph-clock-counter-clockwise"></i> ${e.versionCount}</span>` : ''}
```

### Files modified (Phase D1)
| File | Changes |
|------|---------|
| `static/js/init.js` | Zero-tabs → `showHomeScreen()` branch |
| `static/js/tabs.js` | Remove `<= 1` guard, add home screen trigger on empty tabs, handle `showAddFileInput()` home transition |
| `static/js/home.js` | Enhanced show/hide with TOC+gutter+status management, fixed `openRecentFile()`, new `removeRecentFile()`, Quick Actions row, versionCount in cards |
| `static/css/home.css` | Quick actions row, card remove button styles |
| `recent.py` | Import annotations+history, live annotation/version counts |
| `server.py` | New `POST /api/recent/remove` endpoint |

---

## Phase D2: Mermaid Diagram Support

### D2.1 — CDN + CSS module registration

**File**: `template.py`

Add after line 54 (Phosphor Icons):
```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
```

Add `"mermaid.css"` to `_CSS_MODULES` list (line 22).

### D2.2 — Mermaid initialization + theme mapping

**File**: `static/js/theme.js`

Add `getMermaidThemeVars()` function that reads computed CSS variables and returns a mermaid `themeVariables` object mapping Catppuccin to mermaid roles:

```javascript
function getMermaidThemeVars() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  return {
    primaryColor: v('--ctp-blue'),
    primaryTextColor: v('--ctp-base'),
    lineColor: v('--ctp-overlay1'),
    secondaryColor: v('--ctp-surface0'),
    background: v('--ctp-base'),
    mainBkg: v('--ctp-surface0'),
    nodeBorder: v('--ctp-surface2'),
    clusterBkg: v('--ctp-mantle'),
    titleColor: v('--ctp-text'),
    edgeLabelBackground: v('--ctp-mantle'),
    textColor: v('--ctp-text'),
    noteBkgColor: v('--ctp-surface1'),
    noteTextColor: v('--ctp-text'),
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    // ... ~20 more sequence/gantt/state variables
  };
}

function initMermaid() {
  if (typeof mermaid === 'undefined') return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: getMermaidThemeVars(),
    securityLevel: 'strict',
    logLevel: 'error',
  });
}
initMermaid();
```

Add `requestAnimationFrame(() => initMermaid())` inside `applyTheme()` (after `data-theme` is set) so mermaid re-reads variables on theme switch. The existing `lastRenderedMd = ''` reset in theme switching functions already forces a full re-render which re-processes mermaid blocks.

### D2.3 — Post-render mermaid processing

**File**: `static/js/render.js`

Add `renderMermaidDiagrams(container)` function (async, fire-and-forget):

```javascript
let mermaidCounter = 0;

async function renderMermaidDiagrams(container) {
  const blocks = container.querySelectorAll('pre code.language-mermaid');
  if (!blocks.length) return;

  for (const codeEl of blocks) {
    const pre = codeEl.parentElement;
    const definition = codeEl.textContent;
    const id = 'mermaid-' + (++mermaidCounter);
    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-container';

    try {
      const { svg } = await mermaid.render(id, definition);
      wrapper.innerHTML = svg;
    } catch (err) {
      wrapper.className = 'mermaid-container mermaid-error';
      wrapper.innerHTML = `<div class="mermaid-error-label">Invalid diagram</div>
        <pre class="mermaid-error-code"><code>${escapeHtml(definition)}</code></pre>`;
      const errSvg = document.getElementById(id);
      if (errSvg) errSvg.remove();
    }
    pre.replaceWith(wrapper);
  }
}
```

Insert call in `render()` at line 67–68 (after `content.innerHTML = html`, BEFORE `applyEmojiStyle` and `hljs`):

```javascript
content.innerHTML = html;
/* Mermaid — must run BEFORE hljs to claim mermaid code blocks */
if (typeof mermaid !== 'undefined') renderMermaidDiagrams(content);
applyEmojiStyle(content);
```

This is fire-and-forget (not awaited) — diagrams pop in after async render completes. The `<pre>` elements are replaced with `<div>` elements, so hljs (which runs later on `pre code`) won't touch them.

### D2.4 — CSS

**File**: `static/css/mermaid.css` (NEW)

```css
.mermaid-container {
  display: flex;
  justify-content: center;
  margin: 1.5em 0;
  padding: 1.2em;
  background: rgba(var(--ctp-mantle-rgb), 0.4);
  border: 1px solid var(--ctp-surface0);
  border-radius: 8px;
  overflow-x: auto;
}
.mermaid-container svg { max-width: 100%; height: auto; }

/* Error state */
.mermaid-error {
  border-left: 4px solid var(--ctp-red);
  background: rgba(var(--ctp-red-rgb), 0.05);
  flex-direction: column;
  align-items: flex-start;
}
.mermaid-error-label {
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: var(--ctp-red);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.8em;
}
.mermaid-error-code { /* styled pre block for raw source */ }

@media print {
  .mermaid-container { border: 1px solid #ccc; background: white; break-inside: avoid; }
}
```

### Files modified (Phase D2)
| File | Changes |
|------|---------|
| `template.py` | CDN script + `mermaid.css` in _CSS_MODULES |
| `static/js/theme.js` | `getMermaidThemeVars()`, `initMermaid()`, re-init in `applyTheme()` |
| `static/js/render.js` | `renderMermaidDiagrams()` function + call in `render()` |
| `static/css/mermaid.css` | NEW — container, error, print styles |

---

## Phase D3: Project Rename to "Markdown Dabarat"

### D3.1 — Migration logic (runs first)

**File**: `__main__.py` — new `_migrate_config_dir()` function:
```python
def _migrate_config_dir():
    """One-time migration: ~/.mdpreview/ → ~/.dabarat/"""
    old = os.path.expanduser("~/.mdpreview")
    new = os.path.expanduser("~/.dabarat")
    if os.path.isdir(old) and not os.path.isdir(new):
        import shutil
        try: shutil.move(old, new)
        except OSError:
            try: os.symlink(old, new)
            except OSError: pass
```

Call at top of `cmd_serve()`, `cmd_annotate()`, `cmd_add()`.

**File**: `static/js/state.js` — new localStorage migration IIFE (runs before any reads):
```javascript
(function() {
  if (localStorage.getItem('dabarat-migrated')) return;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('mdpreview-')) {
      const nk = 'dabarat-' + k.slice(10);
      if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
    }
  }
  localStorage.setItem('dabarat-migrated', '1');
})();
```

**File**: `template.py` line 57 — FOUC inline script reads `dabarat-theme` first, falls back to `mdpreview-theme`.

### D3.2 — Python backend renames

| File | Line | Old | New |
|------|------|-----|-----|
| `__main__.py:25` | `"~/.mdpreview/instances"` | `"~/.dabarat/instances"` |
| `__main__.py:253` | `"md-preview is already running."` | `"Dabarat is already running."` |
| `__main__.py:257` | `'with title "md-preview..."'` | `'with title "Dabarat..."'` |
| `__main__.py:365` | features string | `"Dabarat · Live reload · Catppuccin · Annotations"` |
| `__main__.py:404-406` | usage strings `mdpreview` | `dabarat` |
| `server.py:277` | `"mdpreview"` | `"dabarat"` |
| `server.py:522` | `.mdpreview-` prefix | `.dabarat-` |
| `history.py:10` | `"~/.mdpreview/history"` | `"~/.dabarat/history"` |
| `history.py:25,29` | git user `"mdpreview"` | `"dabarat"` |
| `recent.py:11` | `"~/.mdpreview/recent.json"` | `"~/.dabarat/recent.json"` |
| `template.py:38` | `title="mdpreview"` | `title="dabarat"` |
| `template.py:62` | `MDPREVIEW_CONFIG` | `DABARAT_CONFIG` |

### D3.3 — JavaScript localStorage key renames

All 14 keys change from `mdpreview-` to `dabarat-` prefix. Use `replace_all` edits:

| File | Keys |
|------|------|
| `state.js` | `mdpreview-author`, `MDPREVIEW_CONFIG`, `mdpreview-emoji-style` |
| `init.js` | `mdpreview-active-tab` |
| `theme.js` | `mdpreview-fontsize`, `mdpreview-toc-fontsize`, `mdpreview-theme`, `mdpreview-opacity-idx`, `mdpreview-emoji-style`, `mdpreview-toc-width`, `mdpreview-custom-themes`, `mdpreview-custom-active` |
| `tabs.js` | `mdpreview-active-tab` |
| `palette.js` | `mdpreview-recent-files`, `mdpreview-toc-width`, `mdpreview-author`, `mdpreview-custom-active` |

### D3.4 — pyproject.toml

```toml
[project]
name = "markdown-dabarat"
version = "0.2.0"
description = "Catppuccin markdown previewer with annotations, bookmarks, and live reload"

[project.scripts]
dabarat = "md_preview_and_annotate.__main__:main"
dbrt = "md_preview_and_annotate.__main__:main"
mdpreview = "md_preview_and_annotate.__main__:main"
mdp = "md_preview_and_annotate.__main__:main"
```

Package directory stays `md_preview_and_annotate/` (no import breakage).

### D3.5 — Re-install + documentation

Run `pip install -e .` (or `uv pip install -e .`) to register new entry points.

Update `CLAUDE.md` title, commands section, and conventions. Update `agent_docs/` localStorage key references. The Python package directory name note goes in CLAUDE.md.

### Files modified (Phase D3)
| File | Changes |
|------|---------|
| `pyproject.toml` | Name, version, console_scripts (4 entries) |
| `__main__.py` | Instance dir, dialog text, usage strings, migration function |
| `server.py` | Default title, temp prefix |
| `history.py` | History dir, git config |
| `recent.py` | Recent file path |
| `template.py` | Default title, config object name, FOUC script keys |
| `static/js/state.js` | Migration IIFE, key renames, config name |
| `static/js/init.js` | Key rename |
| `static/js/theme.js` | 14 key renames, initMermaid already uses new keys |
| `static/js/tabs.js` | Key rename |
| `static/palette.js` | 4 key renames |
| `CLAUDE.md` | Title, commands, conventions |

---

## Implementation Order

1. **D1** (Home Page) — self-contained, no cross-feature deps
2. **D2** (Mermaid) — self-contained, no cross-feature deps
3. **D3** (Rename) — touches everything, goes last

D1 and D2 could be parallelized since they touch different files (except both touch `template.py` for module lists, but different sections).

---

## Verification

### Home Page
1. Launch with no files: `dabarat` (or `python3 -m md_preview_and_annotate`) — should show home screen
2. Open a recent file from home → content loads, TOC restores, gutter restores
3. Close all tabs one by one → home screen reappears
4. Click "X" on a home card → entry removed from recent list
5. Click "Open File..." → file picker opens, file loads as new tab

### Mermaid
1. Open a markdown file with ` ```mermaid ` blocks
2. Diagrams render as SVG (not raw code)
3. Switch themes (Cmd+K → cycle) → diagrams re-render with new colors
4. Invalid mermaid syntax shows error state (red border + "Invalid diagram" label)
5. Print → diagrams render on white background

### Rename
1. `dabarat file.md` — launches server
2. `dbrt file.md` — same
3. `mdpreview file.md` — backward compat, still works
4. `mdp file.md` — backward compat, still works
5. Settings preserved from old install (localStorage migration)
6. `~/.dabarat/` directory exists with history, instances, recent.json
7. Browser title shows "dabarat"
