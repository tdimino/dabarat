# Plan: Add Twemoji to md-preview-and-annotate

## Context

Ghostty hardcodes Apple Color Emoji on macOS and Twemoji's SVGinOT color format doesn't render in terminal emulators (B&W outlines only). Not viable there.

md-preview-and-annotate is browser-based — it renders markdown to HTML via marked.js and serves it on localhost. Twemoji replaces Unicode emoji with Twitter's SVG images in-browser, which is a clean integration point. Currently the tool has zero emoji handling (relies on native browser rendering).

## Changes

### 1. Add Twemoji CDN script

**File**: `md_preview_and_annotate/template.py` (~line 54, alongside other CDN scripts)

Add:
```html
<script src="https://cdn.jsdelivr.net/npm/@twemoji/api@latest/dist/twemoji.min.js"></script>
```

### 2. Post-process rendered HTML with Twemoji

**File**: `static/js/render.js` (after line 63 where `marked.parse()` output is assigned)

After `content.innerHTML = html`, add:
```javascript
if (typeof twemoji !== 'undefined') {
  twemoji.parse(content, { folder: 'svg', ext: '.svg' });
}
```

This replaces Unicode emoji in the DOM with Twitter SVG images.

### 3. Add emoji CSS sizing

**File**: `static/css/typography.css`

Add:
```css
img.emoji {
  height: 1em;
  width: 1em;
  margin: 0 0.05em 0 0.1em;
  vertical-align: -0.1em;
}
```

This ensures Twemoji SVGs are inline-sized to match surrounding text.

## Files

| File | Change |
|------|--------|
| `md_preview_and_annotate/template.py` | Add Twemoji CDN script |
| `static/js/render.js` | Post-process DOM with `twemoji.parse()` |
| `static/css/typography.css` | Add `img.emoji` sizing rule |

## Verification

1. Run: `python3 -m md_preview_and_annotate test-file.md`
2. Open in browser, confirm emoji render as Twitter SVGs (inspect element — should be `<img class="emoji">` tags, not Unicode text)
3. Test with emoji-heavy content: status indicators, repo icons from hooks README, skin-tone modifiers, flag sequences
4. Verify annotations still work correctly on paragraphs containing emoji
5. Check render performance on a large file (should be negligible overhead)
