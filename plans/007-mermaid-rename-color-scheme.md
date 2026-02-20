# Markdown Dabarat: Mermaid Support + Project Rename

**Project**: `/Users/tomdimino/Desktop/Programming/md-preview-and-annotate`
**Date**: 2026-02-18

---

## Etymology

**Dabarat** (דברת) — from the West Semitic root *d-b-r* (דָּבָר, *dabar*): "word, utterance, oracle."

The same root yields דְּבוֹרָה (*Deborah*, "bee") and connects to Linear B *da-pu₂-ri-to* — the Labyrinth itself. In the Potnia Daboritu dossier (cf. `minoanmystery-astro/souls/minoan/dossiers/.../potnia-daboritu-baalat-deborah.md`), the argument runs: the Minoan Labyrinth was the "House of the Bee-Goddess," a sanctuary where priestesses (*melissai*) delivered divine speech. The bee (*deborah*) and the word (*dabar*) share a root because the oracle *speaks* — the *melissa* delivers the *dabar*.

A markdown tool named Dabarat treats text as living utterance — words that are read, annotated, spoken back to, and versioned. The Labyrinth of the Word.

---

## Feature 1: Beautiful Mermaid Support

### Goal
Render ` ```mermaid ` fenced code blocks as live SVG diagrams in the preview, matching the same CDN pattern used for marked.js and highlight.js.

### Implementation

**1. CDN Script** — Add mermaid.js to `template.py` CDN section:
```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
```

**2. Initialization** — In `init.js`, configure mermaid with Catppuccin theming:
```javascript
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: { /* map Catppuccin colors */ }
});
```

**3. Post-render hook** — In `render.js`, after `marked.parse()` and `hljs.highlightElement()`:
- Find all `<code class="language-mermaid">` blocks
- Replace their parent `<pre>` with a `<div class="mermaid-container">`
- Call `mermaid.render()` on each block to produce SVG
- Insert SVG into the container

**4. Theme switching** — When `toggleTheme()` fires, re-initialize mermaid with updated Catppuccin variables (Mocha vs Latte) and re-render all diagrams.

**5. CSS** — New `static/css/mermaid.css` module:
- `.mermaid-container` — centered, max-width, subtle border, rounded corners
- Dark/light theme overrides for SVG elements
- Print-friendly styles

**6. Error handling** — If mermaid syntax is invalid, show the raw code block with a subtle error indicator (red left border + "Invalid diagram" label) rather than breaking the page.

**7. Edit mode awareness** — Mermaid blocks in edit mode remain as raw text (textarea). Live preview only applies in read mode.

### Files to modify
- `template.py` — add CDN script tag
- `static/js/render.js` — post-render mermaid processing
- `static/js/init.js` — mermaid initialization
- `static/js/theme.js` — re-init on theme toggle
- `static/css/mermaid.css` — new module
- `template.py` — add mermaid.css to CSS concat list

---

## Feature 2: Project Rename

### From
`md-preview-and-annotate` / `mdpreview` / `mdp`

### To
**Markdown Dabarat** / `dabarat` / `dbrt`

### Changes
- `pyproject.toml` — rename package, update description, add etymology blurb
- `CLAUDE.md` — update title and references
- `__main__.py` — update CLI entry points to `dabarat` and `dbrt`
- `setup.cfg` or `pyproject.toml` console_scripts — `dabarat = ...`, `dbrt = ...`
- Keep `mdpreview` and `mdp` as aliases for backward compatibility
- `README.md` — if it exists, update; if not, create with name, etymology, feature list

### Backward Compatibility
- Existing `mdpreview` and `mdp` commands continue to work as aliases
- Package directory remains `md_preview_and_annotate` internally (avoid breaking imports)
- Sidecar JSON format unchanged

---

## Feature 3: Color Scheme System

### Goal
Replace the binary Mocha/Latte toggle with a full theme engine supporting curated presets, text-described palettes, and image-extracted palettes—all while enforcing WCAG AA contrast ratios.

### Prerequisite: Color Harmony Fixes

**HIGH priority** — must land before multi-theme work:

**3.0.1 Missing Latte annotation overrides** — `annotations.css` lines 255–284 use hardcoded Mocha-era RGBA values with zero `[data-theme="latte"]` overrides. Annotation highlights are nearly invisible in Latte mode. Same issue at lines 311–315 (type buttons), 329–333 (bubble borders), 380–384 (carousel buttons). ~20 rules total need Latte counterparts.

**3.0.2 Hardcoded TAG_COLORS** — `palette.js` lines 24–38 use literal Mocha hex (e.g. `fg: '#f9e2af'`), yielding ~1.3:1 contrast in Latte mode—effectively invisible. Refactor to reference CSS variables or maintain separate Mocha/Latte maps.

**3.0.3 Peach/Yellow distinguishability** — `suggestion` (peach) and `important` (yellow) annotation highlights are too similar at their current 15% alpha. Increase differentiation by raising one's alpha or shifting hue.

**3.0.4 Warning color inconsistency** — Warning uses `--ctp-peach` in some places, `--ctp-yellow` in others. Standardize.

**3.0.5 Box-shadow glows** — 4 glow effects missing `[data-theme="latte"]` overrides (annotation form, active annotation, dirty editor, diff mode). Tab close hover bg also needs Latte override.

**3.0.6 `--ctp-rosewater` unused** — Audit and either assign a role or remove from the variable set.

### Prerequisite: `--ctp-*-rgb` Companion Variables

143 hardcoded `rgba()` values across all CSS modules reference literal Mocha RGB channels (e.g. `rgba(203, 166, 247, 0.15)` for mauve). These break on any non-Mocha theme. Refactor:

```css
/* In theme-variables.css, for each accent: */
[data-theme="mocha"] {
  --ctp-mauve: #cba6f7;
  --ctp-mauve-rgb: 203, 166, 247;
}
[data-theme="latte"] {
  --ctp-mauve: #8839ef;
  --ctp-mauve-rgb: 136, 57, 239;
}

