# Motion One Integration

## Overview

Dabarat uses [Motion One](https://motion.dev/) (`@motionone/dom`) for premium spring physics and stagger animations. Loaded as an optional ES module via CDN—all animations fall back gracefully if unavailable.

## CDN Loading

`template.py` loads Motion One as a deferred ES module:

```js
import { animate, stagger, spring } from 'https://cdn.jsdelivr.net/npm/@motionone/dom@10/+esm';
window.Motion = { animate, stagger, spring };
```

Three functions are exposed on `window.Motion`:
- `animate(elements, keyframes, options)` — animate one or more elements
- `stagger(delay)` — create staggered delays for element lists
- `spring({ stiffness, damping })` — spring physics easing

## Guard Pattern

**Every** Motion One call site MUST use this exact guard:

```js
if (window.Motion && !_prefersReducedMotion) {
  Motion.animate(element, { opacity: [0, 1] }, { duration: 0.2 });
}
```

Two conditions:
1. `window.Motion` — CDN loaded successfully (progressive enhancement)
2. `!_prefersReducedMotion` — user has not set `prefers-reduced-motion: reduce`

The `_prefersReducedMotion` constant is defined in `state.js`:
```js
const _prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

CSS also provides a `@media (prefers-reduced-motion: reduce)` block in `responsive.css` that disables CSS animations and transitions.

## Animation Principles

These principles are based on research from Raycast, Linear, and Vercel:

1. **Springs for position/scale, ease-out for opacity** — springs on opacity overshoot invisibly and waste GPU frames
2. **Never animate the critical path** — palette search/filter must be instant; stagger only on FIRST open
3. **Exits are 60-70% of entrance duration** — dismissal should feel snappier
4. **Material hierarchy**: low-elevation elements (tooltips, carousel) = 100-150ms; high-elevation (modals, popups) = 200-300ms
5. **Always provide CSS fallback** — if Motion One is unavailable, CSS `@keyframes` or `transition` handles the animation

## Call Sites

### `home.js` — Workspace Home Page
| Animation | Keyframes | Options |
|-----------|-----------|---------|
| Sidebar entries stagger | `opacity: [0,1], x: [-12,0]` | `stagger(0.03), 0.25s` |
| View crossfade (grid exit) | `opacity: 0` | `0.15s` |
| Header entrance | `opacity: [0,1], x: [-20,0]` | `0.3s, cubic-bezier(0.22,1,0.36,1)` |
| Card stagger | `opacity: [0,1], y: [24,0]` | `stagger(0.06), 0.4s, ease-out` |
| Card removal | `opacity: 0, x: 40, scale: 0.95` | `0.2s, ease-in` |

### `lightbox.js` — Image Lightbox
| Animation | Keyframes | Options |
|-----------|-----------|---------|
| Overlay fade-in | `opacity: [0,1]` | `0.25s` |
| Image scale-in | `scale: [0.92,1], opacity: [0,1]` | `0.3s, cubic-bezier(0.22,1,0.36,1)` |
| Overlay fade-out | `opacity: 0` | `0.2s` |

### `annotations.js` — Annotation System
| Animation | Keyframes | Options |
|-----------|-----------|---------|
| Carousel spring entrance | `scale: [0.8,1], opacity: [0,1]` | `spring(stiffness:400, damping:25)` |
| Carousel dismiss | `opacity: 0, scale: 0.95` | `0.1s, ease-out` |
| Bubble stagger | `opacity: [0,1], x: [8,0]` | `stagger(0.03), 0.2s` |

### `frontmatter.js` — Metadata Popup
| Animation | Keyframes | Options |
|-----------|-----------|---------|
| Popup spring entrance | `scale: [0.96,1], opacity: [0,1]` | `spring(stiffness:300, damping:22)` |
| Popup exit | `scale: 0.98, opacity: 0` | `0.15s, ease-in` |
| Section stagger | `opacity: [0,1], y: [8,0]` | `stagger(0.04), 0.2s` |

### `tabs.js` — Tab Bar
| Animation | Keyframes | Options |
|-----------|-----------|---------|
| New tab slide-in | `opacity: [0,1], x: [-12,0]` | `0.2s, ease-out` |
| Tab close collapse | `opacity: 0, width: 0, padding: 0` | `0.15s, ease-out` |

Tab creation uses `_lastTabIds` (a `Set`) to detect which tabs are newly added vs. existing during `renderTabBar()`.

### `history-ui.js` — Version History Panel
| Animation | Keyframes | Options |
|-----------|-----------|---------|
| Version entry stagger | `opacity: [0,1], x: [8,0]` | `stagger(0.03), 0.2s` |

### `palette.js` — Command Palette
| Animation | Keyframes | Options |
|-----------|-----------|---------|
| First-open item stagger | `opacity: [0,1], y: [6,0]` | `stagger(0.025), 0.18s` |

Uses `_hasStaggered` flag to prevent re-stagger on filter keystrokes (Raycast principle). Stagger runs only on the very first `open()` call.

### `editor.js` — Inline Editor
| Animation | Keyframes | Options |
|-----------|-----------|---------|
| Content fade-out (enter edit) | `opacity: 0` | `0.15s` |
| Editor fade-in (enter edit) | `opacity: [0,1]` | `0.2s` |
| Editor fade-out (exit edit) | `opacity: 0` | `0.15s` |
| Content fade-in (exit edit) | `opacity: [0,1]` | `0.2s` |

### `theme.js` — Theme Toggle (View Transitions API, not Motion One)
| Animation | Method | Options |
|-----------|--------|---------|
| Circular reveal | `document.startViewTransition()` + `clip-path: circle()` | `400ms, ease-out` |

This uses the native View Transitions API, not Motion One. The `::view-transition-old(root)` and `::view-transition-new(root)` pseudo-elements are styled in `base-layout.css`. Falls back to instant theme swap if the API is unavailable (Safari < 18, Firefox).

## CSS Fallbacks

When Motion One is unavailable:
- `home.css`: `@keyframes homeCardIn` provides fade+slide for cards
- `base-layout.css`: `@keyframes tocSlideIn` handles TOC entries
- All other surfaces use CSS `transition` properties as natural fallbacks
- `responsive.css`: `@media (prefers-reduced-motion: reduce)` disables all CSS animations

## Adding New Animations

1. Use the guard pattern: `if (window.Motion && !_prefersReducedMotion)`
2. Choose the right easing:
   - Position/scale changes → `Motion.spring({ stiffness, damping })`
   - Opacity changes → timed with `ease-out` (entrance) or `ease-in` (exit)
3. Use `.finished.then()` for sequenced animations (e.g., crossfades)
4. Use `.finished.catch(() => {})` to prevent unhandled rejection on interrupted animations
5. Provide a CSS fallback in the `else` branch or via existing `transition` properties
6. For lists, use `Motion.stagger(delay)` — 25-40ms per item is the sweet spot
7. Never animate the search/filter critical path — instant feedback always wins
