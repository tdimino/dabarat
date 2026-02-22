# Workspace System

VS Code-style multi-root workspace support for dabarat.

## Schema

`.dabarat-workspace` files are JSON:

```json
{
  "version": "1.0",
  "name": "My Research",
  "folders": [
    { "path": "/abs/path/to/sources", "name": "Sources" },
    { "path": "/abs/path/to/plans", "name": "Plans" }
  ],
  "files": [
    { "path": "/abs/path/README.md" },
    { "path": "/abs/path/CLAUDE.md" }
  ]
}
```

- `folders[].path`: absolute paths. `name` optional (falls back to `basename(path)`)
- `files[]`: individually pinned files that appear alongside folders
- File lives wherever the user saves it (can commit to git, share)

## File Layout

| File | Purpose |
|------|---------|
| `workspace.py` | CRUD module — read, write, create, add/remove entries, recent tracking |
| `server.py` | 13 new endpoints (see `api-reference.md` Workspace Endpoints section) |
| `static/js/state.js` | `_activeWorkspace`, `_activeWorkspacePath` vars |
| `static/js/home.js` | Multi-root sidebar, merged card grid, lifecycle functions, quotes |
| `static/css/home.css` | Sidebar sections, dropdown, quote typography, workspace cards |
| `static/palette.js` | 5 workspace commands |
| `__main__.py` | `--workspace` CLI flag |

## Python Module: `workspace.py`

Follows `recent.py` patterns — atomic writes via `tempfile.mkstemp()` + `os.replace()`, thread-safe via `threading.Lock()`.

### Functions

| Function | Purpose |
|----------|---------|
| `read_workspace(filepath)` | Read + validate `.dabarat-workspace` JSON, returns `dict \| None` |
| `write_workspace(filepath, data)` | Atomic write with lock |
| `create_workspace(filepath, name, folders, files)` | Create new workspace, add to recent |
| `add_folder(ws_path, folder_path, name)` | Append folder, write back |
| `add_file(ws_path, file_path)` | Append file, write back |
| `remove_entry(ws_path, entry_path, entry_type)` | Remove folder or file, write back |
| `rename_workspace(ws_path, new_name)` | Rename, write back, update recent |
| `load_recent()` | Load recent workspaces from `~/.dabarat/workspaces.json` (max 10) |
| `add_recent(ws_path, name)` | Add/update workspace in recent list |

### Storage

- Recent workspaces: `~/.dabarat/workspaces.json`
- Each entry: `{ "path": "...", "name": "...", "lastOpened": "ISO8601" }`
- Max 10 recent workspaces

## Server State

Module-level variables in `server.py`:

```python
_active_workspace_path = None   # Absolute path to .dabarat-workspace file
_active_workspace = None        # Parsed workspace dict
```

Set by:
- `POST /api/workspace/open` — reads, validates, activates
- `POST /api/workspace` — creates/overwrites, activates
- `POST /api/workspace/close` — clears both to `None`
- `--workspace` CLI flag — sets before server start

All POST handlers declare `global _active_workspace, _active_workspace_path` at top of `do_POST`.

## Client State

In `state.js`:

```javascript
let _activeWorkspace = null;        // Parsed workspace JSON
let _activeWorkspacePath = localStorage.getItem('dabarat-workspace-path') || null;
```

Persisted to `localStorage('dabarat-workspace-path')` when workspace is opened/closed.

## Sidebar Rendering

`_renderWorkspaceSidebar()` dispatches:

- **No workspace**: legacy single-folder mode (unchanged from before)
- **Workspace active**: `_renderWorkspaceSidebarMultiRoot(tocScroll)` builds:
  - Workspace name header with action buttons (add `[+]`, close `[x]`)
  - Collapsible folder sections (click header to expand/collapse, caret rotates)
  - Per-folder file entry list via `_loadWorkspaceSidebarEntries(dirPath, targetId)`
  - Pinned files section via `_loadPinnedFileSidebarEntries(files)`
  - Remove buttons on sections and individual entries

### Dropdown Menu