/* Then everywhere in other modules: */
rgba(var(--ctp-mauve-rgb), 0.15)  /* instead of rgba(203, 166, 247, 0.15) */
```

This unlocks all downstream theme work—new presets, generated palettes, and image-derived themes all "just work" once every rgba references the variable.

### 3.1 Curated Preset Palettes

Three theme families, each with a dark and light variant (6 total):

| Family | Dark Variant | Light Variant | Source |
|--------|-------------|---------------|--------|
| Catppuccin | Mocha | Latte | Current (default) |
| Rosé Pine | Rosé Pine | Rosé Pine Dawn | rosepinetheme.com |
| Tokyo Night | Storm | Light | github.com/enkia/tokyo-night-vscode-theme |

**CSS variable blocks** — Each theme defines the full set of 36+ variables under `[data-theme="name"]`:

```css
/* Rosé Pine */
[data-theme="rose-pine"] {
  --ctp-base: #191724;
  --ctp-mantle: #1f1d2e;
  --ctp-crust: #26233a;
  --ctp-surface0: #2a273f;
  --ctp-surface1: #393552;
  --ctp-surface2: #403d52;
  --ctp-overlay0: #524f67;
  --ctp-overlay1: #6e6a86;
  --ctp-text: #e0def4;
  --ctp-subtext0: #908caa;
  --ctp-subtext1: #9ccfd8;
  --ctp-blue: #31748f;
  --ctp-lavender: #c4a7e7;
  --ctp-mauve: #c4a7e7;
  --ctp-pink: #eb6f92;
  --ctp-red: #eb6f92;
  --ctp-peach: #f6c177;
  --ctp-yellow: #f6c177;
  --ctp-green: #9ccfd8;
  --ctp-teal: #9ccfd8;
  --ctp-sky: #9ccfd8;
  --ctp-sapphire: #31748f;
  --ctp-rosewater: #ebbcba;
  --ctp-flamingo: #ebbcba;
  /* + --ctp-*-rgb companions for all 14 accents */
}
```

(Full variable blocks for all 6 themes produced by research; same pattern for Rose Pine Dawn, Tokyo Night Storm, Tokyo Night Light.)

**JS theme switching** — Expand `theme.js`:
```javascript
const THEME_ORDER = [
  'mocha', 'latte',             // Catppuccin
  'rose-pine', 'rose-pine-dawn', // Rosé Pine
  'tokyo-storm', 'tokyo-light',  // Tokyo Night
];
const THEME_META = {
  'mocha':          { family: 'catppuccin', mode: 'dark',  label: 'Catppuccin Mocha' },
  'latte':          { family: 'catppuccin', mode: 'light', label: 'Catppuccin Latte' },
  'rose-pine':      { family: 'rose-pine',  mode: 'dark',  label: 'Rosé Pine' },
  'rose-pine-dawn': { family: 'rose-pine',  mode: 'light', label: 'Rosé Pine Dawn' },
  'tokyo-storm':    { family: 'tokyo-night', mode: 'dark', label: 'Tokyo Night Storm' },
  'tokyo-light':    { family: 'tokyo-night', mode: 'light', label: 'Tokyo Night Light' },
};

