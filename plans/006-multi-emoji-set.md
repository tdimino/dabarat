# Plan: Multi-Emoji-Set Support for md-preview-and-annotate

## Context

Twemoji (Twitter emoji SVGs) was just integrated into the markdown previewer. The user wants to expand this to support **three emoji libraries** plus native OS emoji, switchable from the command palette settings. Documentation needs updating too.

**Key insight**: All three libraries serve SVGs keyed by Unicode codepoint. Rather than loading 3 separate parser libraries, we reuse twemoji's `parse()` function (already loaded via CDN) as the universal emoji detector and swap only the CDN URL via its `callback` option.

## Emoji Sets

| Style | CDN URL Pattern | Codepoint Format |
|-------|----------------|-----------------|
| Twitter (Twemoji) | Default twemoji CDN | lowercase, hyphen-separated |
| OpenMoji | `cdn.jsdelivr.net/npm/openmoji@15.1/color/svg/{ICON}.svg` | UPPERCASE, hyphen-separated |
| Noto Color Emoji | `cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/svg/emoji_u{ICON}.svg` | lowercase, underscore-separated |
| Native | No replacement — OS renders natively | N/A |

## Files to Modify

### 1. `static/js/state.js` (ALREADY DONE)
- ~~`twemojiEnabled`~~ → `emojiStyle` variable: `'twitter' | 'openmoji' | 'noto' | 'native'`
- Default: `'twitter'`
- localStorage key: `mdpreview-emoji-style`

### 2. `static/js/theme.js`
- **Remove** existing `toggleTwemoji()` function (references dead `twemojiEnabled` variable)
- **Add** `EMOJI_CDNS` object with callback functions for openmoji and noto URL generation
- **Add** `applyEmojiStyle(container)` — the unified render function:
  - `native` → no-op
  - `twitter` → `twemoji.parse(container, { folder: 'svg', ext: '.svg' })`
  - `openmoji` / `noto` → `twemoji.parse(container, { callback: EMOJI_CDNS[emojiStyle] })`
- **Add** `setEmojiStyle(style)` — persists to localStorage, forces re-render
- **Add** `cycleEmojiStyle()` — for the quick command palette action

### 3. `static/js/render.js`
- Replace:
  ```javascript
  if (twemojiEnabled && typeof twemoji !== 'undefined') {
    twemoji.parse(content, { folder: 'svg', ext: '.svg' });
  }
  ```
- With:
  ```javascript
  applyEmojiStyle(content);
  ```

### 4. `static/palette.js`
- **Settings schema** (Appearance category): Replace 2-option toggle (`twitter`/`native`) with 4-option toggle:
  - Options: `['twitter', 'openmoji', 'noto', 'native']`
  - Icons: `['ph-twitter-logo', 'ph-smiley-sticker', 'ph-google-logo', 'ph-device-mobile']`
  - get/set wired to `emojiStyle` / `setEmojiStyle()`
- **View command**: Update "Toggle Emoji Style" to call `cycleEmojiStyle()`

### 5. Documentation Updates
- **`CLAUDE.md`**: Update CDN list and emoji convention to mention all three sets + toggle
- **`agent_docs/architecture.md`**: Already updated by linter (mentions Twemoji); verify 4 CDNs listed
- **`agent_docs/client-architecture.md`**: Add emoji style to "Theme & Preferences" section

## Verification

1. Launch server: `python3 -m md_preview_and_annotate /tmp/twemoji-test.md`
2. Open in browser, verify Twitter emoji renders by default
3. `Cmd+K` → Settings → switch to OpenMoji → verify emoji images change to OpenMoji style
4. Switch to Noto → verify emoji images change to Google Noto style
5. Switch to Native → verify raw Unicode emoji (platform-dependent)
6. Close and reopen — verify preference persists via localStorage
7. `Cmd+K` → "Toggle Emoji Style" → verify it cycles through all 4 options
