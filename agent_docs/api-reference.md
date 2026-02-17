# API Reference

All endpoints served by `server.py:PreviewHandler`.

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

### `POST /api/tags`
Adds or removes a tag for a file.
```json
{ "tab": "abc123", "action": "add", "tag": "draft" }
{ "tab": "abc123", "action": "remove", "tag": "draft" }
```
