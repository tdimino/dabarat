# The Craftsman's Guide to Markdown

A demonstration of **md-preview-and-annotate**—a zero-dependency Python markdown previewer with annotations, bookmarks, and live reload.

## Features at a Glance

This tool was built for a specific workflow: **reviewing documents collaboratively** without leaving the terminal or installing a framework. Select any text to annotate it with comments, questions, suggestions, flags, or bookmarks.

### Typography & Formatting

Text can be **bold**, *italic*, or ***both***. Inline `code spans` render in a monospace font. Links like [Catppuccin](https://github.com/catppuccin/catppuccin) are styled with the active theme palette.

> "The right tool for the job is the one you can carry in your pocket."
> — Ancient engineering proverb

### Code Blocks

```python
def greet(name: str) -> str:
    """Return a greeting for the given name."""
    return f"Hello, {name}! Welcome to the preview."

# Syntax highlighting via highlight.js (CDN)
for i in range(3):
    print(greet(f"User {i}"))
```

```javascript
// JavaScript works too
const fibonacci = (n) => {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
};

console.log(fibonacci(10)); // 55
```

### Tables

| Feature | Description | Status |
|---------|-------------|--------|
| Live reload | 500ms polling for file changes | Active |
| Multi-tab | Open multiple .md files at once | Active |
| Annotations | 5 types: comment, question, suggestion, flag, bookmark | Active |
| Threaded replies | Reply to any annotation | Active |
| Orphan cleanup | Auto-remove annotations when anchor text is deleted | Active |
| Bookmark index | Global `~/.claude/bookmarks/` persistence | Active |

### Lists

Things this tool does **not** require:

1. npm, pip, or any package manager
2. A build step or compilation
3. A framework (React, Svelte, Vue, etc.)
4. An internet connection (after first CDN load)

Things it **does** use:

- Python standard library (`http.server`, `json`, `os`)
- [marked.js](https://marked.js.org/) (CDN) for markdown parsing
- [highlight.js](https://highlightjs.org/) (CDN) for syntax highlighting
- [Phosphor Icons](https://phosphoricons.com/) (CDN) for UI icons

---

## Architecture

The entire tool is **6 Python files + 2 static files**:

```
md_preview_and_annotate/
├── __init__.py          # Package metadata
├── __main__.py          # CLI entry point
├── server.py            # HTTP server + API endpoints
├── template.py          # HTML shell assembly
├── annotations.py       # Sidecar JSON I/O + orphan cleanup
├── bookmarks.py         # Global bookmark persistence
└── static/
    ├── app.js           # Client-side rendering (~1000 lines)
    └── styles.css       # Catppuccin Mocha + Latte (~1200 lines)
```

Annotations are stored in **sidecar JSON files** alongside each markdown document (`file.md.annotations.json`), keeping the original document untouched.

---

*Try selecting any text above and using the annotation carousel to leave a comment.*
