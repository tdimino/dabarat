# API Reference

All endpoints served by `server.py:PreviewHandler`. 35 endpoints total (14 GET, 21 POST).

## GET Endpoints

### `GET /`
Returns the full HTML shell (assembled by `template.py`). All JS and CSS are inlined.

### `GET /api/tabs`
Returns JSON array of open tabs.
```json
[{ "id": "abc123", "filepath": "/path/to/file.md", "filename": "file.md" }]
```

### `GET /api/content?tab={id}`
Returns markdown content and modification time for a tab.
```json
{ "content": "# Hello\n...", "mtime": 1708099200.0 }
```
Client polls this every 500ms. Only re-renders if `mtime` changes.

### `GET /api/annotations?tab={id}`
Loads annotations from sidecar JSON. Runs orphan cleanup against current markdown content.
```json
{
  "annotations": [{ "id": "...", "anchor": {...}, "author": {...}, "body": "...", "type": "comment", "resolved": false, "replies": [] }],
  "mtime": 1708099200.0
}
```

### `GET /api/tags?tab={id}`
Returns tags array for a tab.
```json
{ "tags": ["draft", "research"] }
```

### `GET /api/recent`
Returns recently opened files list (max 20).
```json
{ "entries": [{ "path": "/path/to/file.md", "title": "My Document", "opened": "2026-02-18T..." }] }
```

### `GET /api/versions?tab={id}`
Returns git-backed version history for a tab's file.
```json
{ "versions": [{ "hash": "abc123", "date": "2026-02-18T...", "message": "...", "diff_stats": {...} }] }
```

### `GET /api/version?tab={id}&hash={commit}`
Returns file content at a specific git commit.
```json
{ "content": "# Hello\n..." }
```

### `GET /api/browse-dir?path={dir}`
Returns enriched directory listing with rich metadata for workspace cards. Results are cached in-memory with thread-safe locking. Cache key includes `(dir_path, max_mtime, dir_entry_count)`.
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
Metadata extraction (word count, summary, preview, image) gated behind 1MB file size check.

### `GET /api/workspace`
Returns the active workspace JSON, or `null` if no workspace is active.
```json
{
  "version": "1.0",
  "name": "My Research",
  "folders": [{ "path": "/abs/path", "name": "Sources" }],
  "files": [{ "path": "/abs/path/README.md" }]
}
```

### `GET /api/workspaces/recent`
Returns recently opened workspaces (max 10).
```json
{
  "workspaces": [
    { "path": "/path/to/research.dabarat-workspace", "name": "Research", "lastOpened": "2026-02-20T..." }
  ]
}
```

### `GET /api/file-metadata?path={absolute_path}`
Returns enriched metadata for a single file (used for pinned workspace files).
```json
{
  "name": "README.md",
  "path": "/abs/path/README.md",
  "size": 3200,
  "mtime": 1708099200.0,
  "wordCount": 3200,
  "summary": "Zero-dependency Python...",
  "preview": "# Markdown Dabarat\n...",
  "badges": { "type": "docs" },
  "annotationCount": 4,
  "tags": ["draft"]
}
```
Metadata extraction gated behind 1MB file size check.

### `GET /api/preview-image?path={absolute_path}`
Serves image files for workspace card previews. Restricted to directories of open tabs and directories in the browse cache.
```json
// Returns raw image bytes with correct Content-Type
```

### `GET /api/diff?tab={id}&against={path}`
Returns structured diff between current tab content and another file.
```json
{ "blocks": [...], "stats": { "added": 5, "deleted": 2, "changed": 3 }, "left_filename": "a.md", "right_filename": "b.md" }
```

### `GET /{path}`
Serves static files relative to the directories of open tabs. Used for images referenced in markdown.

## POST Endpoints

### `POST /api/add`
Opens a file as a new tab. Resolves relative paths against existing tab directories.
```json
// Request
{ "filepath": "other-file.md" }
// Response
{ "id": "abc123", "filepath": "/absolute/path/other-file.md", "filename": "other-file.md" }
```

### `POST /api/close`
Closes a tab by ID.
```json
{ "id": "abc123" }
```

### `POST /api/rename`
Renames a tab's file on disk. Also renames sidecar annotation files.
```json
// Request
{ "tab": "abc123", "name": "new-name.md" }
// Response
{ "ok": true, "filepath": "/absolute/path/new-name.md", "filename": "new-name.md" }
```

