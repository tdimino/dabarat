# Markdown Dabarat

Zero-dependency Python markdown previewer with annotations, bookmarks, and live reload.

Part of the [Claudius](https://github.com/tdimino/claudius) ecosystem.

## Stack
- Python 3.10+ (stdlib only — no pip dependencies)
- CDN: marked.js, marked-footnote, highlight.js, Phosphor Icons, Twemoji, Vibrant.js, Motion One, Tiptap/ProseMirror (cached after first load)
- 8 themes: 4 dark (Ink, Mocha, Rosé Pine, Tokyo Storm) + 4 light (Vellum, Latte, Rosé Pine Dawn, Tokyo Light). Ink + Vellum are The Scholar's Codex pair — parchment-and-iron-gall register with tungsten gold and rubricated red-ochre signature accents.

## Structure
- 11 Python modules in `dabarat/` — `server.py` (HTTP + 39 endpoints), `template.py` (HTML assembly), `annotations.py`, `bookmarks.py`, `frontmatter.py`, `diff.py`, `history.py`, `recent.py`, `workspace.py`, `pdf_export.py`, `__main__.py` (CLI entry)
- 16 JS modules in `static/js/` concatenated in dependency order — see `agent_docs/client-architecture.md`
- 14 CSS modules in `static/css/` concatenated in dependency order — theme-variables, base-layout, typography, then feature-specific (annotations, editor, diff, home, etc.)
- `static/palette.js` — Command palette + tag mode (Cmd+K) — loaded separately
- `macos/` — Finder integration: `build.sh` builds `Dabarat.app` droplet, `Info.plist` declares UTIs (`com.minoanmystery.dabarat`)

## Install
- `pip install .` from project root — installs `dabarat`, `dbrt`, `mdpreview`, and `mdp` globally (non-editable required for Finder "Open With" — editable installs hit macOS TCC on `~/Desktop/`)
- `pip install -e .` for development — changes take effect immediately but Finder integration won't work (TCC blocks `~/Desktop/` access from AppleScript droplets)

## Commands
- Run: `dabarat document.md` (or `dbrt`, `mdpreview`, `mdp`, `python3 -m dabarat`)
- Workspace: `dabarat --workspace research.dabarat-workspace`
- Add tab: `dabarat --add another.md`
- Export PDF: `dabarat --export-pdf file.md [-o output.pdf] [--theme mocha]`
- CLI annotate: `dabarat --annotate file.md --text "passage" --comment "note" --type suggestion`

## Conventions
- Annotations stored in sidecar JSON (`file.md.annotations.json`) — original markdown never modified
- Resolved annotations archived to `file.md.annotations.resolved.json`
- Bookmarks persist globally to `~/.claude/bookmarks/INDEX.md` + per-snippet files
- Default port: 3031, default author: "Tom"
- Orphan cleanup runs on every annotation fetch — stale anchors removed automatically
- Tags stored in sidecar JSON `"tags"` array; 7 predefined + 6 prompt tags + custom via palette `#` prefix
- `.prompt.md` files auto-detect YAML frontmatter → indicator bar + click-to-open metadata popup
- `{{variable}}` and `${variable}` template slots highlighted as colored pills with schema tooltips
- Blockquotes: no italic (matches GitHub/VS Code/Typora convention) — `em` and `code` inside blockquotes reset to `font-style: normal` to prevent Victor Mono cursive rendering
- Emoji style: 4 options (Twemoji, OpenMoji, Noto, Native) via `EMOJI_CDNS` in `theme.js`. `applyEmojiStyle()` runs after `marked.parse()`
- **Config dir**: `~/.dabarat/` (history, instances, recent.json). Auto-migrates from `~/.mdpreview/` on first run.
- **localStorage prefix**: `dabarat-*` keys. Migration IIFE in `state.js` copies `mdpreview-*` → `dabarat-*` on first load.
- **Color convention**: Never use hardcoded rgba channel values—use `rgba(var(--ctp-*-rgb), alpha)` from `theme-variables.css`. RGB companions (`--ctp-yellow-rgb`, `--ctp-blue-rgb`, etc.) auto-switch per theme. Latte overrides only needed when alpha values differ from Mocha defaults. TAG_COLORS in `palette.js` also uses CSS variable references for theme-awareness.
- **Vellum shadow exception**: Vellum uses warm umber shadows (`rgba(70, 48, 20, ...)`) instead of the neutral `rgba(0, 0, 0, ...)` used by every other theme. Pure-black shadows punch cold holes into its warm parchment base; the convention break is documented inline in `theme-variables.css` and should not be "normalized" back.
- **Interactive token convention**: For hover/focus states on surfaces that use `--card-bg` (white in light themes), use `var(--interactive-hover-bg)` (dark: `--ctp-surface1`, light: `--ctp-crust`) and `var(--interactive-muted-bg)` (dark: `rgba(surface1, 0.85)`, light: `rgba(0,0,0,0.06)`) instead of raw `var(--ctp-surface1)` which is invisible on white.
- **Event delegation**: Never use inline `onclick` handlers in dynamically-built HTML—use `data-*` attributes + `addEventListener` event delegation. This prevents XSS via HTML entity decoding in path strings.
- **Motion One**: Optional animation CDN loaded as ES module (`@motionone/dom`). Assigns `window.Motion` with `animate`, `stagger`, `spring`. All call sites MUST guard with `if (window.Motion && !_prefersReducedMotion)` for progressive enhancement + accessibility. `_prefersReducedMotion` is a `const` in `state.js`. Falls back to CSS `@keyframes` animations. See `@agent_docs/motion-one.md` for full call site reference.
- **Image lightbox**: Content images (excluding `.emoji` and `.tpl-var-img`) get `cursor: zoom-in` and open lightbox on click
- **Workspace system**: See `@agent_docs/workspace-system.md` for full internals. Key state: server-side `_active_workspace`/`_active_workspace_path`, client-side in `state.js`
- **PDF export**: `pdf_export.py` uses headless Chrome CDP with zero page margins (`@page { margin: 0 }`, CDP margins: 0). Visual spacing via `#content { padding: 0.6in }` in print mode. Export mode: `?theme=X&export=1` skips polling + emits render-complete sentinel. `print-color-adjust: exact` preserves dark backgrounds. `html` gets theme background in print to prevent outline artifacts on dark themes. Light themes override both `html` and `body` to `#fff`.
- **Finder integration (macOS)**: `Dabarat.app` droplet at `~/Applications/`. Bundle ID: `com.minoanmystery.dabarat`. Rebuild after Python upgrade: `bash macos/build.sh`. Default handler: `duti -s com.minoanmystery.dabarat .md all`
- **Thread safety**: `_browse_cache` in `server.py` protected by `threading.Lock()`. All shared module-level dicts under `ThreadingHTTPServer` require lock protection. `_tabs` access goes through locked helpers — `_tab_filepath()`, `_tab_dirs()`, `_refresh_tab()`, `_update_tab_content()` — never index `self._tabs` directly in handlers.
- **Change detection**: `changeKey = f"{st.st_mtime_ns}:{st.st_size}"` is the reload signal (float mtime equality misses sub-second rewrites). `/api/content`, `/api/save`, `/api/restore` return it; client compares/stores `tabs[id].changeKey`. `GET /api/mtime?tab=` is the stat-only probe (edit-mode watch).
- **Content vs body**: `/api/content` returns `content` (always the raw file — the editor round-trips it) plus `body` (frontmatter-stripped) when fm exists. Render paths use `tabBody(tab)` (`render.js`); never render raw content or frontmatter leaks into the preview, never save the body or frontmatter is destroyed.
- **Instance lifecycle**: launching `dabarat file.md` against a live server shows a tri-state dialog (Add to Existing / Open New Window / Cancel) — every failure mode is non-destructive; "Open New Window" takes a free port (socket bind-0). `_kill_port` refuses responsive dabarat instances; only unresponsive zombies are cleared. PID files are JSON `{pid, port, started}` with liveness verified via `/api/tabs` + 30s startup grace.
- **Tab-session persistence**: `~/.dabarat/instances/<port>.tabs.json` (atomic write via `_on_tabs_changed` hook on add/close/rename), cleared on clean exit, restored by `dabarat --port <port>` with no file args after an unclean death.
- **Ghost tabs**: deleted/moved files serve cached content with `fileMissing: true`; the tab name dims with strikethrough (`.tab.ghost`) and a `.status-banner` appears; saving recreates the file. Save conflicts: client sends `baseChangeKey`, server 409s if the disk changed, client confirms overwrite.
- **Size-gated extraction**: `_extract_word_count`, `_extract_summary`, `_extract_preview`, `_extract_preview_image` all gated behind 1MB file size check in browse-dir handler.
- **WYSIWYG editing**: Tiptap/ProseMirror editor loaded from esm.sh CDN (pinned @2.27.2 + tiptap-markdown@0.8.10). Extensions: StarterKit, TaskList, TaskItem, Table (row/cell/header), Placeholder. Markdown configured with `html: false`. Frontmatter stripped before Tiptap (stashed in `_stashedFrontmatter`), prepended on save. Edit mode hides annotations UI and exits diff/home mode on enter. Falls back to raw textarea if CDN unavailable. `body.edit-mode` and `body.edit-dirty` classes control dirty-state indicator (yellow caret, badge border). Editor surface matches read-mode typography (DM Sans body, Cormorant Garamond h1-h2, same `--base-size` and `line-height: 1.65`). Floating pencil button (`#edit-toggle`) mirrors annotations toggle styling with halo-glow hover.
- **Light-theme override convention**: All four light themes (Latte, Vellum, Rosé Pine Dawn, Tokyo Light) MUST appear together in every `[data-theme="..."]` override block across all CSS files (`editor.css`, `annotations.css`, `base-layout.css`, etc.). Omitting any light theme from a selector group causes silent contrast/styling regressions on that theme.
- **Floating button hover pattern**: `#annotations-toggle`, `#edit-toggle`, and `#toc-restore` use halo-glow hover (accent border + ring shadow + diffuse glow + `scale(1.08)`) rather than solid background fill. All three are glassmorphic circles with `backdrop-filter: blur(8px)` behind `@supports`, positioned at `top: 46px` / `top: 86px` (right side) and `top: 46px` (left side) to clear the tab bar. `scale(0.96)` active state for tactile feedback.
- **Toolbar hover pattern**: Formatting buttons (`.edit-fmt-btn`) use micro-glow hover (accent border + 1px ring shadow + 6px diffuse glow + 2px inset bottom accent indicator). Active (toggled-on) buttons retain the bottom indicator permanently. Save and Close buttons use outline hover (accent border + text color, no background fill). Dirty-state save button on light themes uses `--ctp-text` instead of `--ctp-yellow` for readability.
- **TOC sidebar toggle**: `Cmd+\` keyboard shortcut (also in command palette). Collapse state persists to `localStorage` key `dabarat-toc-collapsed`. `#toc-restore` button bounces in with spring animation (`tocRestoreBounce` keyframe, optional Motion One spring override). JS `matchMedia` listener at 900px fires `toggleToc()` for smooth CSS transitions instead of hard media-query snap; auto-collapse does NOT persist to localStorage (preserves user intent). Content auto-centers when TOC is collapsed (`#content { margin: auto }` globally, `#main-area` margins zeroed).
- **Footnotes**: `marked-footnote@1.4.0` UMD loaded after marked.js, registered via `marked.use(markedFootnote())` in `render.js`. Styles in `typography.css` (`section.footnotes`). Editor save path in `editor.js` post-processes serialized markdown to unescape `\[^...\]` → `[^...]` since tiptap-markdown doesn't understand footnote syntax.

## On-Demand References

Read these when relevant to the current task:

- `agent_docs/architecture.md` — Data flow, component roles, design decisions
- `agent_docs/api-reference.md` — All 37 REST API endpoints with JSON schemas
- `agent_docs/client-architecture.md` — 16 JS modules: state, rendering pipeline, annotation system
- `agent_docs/workspace-system.md` — Workspace CRUD, multi-root sidebar, CLI flag, quotes system
- `agent_docs/motion-one.md` — Motion One call sites, guard pattern, animation principles
