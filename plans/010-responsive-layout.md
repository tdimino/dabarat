# Plan: Responsive Layout Fix for Small Viewports

## Context

When the browser window is made very small, the status bar text at the bottom breaks/overflows. The app currently has only one responsive breakpoint (1400px for hiding the annotations gutter) — there are no rules for viewports below that. The fixed TOC sidebar (260px), fixed main-area margins, and untruncated status bar items all collapse ungracefully at small sizes.

## Approach: Progressive Breakpoints + Flex Truncation

Three tiers of fixes, all in CSS — no JS changes needed.

### 1. Status Bar — Flex Truncation (Priority 1)

**File**: `static/css/status-print.css`

The `#status` bar uses `display: flex; justify-content: space-between` with 4 items (filepath, word-count, tags, update-indicator). At narrow widths, all items compete for space and text breaks.

**Fix**: Apply the standard flexbox truncation pattern:
- `.filepath` gets `min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;` — it shrinks first, showing ellipsis
- `#word-count` and `.updated` get `flex-shrink: 0; white-space: nowrap;` — they never shrink
- `#status-tags` gets `flex-shrink: 1; overflow: hidden;` — shrinks after filepath, hides overflow pills

### 2. Add 900px Breakpoint — Auto-Collapse TOC

**File**: `static/css/responsive.css`

At `max-width: 900px`:
- Auto-collapse the TOC: `#toc { display: none; }` and show the restore button
- Zero out `#main-area { margin-left: 0; }` (same as `body.toc-collapsed` rules)
- Remove tab bar negative margin: `#tab-bar { margin-right: 0; }`

### 3. Add 600px Breakpoint — Compact Mode

**File**: `static/css/responsive.css`

At `max-width: 600px`:
- Reduce content padding: `#content { padding: 24px 20px 80px; }`
- Hide tags from status bar: `#status-tags { display: none; }`
- Hide word count: `#word-count { display: none; }`
- Reduce status bar padding: `#status { padding: 4px 10px; gap: 8px; }`

## Files to Modify

1. `md_preview_and_annotate/static/css/status-print.css` — flex truncation on status items
2. `md_preview_and_annotate/static/css/responsive.css` — two new breakpoints (900px, 600px)

## Verification

1. Launch app: `python3 -m md_preview_and_annotate README.md`
2. Resize window progressively from full-width to ~400px
3. Check: status bar filepath truncates with ellipsis (never wraps/breaks)
4. Check at ~900px: TOC auto-collapses, content fills width
5. Check at ~600px: padding reduces, tags/word-count hide, status bar stays single-line
6. Check at full width: no visual change from current behavior
7. Check with gutter open: no overlap or gap issues