### `POST /api/browse`
Opens macOS native file picker (osascript). Returns selected filepath or `cancelled: true`.
```json
{ "filepath": "/Users/tom/docs/file.md" }
```

### `POST /api/annotate`
Creates a new annotation. If type is `bookmark`, also persists to `~/.claude/bookmarks/`.
```json
{
  "tab": "abc123",
  "anchor": { "text": "selected passage", "heading": "section-id", "offset": 0 },
  "author": { "name": "Tom", "type": "human" },
  "body": "This needs revision.",
  "type": "comment"
}
```
Types: `comment`, `question`, `suggestion`, `important`, `bookmark`

### `POST /api/resolve`
Toggles resolved state. Resolved annotations are archived to `file.md.annotations.resolved.json`.
```json
{ "tab": "abc123", "id": "annotation-id" }
```

### `POST /api/reply`
Adds a threaded reply to an existing annotation.
```json
{
  "tab": "abc123",
  "id": "annotation-id",
  "author": { "name": "Claude", "type": "ai" },
  "body": "Good point, I'll revise."
}
```

### `POST /api/delete-annotation`
Permanently deletes an annotation.
```json
{ "tab": "abc123", "id": "annotation-id" }
```

### `POST /api/save`
Saves edited content to file (atomic write via tempfile + `os.replace`). Auto-commits to git version history.
```json
// Request
{ "tab": "abc123", "content": "# Updated content\n..." }
// Response
{ "ok": true, "mtime": 1708099200.0, "version": "abc123" }
```
Max content size: 10 MB.

### `POST /api/restore`
Restores file to a previous git version.
```json
// Request
{ "tab": "abc123", "hash": "abc123" }
// Response
{ "ok": true, "content": "# Restored content\n...", "mtime": 1708099200.0 }
```

### `POST /api/recent/remove`
Removes a file from the recent files list.
```json
// Request
{ "path": "/absolute/path/to/file.md" }
// Response
{ "ok": true }
```

### `POST /api/tags`
Adds or removes a tag for a file.
```json
{ "tab": "abc123", "action": "add", "tag": "draft" }
{ "tab": "abc123", "action": "remove", "tag": "draft" }
```

## Workspace Endpoints

### `POST /api/workspace`
Creates or overwrites a `.dabarat-workspace` file. Sets active workspace server-side.
```json
// Request
{ "path": "/abs/path/research.dabarat-workspace", "data": { "version": "1.0", "name": "Research", "folders": [], "files": [] } }
// Response
{ "ok": true }
```

### `POST /api/workspace/open`
Reads, validates, and activates a workspace. Adds to recent list.
```json
// Request
{ "path": "/abs/path/research.dabarat-workspace" }
// Response — workspace JSON
{ "version": "1.0", "name": "Research", "folders": [...], "files": [...] }
```

### `POST /api/workspace/close`
Deactivates the current workspace. Clears server-side state.
```json
// Response
{ "ok": true }
```

### `POST /api/workspace/add-folder`
Appends a folder to the active workspace. Writes back to disk.
```json
// Request
{ "path": "/abs/folder/path", "name": "Optional Label" }
// Response — updated workspace JSON
```

### `POST /api/workspace/add-file`
Appends a pinned file to the active workspace. Writes back to disk.
```json
// Request
{ "path": "/abs/path/file.md" }
// Response — updated workspace JSON
```

### `POST /api/workspace/remove`
Removes a folder or file entry from the active workspace. Writes back to disk.
```json
// Request
{ "path": "/abs/path", "type": "folder" }  // or "file"
// Response — updated workspace JSON
```

### `POST /api/workspace/rename`
Renames the active workspace. Writes back to disk.
```json
// Request
{ "name": "New Name" }
// Response — updated workspace JSON
```

### `POST /api/workspace/save-as`
Opens macOS native save dialog, creates a new `.dabarat-workspace` file. Activates it.
```json
// Request
{ "name": "Research" }
// Response
{ "filepath": "/chosen/path/Research.dabarat-workspace" }
```

### `POST /api/browse-folder`
Opens macOS native folder picker dialog.
```json
// Response
{ "folderpath": "/Users/tom/Documents/sources" }
```

### `POST /api/browse-file`
Opens macOS native file picker dialog (restricted to markdown files).
```json
// Response
{ "filepath": "/Users/tom/Documents/README.md" }
```
