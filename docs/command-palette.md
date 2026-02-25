# Command Palette

Press `Cmd+K` (Mac) or `Ctrl+K` to open the command palette.

## Commands

- **File** — open a `.md`, `.markdown`, or `.txt` file via native picker
- **Recent Files** — reopen the last 5 files you viewed
- **Switch to [tab]** — quick-switch between open tabs
- **Close Current Tab** — close the active tab
- **Add Tag...** — enter tag mode to add or create tags
- **Toggle Theme** — switch between Mocha and Latte
- **Toggle Sidebar** — show/hide the TOC
- **Increase/Decrease Font** — adjust font size
- **Toggle Annotations** — open/close the notes panel
- **Cycle Emoji Style** — cycle through Twitter, OpenMoji, Noto, Native
- **Settings** — full settings panel with theme, font sizes, opacity, emoji style, TOC width, and author
- **Export PDF...** — export current document as themed PDF via headless Chrome
- **New Workspace...** — save dialog to create a `.dabarat-workspace` file
- **Open Workspace...** — file picker for `.dabarat-workspace` files
- **Add Folder to Workspace** — folder picker (visible when workspace is active)
- **Add File to Workspace** — file picker (visible when workspace is active)
- **Close Workspace** — deactivate current workspace (visible when workspace is active)

## Palette Header

Displays file metadata for the active tab: filename, path, word count, estimated read time, annotation count, and any tags as colored pills.

## Tag Mode

Type `#` in the palette search field (or select "Add Tag...") to enter tag mode. Seven predefined tags are offered with color-coded suggestions. Type any other name and press Enter to create a custom tag.

A floating `Cmd+K` hint badge appears in the bottom-right corner until you've used the palette 3 times.

## Custom Command Registration

Third-party integrations can register custom commands:

```javascript
CommandPalette.register('My Tools', [
  { id: 'my-cmd', label: 'Do Something', icon: 'ph-star', action: () => doSomething() },
]);
```