`_showAddToWorkspaceMenu(e)` creates an inline dropdown with:
- Add Folder...
- Add File...
- (separator)
- New Workspace...
- Open Workspace...

Closed by clicking outside (`document.addEventListener('pointerdown', ...)`, one-shot).

## Card Grid Rendering

`_loadWorkspaceMultiRoot()` fans out parallel requests:

```javascript
const [folderResults, fileResults] = await Promise.all([
  Promise.all(folders.map(f => fetch(`/api/browse-dir?path=${encodeURIComponent(f.path)}`))),
  Promise.all(files.map(f => fetch(`/api/file-metadata?path=${encodeURIComponent(f.path)}`)))
]);
```

Renders merged sections with folder name headers, stats, and remove buttons.

## Lifecycle Functions

| Function | Trigger |
|----------|---------|
| `createWorkspace()` | Cmd+K > "New Workspace...", `[+]` dropdown |
| `openWorkspace(path)` | Cmd+K > "Open Workspace...", recent card click, CLI flag |
| `addFolderToWorkspace()` | Cmd+K > "Add Folder", `[+]` dropdown |
| `addFileToWorkspace()` | Cmd+K > "Add File", `[+]` dropdown |
| `removeFolderFromWorkspace(path)` | `[x]` on folder section header |
| `removeFileFromWorkspace(path)` | `[x]` on pinned file entry |
| `closeWorkspace()` | Cmd+K > "Close Workspace", `[x]` on workspace header |
| `_restoreWorkspace()` | `showHomeScreen()` when `_activeWorkspacePath` exists but `_activeWorkspace` is null |

## Command Palette

5 commands registered in `palette.js` under the "Workspace" category:

| Command | Condition |
|---------|-----------|
| New Workspace... | Always visible |
| Open Workspace... | Always visible |
| Add Folder to Workspace | Hidden when no workspace active |
| Add File to Workspace | Hidden when no workspace active |
| Close Workspace | Hidden when no workspace active |

Uses `hidden: () => !_activeWorkspace` for conditional visibility.

## CLI Flag

```
dabarat --workspace research.dabarat-workspace [--port PORT]
```

- Loads workspace from disk, validates schema
- Sets server-side `_active_workspace` and `_active_workspace_path`
- Adds to recent workspaces
- Allows empty tabs (no file args required) — shows home screen with workspace

## Quotes System

30 curated quotes in `QUOTES` array in `home.js`:

| Source | Count |
|--------|-------|
| Tom di Mino | 5 |
| Waltz of the Soul and the Daimon | 3 |
| Classical (Plato, Heraclitus, Sappho, Thales) | 5 |
| Jane Ellen Harrison | 4 |
| Cyrus H. Gordon | 3 |
| Michael C. Astour | 3 |
| Tamarru | 4 |
| Scholarly / poetic | 3 |

### Cycling

- Random start index on page load
- Cycles every 5 minutes via `setInterval`
- 300ms opacity crossfade (CSS `transition: opacity 0.3s ease`)
- `_startQuoteCycling()` on empty state show, `_stopQuoteCycling()` on hide

### Typography

- Quote text: Cormorant Garamond, 20px, italic, `--ctp-subtext0`
- Attribution: DM Sans, 11px, small-caps, `--ctp-overlay0`
- Max width: 520px, centered

### Adding Quotes

Append to the `QUOTES` array in `home.js`:

```javascript
{ text: '"Your quote here."', source: 'Attribution' },
```

No rebuild, no config file. Array is flat and self-contained.

## macOS Native Dialogs

All via `osascript`:

| Endpoint | Dialog |
|----------|--------|
| `POST /api/browse-folder` | `choose folder with prompt "Add folder to workspace"` |
| `POST /api/browse-file` | `choose file of type {"md","markdown","txt","json","yaml","yml"}` |
| `POST /api/workspace/save-as` | `choose file name with prompt "Save workspace as" default name "{name}.dabarat-workspace"` |
| `POST /api/browse` | `choose file of type {"md","markdown"}` (existing, pre-workspace) |
