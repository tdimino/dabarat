# Plan: mdpreview v2 — Tabs, Annotations, Sidebar Polish

## Context
`landlord-dispute/tools/mdpreview.py` is a working single-file Catppuccin Mocha/Latte markdown viewer with live reload, sidebar TOC, font/theme controls, and Chrome `--app` mode. Tom wants three upgrades:

1. **Multi-tab support** — open multiple .md files, switch between them, add new files at runtime via CLI
2. **Margin annotations** — Google Docs–style comment bubbles on the right margin, authored by human or AI with timestamps, persisted in a sidecar JSON file
3. **Sidebar polish** — minor refinements based on the latest screenshot review

## File
`/Users/tomdimino/Desktop/Programming/landlord-dispute/tools/mdpreview.py`

---

## Phase 1: Sidebar Polish (minor CSS tweaks)

Based on screenshot review — the redesign is working well. Three small refinements:

1. **h1 title size** — reduce from `13px` to `12px`. The all-caps italic Cormorant Garamond title ("FORMAL NOTICE OF...") dominates too much at 13px when it wraps to 4 lines
2. **h2 top margin** — reduce from `14px` to `10px`. The spacing between sections is generous; tightening it fits more entries in the viewport
3. **"INDEX" label** — change to `padding: 8px 14px 4px` (was `10px 14px 6px`) to tighten vertical rhythm

---

## Phase 2: Multi-Tab Support

### Architecture

**Server-side** — `PreviewHandler` manages a dict of tabs:
```python
_tabs = {}  # {tab_id: {"filepath": str, "content": str, "mtime": float}}
```

**New endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/content?tab=<id>` | GET | Content for one tab (existing, add param) |
| `GET /api/tabs` | GET | List all open tabs: `[{id, filename, filepath}]` |
| `POST /api/add` | POST | Open new tab: `{filepath}` → returns `{id, filename}` |
| `POST /api/close` | POST | Close tab: `{id}` |

**CLI — two modes:**
```bash
# Start server with one or more files
python3 mdpreview.py file1.md file2.md --port 3032

# Add a file to an already-running server
python3 mdpreview.py --add file3.md --port 3032
```

The `--add` flag detects the running server and `POST`s to `/api/add`, then exits.

### Client-side

**Tab bar** — sits at the top of `#content` area (not inside the sidebar):
```html
<div id="tab-bar">
  <div class="tab active" data-tab="abc">demand-letter.md <span class="tab-close">×</span></div>
  <div class="tab" data-tab="def">contacts.md <span class="tab-close">×</span></div>
  <button id="tab-add" title="Open file">+</button>
</div>
```

**Tab bar design** (Catppuccin, editorial):
- Tabs sit flush at the top of the content column, below the window frame
- Active tab: `background: var(--ctp-base)`, `color: var(--ctp-text)`, no bottom border (merges into content)
- Inactive tabs: `background: var(--ctp-crust)`, `color: var(--ctp-overlay1)`, subtle bottom border
- Close `×`: appears on hover, `color: var(--ctp-overlay0)`, turns red on hover
- `+` button: same ghost-button style as sidebar controls
- DM Sans 10.5px, no uppercase
- Tab filename only (no path), with full path in tooltip

**JS state:**
```javascript
const tabs = {};        // {tabId: {filepath, content, mtime}}
let activeTabId = null;
```

**Polling** — polls ALL open tabs every 500ms, but only re-renders the active one:
```javascript
async function poll() {
  for (const id of Object.keys(tabs)) {
    const res = await fetch(`/api/content?tab=${id}`);
    const data = await res.json();
    if (data.mtime !== tabs[id].mtime) {
      tabs[id].content = data.content;
      tabs[id].mtime = data.mtime;
      if (id === activeTabId) render(data.content);
    }
  }
  setTimeout(poll, 500);
}
```

**Tab switching** — on click, store current scroll position, swap content, restore scroll position for the new tab. TOC rebuilds per tab. Status bar updates filepath.

**localStorage** — persist `mdpreview-tabs` (list of filepaths) and `mdpreview-active-tab` so reloading the page restores your workspace.

**Cross-file links** — if a markdown link points to a local `.md` file (e.g., `[contacts](./contacts.md)`), intercept the click and open it in a new tab instead of navigating away.

---

## Phase 3: Margin Annotations (Comment Bubbles)

### Storage: Sidecar JSON

Each markdown file gets a companion file:
```
demand-letter-landlord.md
demand-letter-landlord.md.annotations.json
```

Schema:
```json
{
  "version": 1,
  "annotations": [
    {
      "id": "a1b2c3",
      "anchor": {
        "text": "Active Plumbing Leak",
        "heading": "outstanding-habitability-violations",
        "offset": 0
      },
      "author": {
        "name": "Tom",
        "type": "human"
      },
      "created": "2026-02-12T15:30:00Z",
      "body": "Need to get photos from January visit",
      "resolved": false,
      "replies": [
        {
          "author": {"name": "Claude", "type": "ai"},
          "created": "2026-02-12T15:31:00Z",
          "body": "Photos should include the water stain extent and proximity to the electrical panel."
        }
      ]
    }
  ]
}
```

