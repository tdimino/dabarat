# UX Research: md-preview-and-annotate Feature Design

**Project**: `/Users/tomdimino/Desktop/Programming/md-preview-and-annotate`
**Date**: 2026-02-18
**Sources**: Exa Search (7 queries, 85 results) + Firecrawl (6 scrapes)

---

## Topic 1: Markdown Editor Home/Start Screens

### Key UX Patterns Found

**1. Two-Zone Layout (Start + Recent)**
The dominant pattern across VS Code, JetBrains, and Typora is a **two-column or two-zone layout**: the left/top zone has "Start" actions (New File, Open Folder, Clone Repo), while the right/bottom zone shows "Recent" files/projects. VS Code's Welcome Page UX issue (#63152) includes user research showing:
- **New users** primarily install extensions and explore help links
- **Current users** go straight to recent projects or open folders
- The VS Code team added a "Top Result" section, star/pin for recents, and a privacy section

**2. Recent Files Metadata**
Across Obsidian, VS Code, Bear, and Notion, recent file entries consistently show:
- **File name** (primary, bold)
- **File path or folder** (secondary, muted text)
- **Last modified date** (relative: "2 hours ago", "Yesterday")
- **Preview snippet** (first 1-2 lines of content)---used by Bear and Notion, skipped by VS Code
- **Tags/labels** (Obsidian, Bear)---colored pills inline
- **File type icon** (VS Code uses file icons; Bear uses note icon)
- **Star/pin indicator** for favorites (VS Code issue #63057 requested this)

**3. Obsidian's Approach: Dashboard Note + Plugin Ecosystem**
Obsidian does not have a built-in home screen. Instead, power users create a "Home Note" using:
- **Homepage plugin** that auto-opens a specific note on vault launch
- **Dataview plugin** for dynamic recent file queries
- **CSS snippets** for dashboard layouts (flexbox grid of sections: recent, projects, daily notes)
- The community consensus is: **a configurable landing note > a rigid start page**

Key CSS pattern from Sweet Setup's dashboard tutorial:
```css
.dashboard div > ul {
  list-style: none;
  display: flex;
  column-gap: 50px;
  row-gap: 30px;
  flex-flow: row wrap;
}
.dashboard div > ul > li {
  min-width: 250px;
  width: 15%;
}
```

**4. File Browser Sidebar Patterns**
- **Obsidian**: Left sidebar with File Explorer (tree view), Recent Files (flat list), Search, Bookmarks
- **VS Code**: Activity bar icons toggle sidebar panels (Explorer, Search, Source Control, Extensions)
- **Bear**: Three-column layout (sidebar > note list > editor)---sidebar has folders/tags, middle column has recent notes sorted by date
- **Typora**: File tree in sidebar, recent files in File > Open Recent

**5. Grid vs. List View Toggle**
- **Notion**: Offers grid (card) and list views for pages, with hover preview
- **Google Docs**: Grid of recent doc thumbnails (visual preview) with list view toggle
- **VS Code**: List-only for recent files, but with grouping by workspace

### Best Examples

| App | Approach | Strengths |
|-----|----------|-----------|
| VS Code Welcome Tab | Two-zone: Start actions + Recent list with path + date | Clean separation of intent; research-backed layout |
| Bear | Three-column with recent notes showing first-line preview | Instant content scan without opening |
| Notion | Card grid with cover images + metadata | Visual, scannable, but heavy |
| Obsidian Homepage Plugin | User-configurable dashboard note | Maximum flexibility, zero overhead |
| Google Docs | Thumbnail grid of recent documents | Visual memory cue (you recognize a doc by how it looks) |

### Concrete Recommendations for md-preview-and-annotate

1. **Start Screen as Default "+" Tab**: When user clicks "+", instead of immediately showing a file picker, show a start screen with:
   - **Recent Files** (top section): List view with filename, directory, last modified (relative), word count, tag pills. Max 10-15 entries.
   - **Quick Actions** (compact row): "Open File...", "Open Folder...", "New Markdown File"
   - Recent files sorted by last-opened timestamp (tracked in `localStorage` or sidecar JSON)

2. **Metadata Per Entry**:
   - Filename (bold, primary)
   - Directory path (muted, truncated from left if long)
   - Relative time ("3 min ago", "Yesterday")
   - Word count or read time
   - First 80 chars of content as preview snippet
   - Tag pills (if file has sidecar annotation tags)
   - Annotation count badge

3. **Layout**: Single-column list is sufficient for a lightweight tool. Avoid grid/cards---they require thumbnails which are expensive for a zero-dependency tool. Match the existing Catppuccin theme variables.

4. **Persistence**: Store recent files in `localStorage` key `mdpreview-recent-files` as JSON array of `{ filepath, filename, lastOpened, wordCount }`. Update on every tab switch. Cap at 20 entries.

5. **Remove/Pin**: Right-click context menu on recent entries for "Remove from Recent" and "Pin to Top". Pinned items persist above the time-sorted list.

---

## Topic 2: Settings Panel via Command Palette

### Key UX Patterns Found

**1. Two Categories of Command Palettes (Retool Research)**
Retool's design team identified two fundamental types:
- **Content-focused**: Primarily for finding things (files, pages). Examples: Notion, macOS Spotlight, Things
- **Action-focused**: Primarily for executing commands (archive, triage, format). Examples: Superhuman, Linear, Cron

Retool's solution: **combine both into one surface with sections** (Actions, Components, Code) and a "Top Result" that always bubbles the best match to top regardless of category. This is the gold standard for command palettes in IDEs.

**2. Command Palette Anatomy (Medium / Alicja Suska)**
A well-designed command palette has these elements:
- **Search input** at top with placeholder text ("Type a command or search...")
- **Category grouping** with section headers (File, View, Settings, Tags)
- **Keyboard shortcut hints** shown right-aligned per item
- **Fuzzy matching** with character highlighting in results
- **Recent/frequent commands** shown when search is empty
- **Prefix modifiers**: `>` for commands, `#` for tags, `@` for mentions, `/` for navigation

**3. VS Code Settings Architecture**
VS Code's settings are accessible via:
- `Cmd+,` opens the Settings Editor (GUI)
- `Cmd+Shift+P` > "Preferences: Open Settings" via Command Palette
- Settings Editor has: search bar with `@` filters (`@modified`, `@ext:`, `@feature:`, `@tag:`), left sidebar with category tree, main area with grouped settings
- Each setting shows: label, description, current value, gear icon (reset, copy JSON), blue left-bar for modified settings
- Changes apply immediately (no Save button needed)

**4. Settings Panel Layouts (LogRocket / Salt Design System)**
Six layout types for settings screens:
- **Tabbed**: Categories as tabs across top (Netflix, Slack)
- **List-based**: Scrollable flat list (iOS Settings, Android)
- **Card-based**: Grouped cards (Tesla)
- **Sidebar navigation + content**: Left nav with category tree, right content area (VS Code, Salt Design System's Preferences Dialog)
- **Toggle switch**: Minimal on/off switches (notification preferences)
- **Modal dialog**: Centered overlay with categories and controls

Salt Design System's Preferences Dialog pattern:
- **Anatomy**: Dialog overlay + left vertical navigation + right content area + bottom button bar
- **Navigation**: Fixed-width parent container (nav) + flexible child container (content) using parent-child layout
- **Applying changes**: Two modes---either Cancel/Save button bar (batch apply) or live-apply with close button only
- **Responsive**: Navigation collapses to full-width at small breakpoints with back-chevron navigation
- **Scrolling**: Shadow indicators at top/bottom when content overflows

**5. Mobbin's Command Palette Glossary**
- Common keyboard shortcut: `Cmd+K` or `Cmd+P`
- Originated from code editors (Sublime Text, VS Code)
- Now standard in: Figma, Notion, Linear, Vercel, Raycast, Slack
- Key insight: "A searchable command palette interface is a user-friendly approach to locating a feature, especially if there are too many actions for users to locate otherwise"

### Best Examples

| App | Settings Access | Strengths |
|-----|----------------|-----------|
| VS Code | `Cmd+,` for Settings Editor; `Cmd+Shift+P` for commands | Dual access: GUI editor + command palette. `@` filters are powerful |
| Linear | `Cmd+K` palette with settings section | Everything through one surface. No separate settings page |
| Figma | `Cmd+/` for commands; separate Preferences dialog | Quick actions via palette, deep settings via dialog |
| Notion | `Cmd+K` for search/commands; sidebar "Settings & Members" | Palette for navigation, dedicated page for settings |
| Salt Design System | Modal dialog with left nav + content area | Enterprise-grade pattern with responsive collapse |

### Concrete Recommendations for md-preview-and-annotate

1. **Extend Existing Command Palette** (`Cmd+K`): Add a "Settings" category to the existing `palette.js` command registry. When selected, it opens a settings panel **within the palette modal itself** (not a separate page). This keeps the zero-dependency, single-page architecture intact.

2. **Settings Panel Layout** (inside palette):
   - Replace the command list with a **two-zone settings view**:
     - Left: Category pills/tabs (Appearance, Editor, Annotations, Advanced)
     - Right: Settings controls for the selected category
   - Back arrow or Escape to return to command palette
   - Triggered by typing "settings" in palette, or via a "Preferences..." command, or `Cmd+,` shortcut

3. **Settings Categories and Controls**:
   - **Appearance**: Theme toggle (Mocha/Latte), font size slider (11-22px), font family selector
   - **Editor**: Default author name (text input), auto-refresh interval, TOC default width
   - **Annotations**: Default annotation type, show/hide resolved annotations toggle, orphan cleanup toggle
   - **Advanced**: Port number, debug mode toggle, export/import settings

4. **Control Types**:
   - Toggle switches for booleans (theme, debug mode)
   - Slider for numeric ranges (font size, TOC width)
   - Text input for strings (author name, port)
   - Dropdown/select for enumerations (font family, default annotation type)

5. **Persistence**: All settings already use `localStorage`. The settings panel is just a GUI over existing `localStorage` keys. Changes apply immediately (live preview)---no Save button needed. This matches VS Code's pattern.

6. **Search Within Settings**: Reuse the palette's search input. When in settings mode, typing filters settings by label/description. Show `@modified` filter to see only changed settings.

---

## Topic 3: Version History UI for Markdown Files

### Key UX Patterns Found

**1. Notion's Page History**
- Access: `...` menu > "Page History"
- **Timeline sidebar**: Right panel with list of versions, each showing timestamp and "Restored by [user]" if applicable
- **Preview area**: Full-page preview of the selected version
- **Restore button**: Single click to restore; overwrites current version (which becomes a new history entry)
- **Plan-gated**: Free users see 7 days, Plus sees 30 days, Business sees 90 days
- **No diff view**: You see the full version, not a comparison. Must mentally compare by switching between versions
- **Limitation**: No line-level diff, no side-by-side comparison

**2. HackMD's Editing History**
- Access: Click line number > "View Edit History"
- **Line-level granularity**: Shows history for a specific line/paragraph, not the whole document
- **Color coding**: Red = deleted content, Green = added content
- **Arrow navigation**: Left/right arrows to step through versions
- **"Full Version" link**: Opens the complete document at that point in time
- **Plan-gated**: Free users see last 3 edits; Prime users see all
- HackMD's approach is unique: **paragraph-level history** rather than whole-document snapshots

**3. Obsidian Edit History Plugin**
- Automatically saves edit history on every modification
- **Compressed diff storage**: Stores diffs, not full snapshots---efficient for large vaults
- **Browse/diff/copy interface**: Side panel with version list, click to see diff or copy old content
- **Configurable**: Min time between saves, max edit size, max edit age
- **Path-based blacklist**: Exclude certain folders from tracking
- **Storage**: History files stored alongside notes (`.edit-history/` directory)

**4. Obsidian Sync Version History**
- Built into Obsidian Sync (paid feature)
- Shows list of snapshots with timestamps
- Click to view full content at that point
- Restore button to revert
- Retains versions for up to 12 months

**5. Document Node's File Editing History**
- "Navigate to different file revisions created at different times to bring back your old changes"
- Timeline-based UI with restore capability
- Integrated into the sidebar as a panel

**6. diff2html (Open Source Library)**
- Two output formats: **Line-by-Line** (unified) and **Side-by-Side** (split)
- Color scheme: Light/Dark/Auto
- **File summary**: Collapsible list of changed files with +/- counts
- **Matching modes**: Lines, Words, None (configurable granularity)
- **Syntax highlighting** within diff blocks
- **Sticky file headers** for long diffs
- **Synchronized scroll** for side-by-side mode
- This is the gold standard for web-based diff rendering

**7. Git-Based Version History Patterns**
From the web diff tools surveyed (webdiff, diffnote, GitClear):
- **Timeline/commit list**: Left sidebar with commit hashes, authors, dates, messages
- **Diff view**: Main area with unified or split diff, line numbers, +/- highlighting
- **File tree**: For multi-file changes, collapsible tree of affected files
- **Restore/revert**: Button to restore a specific version
- **Cherry-pick**: Select specific changes to restore (advanced)

### Best Examples

| Tool | Approach | Strengths |
|------|----------|-----------|
| HackMD | Line-level edit history with arrow navigation | Granular, focused, low cognitive load |
| Obsidian Edit History Plugin | Compressed diffs with browse/diff/copy | Efficient storage, full Obsidian integration |
| diff2html | Side-by-side + unified diff with syntax highlighting | Best-in-class web diff rendering |
| Notion | Full-page version timeline with restore | Simple mental model, but no diff view |
| VS Code (SCM) | Inline diff with gutter indicators | Familiar to developers, precise |

### Concrete Recommendations for md-preview-and-annotate

1. **Git-Backed Version History**: Since the tool already has `diff.py` for side-by-side markdown diff, extend it with git integration:
   - On every file save (detected via mtime change in polling), auto-commit to a **shadow git repo** (`.mdpreview-history/` directory alongside the file, or a single `~/.mdpreview/history/` repo)
   - Store commits with message format: `"Auto-save: {filename} at {ISO timestamp}"`
   - This gives you version history for free via git's storage efficiency

2. **Version History Panel UI**:
   - Access: Command palette "Show Version History" or `Cmd+H` shortcut, or button in status bar
   - **Layout**: Right sidebar panel (similar to annotation gutter) with:
     - **Timeline list** at top: Each entry shows relative timestamp ("3 min ago", "Yesterday 2:15 PM"), word count delta (+12 / -5 words), and first few changed words as preview
     - **Diff view** below: When a version is selected, show side-by-side diff using existing `diff.js` infrastructure
   - **Current vs. Selected**: Left panel = selected historical version, Right panel = current version

3. **Diff Rendering**:
   - Reuse the existing `diff.py` engine for generating diffs
   - Color coding: Green background for additions, red background for deletions (standard git convention)
   - **Word-level highlighting** within changed lines (not just line-level) for markdown where small edits are common
   - **Synchronized scroll** between the two panels (already in `diff.js`)

4. **Restore/Rollback UX**:
   - "Restore This Version" button on each history entry
   - Confirmation dialog: "Restore file to version from [timestamp]? Current content will be saved as a new version."
   - Restoring creates a new auto-commit first (so current state is never lost), then writes the old content
   - No destructive operations---every state is preserved

5. **Lightweight Alternative (No Git)**:
   - If git dependency is unwanted, use **JSON-based version storage**:
     - `file.md.history.json` sidecar with array of `{ timestamp, content_hash, diff_from_previous }`
     - Store compressed diffs (similar to Obsidian Edit History plugin's approach)
     - Keep last N versions (configurable, default 50) with time-based thinning (keep hourly for first day, daily for first week, weekly thereafter)

6. **Timeline Visual Design**:
   - Vertical timeline with dots/nodes for each version
   - Larger dots for significant changes (>10% content delta)
   - Hover preview: tooltip showing first 100 chars of changed content
   - "Today", "Yesterday", "This Week" section headers
   - Match Catppuccin theme colors: use `--ctp-green` for additions, `--ctp-red` for deletions, `--ctp-surface0` for timeline background

---

## Cross-Cutting Design Principles

1. **Zero-dependency constraint**: All three features must work with Python stdlib + existing CDN dependencies. No new npm packages or Python pip dependencies.

2. **Catppuccin consistency**: All new UI elements use the existing Mocha/Latte CSS variables. No hardcoded colors.

3. **Command palette as hub**: The palette (`Cmd+K`) is the primary entry point for all three features. Recent files, settings, and version history are all accessible through it.

4. **Sidecar file pattern**: Version history follows the same pattern as annotations---data lives alongside the markdown file, never modifying the source. Pattern: `file.md.history.json` (or git-based in `.mdpreview-history/`).

5. **Progressive disclosure**: Start screen shows recent files by default. Settings are hidden behind a command. Version history is available but not in your face. Power users discover depth; casual users get simplicity.
