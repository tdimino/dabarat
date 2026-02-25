# Workspaces

Workspaces group multiple folders and individual files into a single view, like VS Code's multi-root workspaces.

## Schema

```json
{
  "version": "1.0",
  "name": "My Research",
  "folders": [
    { "path": "/Users/tom/Desktop/sources", "name": "Sources" },
    { "path": "/Users/tom/.claude/plans", "name": "Plans" }
  ],
  "files": [
    { "path": "/Users/tom/Desktop/README.md" },
    { "path": "/Users/tom/.claude/CLAUDE.md" }
  ]
}
```

The file is readable JSON you can commit to git or share.

## Creating a Workspace

- **From CLI**: `dabarat --workspace research.dabarat-workspace`
- **From palette**: `Cmd+K` -> "New Workspace..." -- opens a save dialog, creates the file, and activates it
- **From sidebar**: click `[+]` -> "New Workspace..." when on the home screen

## Managing Folders and Files

Once a workspace is active, the sidebar shows collapsible folder sections. Use the `[+]` button to add folders or pin individual files. Remove entries with the `[x]` button on any section header or file entry. All changes write back to the `.dabarat-workspace` file immediately.

## Recent Workspaces

Previously opened workspaces appear as cards on the home screen (max 10 tracked). Click any card to reopen that workspace.

## Home Page

When a workspace is active and the home screen is shown:
- TOC sidebar transforms into a directory browser
- Main area shows file cards with word counts, annotation counts, version counts, smart badges, and markdown previews
- 10 smart file-type badges detect: prompt, agent config, plan, spec, readme, architecture, changelog, todo, license, research
- 30 curated quotes cycle every 5 minutes in the empty state
