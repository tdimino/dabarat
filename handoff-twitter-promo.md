# Twitter Promotion Handoff: md-preview-and-annotate

## The Pitch

A zero-dependency Python markdown previewer with annotations, bookmarks, and live reload. No npm, no pip install, no build step. Drop it into any project and preview your markdown with Catppuccin theming, a TOC sidebar, and a full annotation system—comments, questions, suggestions, bookmarks, threaded replies, resolve/archive workflow.

## Why It Exists

Most markdown preview tools fall into two camps:
1. **Heavy framework apps** (Svelte, React, Electron) that require a build pipeline
2. **Terminal renderers** that can't do annotations or visual theming

This sits in the gap: a single `python3 -m md_preview_and_annotate doc.md` command that opens a beautiful browser preview with zero setup. Pure Python stdlib server. The three CDN scripts (marked.js, highlight.js, Phosphor Icons) cache on first load—after that it works fully offline.

## The IDE + Claude Code Angle

This is the core promotional message: **it pairs with your IDE and Claude Code as a live preview + annotation layer.**

The workflow:
1. You're editing markdown in VS Code / Cursor / your editor of choice
2. md-preview-and-annotate runs alongside with 500ms live reload
3. Every save instantly reflects in the browser preview
4. You (or Claude Code via CLI) can annotate passages directly
5. Annotations persist in sidecar JSON—your markdown stays clean
6. Bookmarks persist globally to `~/.claude/bookmarks/` for cross-project recall

Claude Code can annotate from the command line without ever opening a browser:
```bash
python3 -m md_preview_and_annotate --annotate doc.md \
  --text "some passage" --comment "Needs revision" --type suggestion
```

This makes it **AI-native**—Claude Code can read your document, leave structured annotations, and you review them visually in the browser. Human and AI annotations live side by side.

## Backstory (for authenticity)

This tool was built during an actual landlord habitability dispute in Beacon, NY. Tom needed to draft, review, and annotate a 15-page demand letter collaboratively with Claude Code. Existing tools were either too heavy or too limited. So he built this—zero dependencies, modular, beautiful—in a single Claude Code session. The screenshots in the repo show the real demand letter being reviewed.

It's not a toy demo. It was born from necessity.

## Key Differentiators to Highlight

- **Zero dependencies** — not "lightweight," literally zero. Python stdlib only.
- **Live reload** — 500ms polling, instant feedback while editing
- **5 annotation types** — comment, question, suggestion, important, bookmark
- **Threaded replies** — actual conversations on annotations
- **Orphan auto-cleanup** — delete text, annotations vanish on next load
- **Catppuccin Mocha + Latte** — not an afterthought, genuinely beautiful
- **CLI annotation** — AI agents can annotate without a browser
- **Global bookmarks** — `~/.claude/bookmarks/` for cross-project memory

## Tweet Drafts

### Thread opener (declarative, no hedging)
> Released md-preview-and-annotate — a zero-dependency Python markdown previewer with annotations, bookmarks, and live reload.
>
> No npm. No pip install. No build step. One command: `python3 -m md_preview_and_annotate doc.md`
>
> Pairs with your IDE and Claude Code as a live preview + annotation layer.
>
> github.com/tdimino/md-preview-and-annotate

### Follow-up: the workflow
> The workflow I built it for:
>
> 1. Edit markdown in your IDE
> 2. md-preview-and-annotate live-reloads on every save
> 3. Select text → annotate (comment, question, suggestion, bookmark)
> 4. Claude Code annotates from CLI — no browser needed
> 5. Human + AI annotations live side by side
>
> Sidecar JSON — your markdown stays untouched.

### Follow-up: origin story
> Built this during an actual landlord dispute. Needed to review a 15-page demand letter with Claude Code. Every markdown annotation tool was either Electron-heavy or terminal-only.
>
> So I built one. Zero dependencies. Catppuccin theming. Full annotation system. The screenshots show the real letter.

### Follow-up: the Claude Code integration
> Claude Code can annotate directly from the command line:
>
> `python3 -m md_preview_and_annotate --annotate doc.md --text "passage" --comment "Needs revision" --type suggestion`
>
> Bookmarks persist to ~/.claude/bookmarks/ — cross-project memory that survives context windows.
>
> This is what AI-native tooling looks like.

### Standalone single tweet (shorter)
> Zero-dependency markdown previewer with annotations and live reload. Pure Python stdlib. Pairs with your IDE and Claude Code.
>
> One command. No install. Catppuccin themes. 5 annotation types. Threaded replies. CLI annotation for AI agents.
>
> github.com/tdimino/md-preview-and-annotate

## Hashtags / Mentions (use sparingly)

- `#ClaudeCode` — primary audience
- `@AnthropicAI` — if feeling bold
- `#markdown` `#devtools` — discovery
- Don't overdo it. The tool speaks for itself.

## Visual Assets

The repo has 5 screenshots ready for Twitter media:
- `screenshots/03-annotations.png` — best for showing the annotation panel (lead with this)
- `screenshots/01-dark-full.png` — Catppuccin Mocha with TOC and highlights
- `screenshots/02-light-full.png` — Catppuccin Latte
- `screenshots/04-real-world-dark.png` — demand letter in dark (authenticity)
- `screenshots/05-real-world-light.png` — demand letter in light

Lead with 03 (annotations) or 01 (dark theme overview). The annotation panel screenshot shows the core value prop immediately.
