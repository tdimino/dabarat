# Annotations

## Types

| Type | Icon | Purpose |
|------|------|---------|
| Comment | `ph-chat-circle` | General notes |
| Question | `ph-question` | Questions for the author |
| Suggestion | `ph-lightbulb` | Proposed changes |
| Important | `ph-warning` | Flagged passages |
| Bookmark | `ph-bookmark-simple` | Persisted to `~/.claude/bookmarks/` |

## Schema

Annotations are stored in sidecar JSON files (`file.md.annotations.json`) alongside each document. The original markdown is never modified.

```json
{
  "version": 1,
  "tags": ["draft", "research"],
  "annotations": [
    {
      "id": "a1b2c3",
      "anchor": { "text": "selected passage", "heading": "Section Title", "offset": 0 },
      "author": { "name": "Tom", "type": "human" },
      "created": "2026-02-15T12:00:00+00:00",
      "body": "This needs revision.",
      "type": "comment",
      "resolved": false,
      "replies": []
    }
  ]
}
```

## Workflow

- **Create**: Select text in the preview, pick an annotation type from the floating carousel
- **Reply**: Click the reply icon on any annotation bubble
- **Resolve**: Click the checkmark to archive; resolved annotations move to `file.md.annotations.resolved.json`
- **Auto-cleanup**: Orphan annotations (where the anchor text no longer exists in the document) are removed on every fetch

## Bookmarks

When an annotation has type `bookmark`, it is additionally persisted globally:

- **Index**: `~/.claude/bookmarks/INDEX.md` — most-recent-first listing
- **Snippets**: `~/.claude/bookmarks/snippets/{date}-{slug}.md` — individual bookmark files

## Tags

Tags are stored in the sidecar JSON `"tags"` array alongside annotations.

**Predefined tags**: `draft`, `reviewed`, `final`, `important`, `archived`, `research`, `personal`

**Prompt-specific tags**: `prompt:system`, `prompt:user`, `prompt:assistant`, `prompt:chain`, `prompt:cognitive`, `prompt:tested`

**Custom tags**: Type `#` in the command palette search field to create any tag. Tags appear as colored pills in the palette header, status bar, and tab bar.

## CLI Annotation

Write annotations without a browser:

```bash
dabarat --annotate document.md \
  --text "some passage" \
  --comment "This needs revision" \
  --type suggestion \
  --author "Claude"
```