function cycleTheme()  { /* advance to next in THEME_ORDER */ }
function toggleTheme() { /* flip dark↔light within same family */ }
```

**SURFACE_COLORS map** — Expand for all 6 themes (used for runtime opacity calculations):
```javascript
const SURFACE_COLORS = {
  'mocha':          { base: [30,30,46],   mantle: [24,24,37],   crust: [17,17,27]   },
  'latte':          { base: [239,241,245], mantle: [230,233,239], crust: [220,224,232] },
  'rose-pine':      { base: [25,23,36],   mantle: [31,29,46],   crust: [38,35,58]   },
  'rose-pine-dawn': { base: [250,244,237], mantle: [242,233,222], crust: [232,218,201] },
  'tokyo-storm':    { base: [36,40,59],   mantle: [30,33,50],   crust: [24,26,42]   },
  'tokyo-light':    { base: [213,214,219], mantle: [203,205,213], crust: [193,196,206] },
};
```

**Smooth transitions** — Apply to all theme-affected properties:
```css
body, #toc, #main-area, #annotations-gutter,
.tab-bar, .status-bar, pre, code {
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
```

**FOUC prevention** — Script in `<head>` before CSS loads:
```html
<script>
  (function(){
    var t = localStorage.getItem('mdpreview-theme') || 'mocha';
    document.documentElement.setAttribute('data-theme', t);
  })();
</script>
```

### 3.2 Theme Picker UI

Integrated into the Cmd+K command palette settings panel:

**Three modes:**

1. **Preset cards** — 6 theme swatches (3 families × 2 modes) displayed as clickable color dot clusters. Active theme highlighted. Click to apply instantly.

2. **Text description input** — Text field accepting natural descriptions (e.g. "warm earth tones", "ocean blues", "midnight purple"). Two engines:
   - **Local keyword mapping** — MOOD_SEEDS dictionary mapping ~15 descriptions to OKLCH hue/chroma/lightness ranges, then deriving full variable set via sine-wave lightness steps:
     ```javascript
     const MOOD_SEEDS = {
       'warm earth tones': { hue: [20, 45], sat: [0.3, 0.6], light: [0.3, 0.7] },
       'ocean blues':      { hue: [190, 230], sat: [0.4, 0.8], light: [0.2, 0.7] },
       'forest greens':    { hue: [100, 160], sat: [0.3, 0.7], light: [0.2, 0.6] },
       'sunset':           { hue: [0, 40], sat: [0.6, 0.9], light: [0.4, 0.7] },
       'midnight':         { hue: [220, 270], sat: [0.3, 0.6], light: [0.05, 0.3] },
       /* ... 10+ more */
     };
     ```
   - **Colormind API fallback** — ML-based palette generation (free, POST to `http://colormind.io/api/`, returns 5 RGB colors). Used when description doesn't match a MOOD_SEED.

3. **Image drop zone** — Drag-and-drop or file picker. Extracts dominant colors and generates a full theme.

### 3.3 Image-to-Palette Pipeline

**Recommended library: node-vibrant** — Returns semantically classified swatches (not just raw colors), directly mappable to UI roles.

```javascript
import { Vibrant } from "node-vibrant/browser";

const palette = await Vibrant.from(imageUrl).getPalette();
// palette.Vibrant        → primary accent
// palette.DarkVibrant    → dark accent
// palette.LightVibrant   → light accent
// palette.Muted          → muted surface tone
// palette.DarkMuted      → dark background candidate
// palette.LightMuted     → light background candidate
// Each swatch: .hex, .rgb, .hsl, .population, .bodyTextColor, .titleTextColor
```

**Fallback: ColorThief** (CDN available, simpler):
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/color-thief/2.3.0/color-thief.umd.js"></script>
```

**Swatch-to-Variable Mapping Algorithm:**

```javascript
function mapVibrantToTheme(palette) {
  const dm = palette.DarkMuted, m = palette.Muted, lm = palette.LightMuted;
  const v = palette.Vibrant, dv = palette.DarkVibrant, lv = palette.LightVibrant;

  const avgLightness = [dm, m, lm, v, dv, lv]
    .filter(Boolean).reduce((sum, s) => sum + s.hsl[2], 0) / 6;
  const isDark = avgLightness < 0.5;

  if (isDark) {
    return {
      '--ctp-base':     dm?.hex  || '#1e1e2e',
      '--ctp-mantle':   darken(dm?.hex, 0.03),
      '--ctp-crust':    darken(dm?.hex, 0.06),
      '--ctp-surface0': m?.hex   || '#313244',
      '--ctp-surface1': lighten(m?.hex, 0.05),
      '--ctp-text':     lv?.hex  || '#cdd6f4',
      '--ctp-subtext0': lm?.hex  || '#a6adc8',
      '--accent':       v?.hex   || '#cba6f7',  // most vibrant = primary accent
      '--accent2':      dv?.hex  || '#89b4fa',
    };
  } else { /* light variant: swap base↔text, invert surface hierarchy */ }
}
```

**OKLCH derivation** — Alternative pure-CSS approach from a single base hue:
```css
:root {
  --base-hue: 265;
  --base-chroma: 0.15;
  --bg:      oklch(0.15 var(--base-chroma) var(--base-hue));
  --surface: oklch(0.22 calc(var(--base-chroma) * 0.6) var(--base-hue));
  --text:    oklch(0.90 calc(var(--base-chroma) * 0.3) var(--base-hue));
  --accent:  oklch(0.70 var(--base-chroma) var(--base-hue));
  --accent2: oklch(0.70 var(--base-chroma) calc(var(--base-hue) + 60));
}
```

**WCAG AA contrast enforcement** — Applied to all generated palettes:
```javascript
function ensureAccessible(textRgb, bgRgb, minRatio = 4.5) {
  let ratio = contrastRatio(textRgb, bgRgb);
  if (ratio >= minRatio) return textRgb;
  let [h, s, l] = rgbToHsl(...textRgb);
  const direction = luminance(...bgRgb) > 0.5 ? -0.02 : +0.02;
  while (contrastRatio(hslToRgb(h, s, l), bgRgb) < minRatio && l > 0 && l < 1) {
    l += direction;
  }
  return hslToRgb(h, s, Math.max(0, Math.min(1, l)));
}
// Targets: 4.5:1 for body text, 3:1 for large text/UI elements
```

node-vibrant provides `.bodyTextColor` and `.titleTextColor` on each swatch for free.

**Image pipeline summary:**
1. User drops image → hidden `<canvas>` draws it
2. node-vibrant extracts 6 semantic swatches from canvas
3. Mapping algorithm assigns swatches to CSS variable roles
4. WCAG check adjusts text/accent contrast as needed
5. Variables applied to `document.documentElement.style`
6. User can save as a named custom theme (persisted to localStorage)

### 3.4 Custom Theme Persistence

Generated themes (from text or image) saved to localStorage as named entries:
```javascript
// localStorage key: 'dabarat-custom-themes'
// Value: JSON array of { name, variables: { '--ctp-base': '#hex', ... }, source: 'image'|'text' }
```

Custom themes appear in the Cmd+K theme picker alongside presets. Delete via long-press or right-click.

### Files to Modify (Feature 3)

**Phase A — Harmony fixes + rgb companions:**
- `static/css/annotations.css` — add ~20 `[data-theme="latte"]` overrides
- `static/css/theme-variables.css` — add `--ctp-*-rgb` for all 14 accents in both themes
- `static/palette.js` — refactor TAG_COLORS to use CSS variables
- All CSS modules with hardcoded rgba — replace literal RGB with `var(--ctp-*-rgb)`

**Phase B — Preset themes:**
- `static/css/theme-variables.css` — add 4 new `[data-theme]` blocks (rose-pine, rose-pine-dawn, tokyo-storm, tokyo-light)
- `static/js/theme.js` — THEME_ORDER, THEME_META, cycleTheme(), toggleTheme(), expanded SURFACE_COLORS
- `template.py` — FOUC prevention script in `<head>`

**Phase C — Theme picker + generation:**
- `static/palette.js` — add "Theme" category to command palette with preset cards, text input, image drop zone
- `static/css/palette.css` — theme picker card styles, drop zone styles
- `static/js/theme.js` — MOOD_SEEDS, `paletteFromDescription()`, `applyImageTheme()`, custom theme CRUD
- New CDN script in `template.py` — node-vibrant or ColorThief

---

## Implementation Order

1. ~~**Color harmony fixes** — Missing Latte overrides, TAG_COLORS, distinguishability (Feature 3 Phase A)~~ **DONE**
2. ~~**`--ctp-*-rgb` refactoring** — Convert 143 hardcoded rgba values across all CSS (Feature 3 Phase A)~~ **DONE**
3. **Mermaid support** — CDN, render hook, theming, error handling (Feature 1)
4. **Preset themes** — Rosé Pine + Tokyo Night variable blocks, theme cycling (Feature 3 Phase B)
5. **Theme picker UI** — Cmd+K integration, preset cards (Feature 3 Phase B)
6. **Text-to-palette** — MOOD_SEEDS + Colormind API (Feature 3 Phase C)
7. **Image-to-palette** — node-vibrant CDN, extraction pipeline, WCAG enforcement (Feature 3 Phase C)
8. **Project rename** — pyproject.toml, CLI entry points, docs (Feature 2)
9. **Verify** — test with example files containing mermaid blocks + all 6 themes

---

## Example Test Content

Add to examples/ a file with mermaid blocks to verify rendering:

```markdown
---
name: mermaid-test
type: spec
---

# Mermaid Test

## Flowchart
` ``mermaid
graph TD
    A[Markdown Source] --> B{Frontmatter?}
    B -->|Yes| C[Parse YAML]
    B -->|No| D[Render Content]
    C --> D
    D --> E[Apply Highlights]
    E --> F[Live Preview]
` ``

## Sequence Diagram
` ``mermaid
sequenceDiagram
    participant User
    participant Editor
    participant Server
    User->>Editor: Cmd+E (edit mode)
    Editor->>Server: POST /api/save
    Server-->>Editor: {ok: true, mtime}
    Editor-->>User: "Saved" status
` ``
```