**Why sidecar, not frontmatter:**
- Keeps .md files clean and portable
- No risk of breaking markdown parsing
- Can be `.gitignore`d if desired, or committed for collaboration
- Unlimited size (frontmatter bloats the file)

### Anchoring Strategy

Comments anchor to **text + nearest heading** (dual anchor):
- `anchor.text` — the highlighted phrase in the document
- `anchor.heading` — the slugified heading the phrase appears under
- If the text moves within the same section, the anchor still resolves
- If the text is deleted, the annotation shows as "orphaned" (grayed out, still visible)

### UI: Right Margin Bubbles

**Layout change:** Content area gains a right gutter:
```css
#content {
  margin-left: 260px;
  margin-right: 280px;  /* NEW: gutter for annotations */
  max-width: 700px;     /* Tighter content for readability */
}
#annotations-gutter {
  position: fixed;
  right: 0;
  top: 0;
  width: 260px;
  height: 100vh;
  overflow-y: auto;
  padding: 48px 16px;
}
```

**Bubble design** (Catppuccin editorial):
- Small cards: `background: var(--ctp-surface0)`, `border-radius: 6px`, `padding: 10px 12px`
- Author name + timestamp in Victor Mono 9px, muted
- Human author: `color: var(--ctp-blue)` name badge
- AI author: `color: var(--ctp-mauve)` name badge with `ph-robot` icon
- Body text: DM Sans 11px
- A thin line connects the bubble to the highlighted text in the content
- Resolved comments collapse to a single line with strikethrough
- Reply thread: indented, slightly smaller

**Highlight in content:**
- Annotated text gets a subtle underline: `border-bottom: 2px solid var(--ctp-yellow)` with `cursor: pointer`
- Clicking the highlight scrolls to / focuses the annotation bubble
- Clicking the bubble scrolls the content to the highlighted text

### Creating Annotations

**Workflow:**
1. Select text in the content area
2. A small floating button appears: `ph-chat-dots` icon
3. Click → annotation form appears in the gutter at that vertical position
4. Type comment, choose author (dropdown: "Tom" / "Claude" / custom)
5. Submit → saves to sidecar JSON → renders bubble
6. Server writes the sidecar file on `POST /api/annotate`

**New endpoints:**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/annotations?tab=<id>` | GET | Fetch annotations for a tab |
| `POST /api/annotate` | POST | Create/update/reply to annotation |
| `POST /api/resolve` | POST | Mark annotation as resolved |

**Polling** — annotations file is polled alongside content (same 500ms loop). If another process (e.g., Claude Code) writes to the sidecar JSON, the viewer picks it up automatically. This means **Claude Code itself can add annotations programmatically**.

### CLI for AI Annotations

```bash
# Add an annotation from the command line (for Claude Code integration)
python3 mdpreview.py --annotate demand-letter.md \
  --text "Active Plumbing Leak" \
  --author "Claude" \
  --comment "Consider adding the NYSCEF case number here"
```

This writes directly to the sidecar JSON, and the live-reloading viewer picks it up instantly.

---

## Phase 4: Extra Features (from viewer research)

Based on the content patterns across Tom's projects:

1. **Code syntax highlighting** — add `highlight.js` CDN with Catppuccin theme. Soul Engine changelogs and Kothar docs are full of inline code and fenced blocks.

2. **Word count + reading time** — display in status bar: `1,847 words · 8 min read`. Useful for legal correspondence length awareness.

3. **Cmd+P print** — already has print CSS, but add a keyboard shortcut hint in the status bar.

4. **Unicode rendering** — ensure Hebrew (תְּהוֹם), Greek (πολλοί), and Akkadian transliteration render correctly. Already works with DM Sans, but add a test.

---

## Implementation Order

| Step | What | Est. Lines |
|------|------|-----------|
| 1 | Sidebar CSS polish (3 tweaks) | ~6 |
| 2 | Server: multi-tab `_tabs` dict + endpoints | ~80 |
| 3 | CLI: `--add` mode, multi-file args | ~30 |
| 4 | Tab bar HTML + CSS | ~60 |
| 5 | Tab JS: state, switching, polling, localStorage | ~120 |
| 6 | Cross-file link interception | ~20 |
| 7 | Server: annotation endpoints + sidecar I/O | ~80 |
| 8 | Annotation gutter HTML + CSS | ~80 |
| 9 | Annotation JS: text selection, create, render, connect lines | ~150 |
| 10 | highlight.js integration | ~10 |
| 11 | Word count in status bar | ~15 |
| **Total** | | **~650 new lines** |

---

## Verification

```bash
# Start with two files
python3 tools/mdpreview.py correspondence/demand-letter-landlord.md correspondence/contacts.md --port 3032

# Add a third file at runtime
python3 tools/mdpreview.py --add correspondence/lease-analysis.md --port 3032

# Add an AI annotation from CLI
python3 tools/mdpreview.py --annotate correspondence/demand-letter-landlord.md \
  --text "RPL §235-b" --author "Claude" --comment "This is the warranty of habitability statute"

# Verify in browser:
# - Tab bar shows 3 tabs, switching works, TOC updates per tab
# - Right margin shows the Claude annotation bubble
# - Select text → annotation button appears → can add human comment
# - Edit .md file → live reload within 500ms
# - Annotations persist across page reload (sidecar JSON)
```
