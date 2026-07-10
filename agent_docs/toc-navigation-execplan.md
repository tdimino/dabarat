# Make TOC navigation deterministic across repeated clicks, re-renders, and tabs

**Project**: `/Users/tomdimino/Desktop/Programming/dabarat`
**Date**: 2026-07-09
**Author**: Codex planner (gpt-5.5, high) via codex-orchestrator; investigation by Claude


This ExecPlan is a living document. Sections Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.

## Purpose / Big Picture

TOC links will always navigate to their heading, even when the URL already contains the same hash. Navigation will use an explicit window scroll rather than relying on the browser to react to a hash change.

A successful implementation will provide these observable behaviors:

1. Clicking a distant TOC entry places its heading approximately 80 pixels below the viewport top.
2. Scrolling elsewhere and clicking the same entry again returns to it.
3. Clicking another entry during a smooth jump makes the newest click win.
4. The URL hash matches the destination without creating browser-history entries.
5. Scroll-spy highlighting continues to follow manual and programmatic scrolling.
6. Sidebar scrolling cannot cancel the window scroll.
7. Initial deep links work after asynchronous document rendering.
8. Tab switches and polling re-renders do not apply stale hashes to the wrong document.
9. Reduced-motion users receive immediate navigation.

## Progress

- [x] (2026-07-09 21:37Z) Inspected the TOC construction and scroll-spy implementation in `dabarat/static/js/render.js`.
- [x] (2026-07-09 21:37Z) Confirmed JavaScript concatenation order in `dabarat/template.py`: `state.js`, `utils.js`, `theme.js`, then `render.js`, with all files sharing one global scope.
- [x] (2026-07-09 21:38Z) Inspected tab switching, polling, home-screen replacement of the TOC DOM, edit mode, diff mode, annotation processing, reduced-motion state, and CSS layout.
- [x] (2026-07-09 21:38Z) Confirmed that the repository has shell verification phases but no general browser-test framework.
- [x] (2026-07-10 00:24Z) Implemented deterministic live-DOM heading IDs, delegated TOC activation, and node-identity rebinding.
- [x] (2026-07-10 00:24Z) Implemented the generation-scoped jump lifecycle, tab-owned hash synchronization, initial deep links, and polling re-render reconciliation.
- [x] (2026-07-10 00:24Z) Removed `scrollIntoView()` and constrained automatic centering to `#toc-scroll.scrollTo()`.
- [x] (2026-07-10 00:24Z) Added the shared `--toc-heading-offset` and `scroll-margin-top` rules.
- [x] (2026-07-10 00:25Z) Added the stdlib-only headless CDP harness with named V1-V20 cases, real polling rewrites, and ephemeral ports.
- [x] (2026-07-10 00:29Z) Ran the TOC-specific and existing regression commands. Static checks passed; browser/server phases were blocked by the managed sandbox's localhost socket prohibition.
- [x] (2026-07-10 00:29Z) Recorded implementation results and the browser-verification deviation in this plan.

## Surprises & Discoveries

- Observation: `buildToc()` and `render()` independently derive the same heading identifier.

  Evidence: `dabarat/static/js/render.js` currently calculates `slugify(text) + '-' + i` in both the TOC builder and the rendered heading loop.

- Observation: `buildToc()` processes detached, pre-emoji HTML, while rendered heading IDs are assigned after `applyEmojiStyle()`.

  Evidence: `buildToc(html)` runs before `content.innerHTML = html`; `applyEmojiStyle(content)` then runs before rendered IDs are assigned.

- Observation: deriving TOC labels after Twemoji replacement would lose emoji text because emoji become `<img>` elements.

  Evidence: `applyEmojiStyle()` in `dabarat/static/js/theme.js` calls `twemoji.parse()`. Therefore, assign heading IDs and build TOC entries from the live headings before emoji replacement, then let `buildToc()` read the already-assigned IDs.

- Observation: the TOC list element itself is not permanent.

  Evidence: `showHomeScreen()` and `hideHomeScreen()` in `dabarat/static/js/home.js` cache and restore `#toc-scroll.innerHTML`. Restoration creates a new `#toc-list` without its prior event listeners.

- Observation: tab switching already preserves a numeric scroll position per tab.

  Evidence: `switchTab()` in `dabarat/static/js/tabs.js` saves `window.scrollY` and restores `tabs[id].scrollY` in `requestAnimationFrame()`.

- Observation: polling can replace all rendered content every 500 milliseconds when an external file change is detected.

  Evidence: `poll()` in `dabarat/static/js/polling.js` calls `render()` when the active tab’s `changeKey` changes.

- Observation: the sticky tab bar occupies approximately 34 pixels, while scroll-spy uses an 80-pixel heading threshold.

  Evidence: `#tab-bar` has `min-height: 34px` in `dabarat/static/css/base-layout.css`; `updateActiveHeading()` tests `rect.top <= 80`.

- Observation: no new theme-specific styling is needed. The feature only needs a layout offset.

  Evidence: navigation behavior and `scroll-margin-top` require no colors, backgrounds, or shadows.

- Observation: `render()` can safely reference home, edit, and diff state declared in later concatenated files because calls begin from `init.js`, after the full ordinary script has executed.

  Evidence: `dabarat/template.py` concatenates `init.js` last, and `init()` is invoked only at the end of that file.

- Observation: the managed execution sandbox rejects even an ephemeral localhost socket bind with `PermissionError: [Errno 1] Operation not permitted`.

  Evidence: the first phase-7 run failed inside `_find_free_port()` before starting either dabarat or Chrome. The harness now reports this as an explicit failure with a final `PASS=0 FAIL=1` line instead of a traceback.

## Decision Log

- Decision: Replace native-only hash navigation with delegated TOC activation and an explicit `window.scrollTo()` call.

  Rationale: An explicit scroll executes even when `location.hash` already equals the target, fixing the reproduced same-hash no-op.

  Date/Author: 2026-07-09 / Planner Agent.

- Decision: Keep real `href="#id"` values on TOC anchors.

  Rationale: The anchors remain semantic, focusable, copyable, and useful when opened in a new tab. The delegated handler will intercept ordinary primary-button and keyboard activation only.

  Date/Author: 2026-07-09 / Planner Agent.

- Decision: Use `history.replaceState()` to synchronize the hash.

  Rationale: It updates the shareable URL without invoking native hash scrolling and without creating a browser-history entry for every TOC click.

  Date/Author: 2026-07-09 / Planner Agent.

- Decision: Assign each heading ID once on the live DOM and make `buildToc()` consume those headings and IDs.

  Rationale: This removes the duplicated slug algorithm. IDs and TOC targets can no longer drift apart.

  Date/Author: 2026-07-09 / Planner Agent.

- Decision: Assign IDs and build TOC entries before `applyEmojiStyle()`.

  Rationale: This preserves emoji in TOC labels while retaining the current slug behavior, which ignores emoji characters.

  Date/Author: 2026-07-09 / Planner Agent.

- Decision: Replace `activeLink.scrollIntoView()` with direct scrolling of `#toc-scroll`.

  Rationale: Computing and setting only `#toc-scroll.scrollTop` makes it impossible for sidebar maintenance to scroll or cancel the document scroller. This is stronger than merely timing `scrollIntoView()` carefully.

  Date/Author: 2026-07-09 / Planner Agent.

- Decision: Also suppress automatic sidebar centering while a document jump is active.

  Rationale: Scroll-spy may continue updating active classes during the jump, but the sidebar should not chase every intermediate heading. Center the final active link after the document jump settles.

  Date/Author: 2026-07-09 / Planner Agent.

- Decision: Use one CSS custom property as the source of truth for both explicit JavaScript offset calculation and CSS `scroll-margin-top`.

  Rationale: This avoids replacing one duplicated constant with another. Scroll-spy should read the same value instead of retaining its literal `80`.

  Date/Author: 2026-07-09 / Planner Agent.

- Decision: Treat an exact heading hash present on the initial page load as an intentional deep link.

  Rationale: A reload with a genuinely stale hash cannot be distinguished from a copied deep-link URL. Exact initial hashes should therefore win. Once the single-page application switches tabs, hash ownership makes stale hashes detectable and removable.

  Date/Author: 2026-07-09 / Planner Agent.

- Decision: Clear, rather than heuristically remap, a TOC-owned hash whose heading disappears after a re-render.

  Rationale: Mapping by heading text or ordinal could silently navigate to the wrong section after an edit.

  Date/Author: 2026-07-09 / Planner Agent.

- Decision: Keep mode guarding and tab/render ownership entirely inside `render.js` rather than adding cross-file lifecycle calls.

  Rationale: The jump monitor cancels on hidden modes, while forced preview re-renders already provide the single rebuild/rebind point on exit. This preserves existing edit, diff, home, and tab restoration flows.

  Date/Author: 2026-07-10 / Builder Agent.

## Outcomes & Retrospective

Implemented all six milestones in `dabarat/static/js/render.js`, `dabarat/static/css/typography.css`, and `scripts/verify/phase7_toc_navigation.py`. The builder also maintained this living ExecPlan and the repository-standard `progress.json` session record.

Static verification passed: template assembly, standalone `render.js` syntax, fully concatenated JavaScript syntax, Python compilation of the new verifier, absence of `scrollIntoView` in `render.js`, and `git diff --check`.

Google Chrome 149.0.7827.201 is installed but was not exercised. The managed sandbox rejected `_find_free_port()` with `PermissionError: [Errno 1] Operation not permitted`, so phase 7 correctly reported `PASS=0 FAIL=1` and exited nonzero before launching the server or browser. This is an unverified browser phase, not a pass.

Phases 1–6 were also invoked and all failed because their scratch servers could not bind or connect to localhost; phase 6 additionally encountered the sandbox's write restriction for `~/.dabarat/instances`. Their reported totals were: phase 1 `PASS=2 FAIL=12`, phase 2 `PASS=2 FAIL=5`, phase 3 `PASS=0 FAIL=6`, phase 4 `PASS=0 FAIL=5`, phase 5 `PASS=2 FAIL=9`, and phase 6 `PASS=1 FAIL=8`. These runs did not reach meaningful product regression coverage.

There were no functional deviations from the ExecPlan. The only acceptance deviation is environmental: V1–V20 remain to be executed in a context that permits ephemeral localhost sockets. The verifier includes one additional CDP assertion for `document.scrollingElement === document.documentElement`.

### Post-sandbox browser verification (2026-07-09, orchestrator session)

The full suite was then executed outside the sandbox against Google Chrome 149.0.7827.201. Final result: **phase 7 `PASS=21 FAIL=0`**, phases 1–6 all green (`14/7/6/5/11/9` passes, zero failures), plus a live installed-build check confirming the originally reported defect is fixed (same-hash re-click returns to the heading; landing offset exactly 80px; active link and hash correct).

Five harness defects and one product defect were found and fixed during bring-up:

1. Harness: `install_instrumentation` resolved `window.__nativeWindowScrollTo` dynamically at call time; its second install (after V5's navigation) made the chain self-referential — infinite recursion poisoning V6–V19. Fixed with an idempotent closure-captured wrapper.
2. Harness: V3 and V10 contained literal `}})()`  in plain (non-f-string) segments — invalid JS. Fixed to `})()`.
3. Harness: V16/V17 used bare `return` in `Runtime.evaluate` expressions. Wrapped in IIFEs.
4. Harness: V18's wait returned a DOM element, which `returnByValue` serializes to `{}` — falsy in Python — so a true condition timed out. Coerced with `!!`.
5. Harness: `Emulation.setEmulatedMedia` only lives as long as its DevTools session, and `_cdp_request` opens a fresh WebSocket per command, so the reduced-motion emulation never applied. V12 now launches a dedicated Chrome with `--force-prefers-reduced-motion`.
6. **Product** (caught by V1): a completed jump lands the heading a fraction of a pixel below `--toc-heading-offset`, failing the scroll-spy's strict `rect.top <= offset` threshold — the clicked link never became active. Fixed with a +2px landing epsilon in `updateActiveHeading()`.

Also added: a fonts/Twemoji settle wait before V1 (late image swaps shift heading positions between measurement and landing) and `ignore_cleanup_errors=True` on the temp directory (Chrome profile writes race cleanup). `progress.json` was a builder-session artifact and was not committed.

### Three-way review round (2026-07-09)

Codex reviewer (gpt-5.6-sol), a frontend-races specialist, and a general code reviewer examined the commit independently. The general reviewer found it clean. Confirmed and fixed: unbounded jump restarts under continuous 500ms file changes (restart now skips the re-scroll when already within tolerance), stale landing coordinates when images/fonts load above the target mid-scroll (one bounded re-measure + re-issue on settle), and bottom-clamped final headings never activating in scroll-spy (at max scroll the last heading is current; V19 now asserts the active link). Rejected as standard hash semantics: timeout and mode-interrupt leaving the clicked hash in the URL. Post-fix: phase 7 PASS=21 FAIL=0, phases 1-6 green.

## Context and Orientation

Dabarat is a zero-package Python Markdown previewer. `dabarat/template.py` reads the JavaScript files named in `_JS_MODULES` and concatenates them into one ordinary `<script>`. The files are not ECMAScript modules and cannot use `import` or `export`. Top-level names therefore share one global lexical scope; new navigation names should carry a `_toc` prefix to avoid collisions.

The relevant files are:

- `dabarat/static/js/render.js`: builds the TOC, runs scroll-spy, parses Markdown, replaces `#content`, assigns heading IDs, and invokes annotation and variable rendering.
- `dabarat/static/js/state.js`: declares `_prefersReducedMotion`, tab state, and rendering state before `render.js` is concatenated.
- `dabarat/static/js/tabs.js`: saves and restores per-tab `scrollY`.
- `dabarat/static/js/polling.js`: triggers content and TOC reconstruction following external file changes.
- `dabarat/static/js/home.js`: temporarily replaces the contents of `#toc-scroll`, including `#toc-list`.
- `dabarat/static/js/editor.js` and `dabarat/static/js/diff.js`: hide normal content or pause normal polling while alternate views are active.
- `dabarat/static/css/typography.css`: owns rendered heading typography and is the appropriate location for heading `scroll-margin-top`.
- `dabarat/static/css/base-layout.css`: owns the document scroller, sticky tab bar, TOC, and `#toc-scroll`.
- `dabarat/pdf_export.py`: already contains zero-dependency CDP and WebSocket primitives suitable for browser regression verification.
- `scripts/verify/`: contains the existing numbered verification phases.

A “programmatic jump” means a scroll initiated by TOC JavaScript. A “jump token” is an incrementing number used to ensure that callbacks from an older smooth scroll cannot finish or mutate state after a newer click. A “TOC-owned hash” is a fragment written or accepted by the TOC navigation code together with the tab ID that owned it.

The document scroller is `document.scrollingElement`, which is the `<html>` element. `#toc-scroll` is a separate sidebar scroller. The implementation must never use an API that may scroll both ancestor chains when it intends to move only the sidebar.

## Plan of Work

### Milestone 1: Establish one heading-to-TOC mapping

In `dabarat/static/js/render.js`, change `buildToc(html)` to accept the live heading collection. It must not parse a second detached HTML tree and must not call `slugify()`.

Within `render(md)`, preserve the existing Markdown parse and `#content.innerHTML` replacement. Immediately afterward, collect `h1` through `h4`, assign each ID with the existing `slugify(h.textContent) + '-' + index` rule, and pass the same collection to `buildToc()`. Run `applyEmojiStyle(content)` after this mapping is complete.

`buildToc()` will read `heading.id`, `heading.tagName`, and pre-emoji `heading.textContent`. It will continue creating anchors with both `href` and `data-target`, preserving the existing class names and animation delay.

Bind one delegated listener to the current `#toc-list`. Because home mode destroys and restores that node, keep a module-level reference such as `_tocBoundList`. Bind when the current node differs from the saved reference. Do not use a serialized `data-bound` marker: such a marker would survive `innerHTML` caching while its JavaScript listener would not.

The event handler should locate `event.target.closest('a[data-target]')` and verify that the link belongs to the current list. It should ignore modified clicks and non-primary pointer clicks so native “open in new tab” behavior remains available. For ordinary clicks and keyboard activation, call `preventDefault()` and start explicit navigation.

This milestone succeeds when every TOC `data-target` equals an existing heading ID and repeated re-renders do not accumulate click handlers.

### Milestone 2: Implement explicit jump and hash lifecycle

Add narrowly named helpers and state near the TOC code in `dabarat/static/js/render.js`.

The main entry point should be equivalent to:

```text
navigateToTocHeading(targetId, options)
```

It must resolve the target with `document.getElementById(targetId)` and verify that the element is an `h1`–`h4` descendant of `#content`. If validation fails, it must not alter the hash or scroll position.

Read the scroll offset from a CSS custom property on `#content`, with `80` as a defensive fallback. Calculate:

```text
absolute heading top = current scrollTop + heading.getBoundingClientRect().top
requested top = absolute heading top - configured offset
final top = requested top clamped to 0 through scrollHeight - clientHeight
```

Call `window.scrollTo()` on every activation. Use `behavior: 'auto'` when `_prefersReducedMotion` is true and `behavior: 'smooth'` otherwise. Do not skip the call when the current hash already matches.

Before scrolling, increment a module-level generation counter and record an active jump containing the generation, target ID, and `activeTabId`. A newer click invalidates the old generation and immediately issues its own scroll, making the newest click authoritative.

Monitor completion with `requestAnimationFrame()`. Consider the jump complete when the scroller is within a small tolerance of the clamped destination, including the special case where a heading near the bottom cannot reach the full offset. Include a bounded timeout so sidebar suppression cannot remain stuck if the browser aborts a smooth scroll. Each callback must confirm that its generation, tab ID, target node, document mode, and target connectivity are still valid before doing work.

When the jump finishes, clear only the matching jump record, rerun scroll-spy, and center the final active link inside `#toc-scroll`.

Synchronize the fragment with `history.replaceState(history.state, '', updatedUrl)`. Construct an updated `URL` from `window.location.href` and assign its `hash`; do not concatenate an unescaped fragment manually. Record the owning tab and target ID. Because `replaceState()` does not emit `hashchange`, it will not recursively start another jump.

### Milestone 3: Make scroll-spy cooperate without affecting the window

Refactor `updateActiveHeading()` to read the same CSS offset used by TOC jumps instead of the literal `80`.

Continue computing active headings and toggling `.active` during a programmatic jump. This preserves live scroll-spy behavior and prevents a separate “selected” state from diverging from viewport position.

Remove `activeLink.scrollIntoView()` completely. Introduce a helper that measures the active link relative to `#toc-scroll`, computes a centered sidebar `scrollTop`, clamps it to the sidebar’s scroll range, and calls only:

```text
tocScroll.scrollTo({ top, behavior })
```

Skip this sidebar centering while a programmatic document jump is active. Once the jump completes, center the final link. For ordinary manual window scrolling, center only when the link crosses the existing upper or lower visibility margins. Respect `_prefersReducedMotion` for sidebar motion as well.

This milestone succeeds when monkey-patching `Element.prototype.scrollIntoView` to throw does not affect TOC navigation or scroll-spy.

### Milestone 4: Reconcile initial hashes, tab changes, and re-renders

On the first completed normal-document render, inspect `location.hash`. Decode it defensively and act only if it exactly identifies one of the rendered `#content` headings. Start an explicit jump after all render-time DOM transformations, including variables and annotation highlights, have finished. This handles a hash whose target did not exist when the browser first loaded the HTML shell.

Track the tab associated with the currently rendered document. At the start of a render:

1. If `activeTabId` changed, cancel any jump owned by the previous tab and clear only its TOC-owned hash.
2. Do not interpret the old hash as a deep link for the new tab.
3. Allow `switchTab()`’s existing `requestAnimationFrame()` restoration of `tabs[id].scrollY` to remain authoritative.

For a same-tab polling re-render, preserve the current numeric window position. If a jump is active, retain its target ID across the DOM replacement. After the new headings exist:

- Restart the jump against the newly created target if the same ID still exists.
- Otherwise cancel the jump and clear its TOC-owned hash.
- Never retain a reference to the detached pre-render heading.

After every same-tab render, reconcile the recorded TOC-owned hash. If its heading has disappeared or changed ID, clear the hash with `replaceState()` without moving the window.

The completion monitor must also cancel itself when home, edit, or diff mode becomes active. In those modes, TOC activation should be prevented without changing the hash or attempting to measure hidden `#content` headings. Exiting edit or diff mode forces a normal re-render; that render must rebuild and rebind the TOC exactly once.

Do not modify annotation ordering. Heading mapping occurs before variable and annotation wrappers, and the existing requirement that variable highlighting precede annotation highlighting remains intact.

### Milestone 5: Add the shared CSS offset

In `dabarat/static/css/typography.css`, define a layout-only custom property on `#content`, for example `--toc-heading-offset: 80px`, and apply it to rendered TOC headings:

```text
#content h1,
#content h2,
#content h3,
#content h4
```

Set their `scroll-margin-top` to that property. JavaScript must read this same computed property.

Keep the global `html { scroll-behavior: smooth; }` rule. The existing reduced-motion media query in `dabarat/static/css/responsive.css` already forces `scroll-behavior: auto`; JavaScript must additionally use `_prefersReducedMotion` explicitly.

No theme override is required. If implementation unexpectedly introduces theme-dependent CSS, it must use existing theme variables and place `latte`, `vellum`, `rose-pine-dawn`, and `tokyo-light` selectors together in the same override group.

### Milestone 6: Add browser regression coverage

Create `scripts/verify/phase7_toc_navigation.py`. It should use only Python’s standard library and the existing CDP primitives in `dabarat/pdf_export.py`; do not add Playwright, Selenium, npm packages, or Python dependencies.

The verifier should:

1. Create temporary Markdown documents containing many spaced-out headings, duplicate titles, emoji headings, and enough body content for long smooth jumps.
2. Start dabarat on a free port without opening the interactive browser.
3. Launch headless Chrome with a fixed viewport and remote debugging.
4. Evaluate JavaScript through CDP and report named pass/fail cases.
5. Modify the temporary Markdown file to exercise polling re-renders.
6. Clean up Chrome, the dabarat server, temporary files, and instance-state files in a `finally` block.
7. Print a final `PASS=<n> FAIL=0` line and return nonzero if any assertion fails.

The script may reuse private CDP helpers because it is an in-repository regression harness, but it must not change their production behavior.

## Concrete Steps

All commands run from:

```bash
cd /Users/tomdimino/Desktop/Programming/dabarat
```

First, inspect the working tree and preserve unrelated user changes:

```bash
git status --short
git diff -- dabarat/static/js/render.js dabarat/static/css/typography.css scripts/verify
```

Expected result: existing unrelated changes, including the current untracked `AGENTS.md`, are identified and left untouched.

Implement Milestones 1 through 4 in:

```text
dabarat/static/js/render.js
```

Implement Milestone 5 in:

```text
dabarat/static/css/typography.css
```

Add Milestone 6 at:

```text
scripts/verify/phase7_toc_navigation.py
```

After each JavaScript edit, confirm that no risky window-capable sidebar call remains:

```bash
rg -n "scrollIntoView|buildToc|navigateToToc|_toc|scroll-margin-top" \
  dabarat/static/js/render.js \
  dabarat/static/css/typography.css
```

Expected result: `render.js` contains no `scrollIntoView`; `buildToc` consumes rendered headings; the CSS contains the shared scroll margin.

Confirm that the concatenated HTML still builds:

```bash
python3 - <<'PY'
from dabarat.template import get_html

html = get_html()
assert 'id="toc-list"' in html
assert 'data-target' in html
assert 'navigateToToc' in html
print("template assembly: PASS")
PY
```

Expected output:

```text
template assembly: PASS
```

Run the new browser regression:

```bash
python3 scripts/verify/phase7_toc_navigation.py
```

Expected final output:

```text
PASS=<positive number> FAIL=0
```

Run the existing verification phases:

```bash
for script in scripts/verify/phase{1..6}_*.sh; do
  bash "$script" || exit 1
done
```

Expected result: every phase exits zero and reports `FAIL=0`.

Check formatting and the final patch:

```bash
git diff --check
git diff -- \
  dabarat/static/js/render.js \
  dabarat/static/css/typography.css \
  scripts/verify/phase7_toc_navigation.py
```

Expected result: `git diff --check` produces no output. The diff contains no dependency additions, inline `onclick` attributes, imports, or unrelated changes.

## Validation and Acceptance

The headless verifier and a manual browser pass must cover the following matrix.

| Case | Action | Required result |
|---|---|---|
| V1 | Click a distant TOC heading | The window reaches the clamped heading offset and the link becomes active. |
| V2 | Scroll to the top, leaving the same hash, then click the same link | The window returns to the heading; identical hash state does not suppress the jump. |
| V3 | Pre-set the target hash with `replaceState`, scroll away, then click | The explicit jump still runs. |
| V4 | Click one distant target and immediately click another | The second target wins; stale completion callbacks do nothing. |
| V5 | Load `/?tab=<id>#<heading-id>` | The heading is reached after the asynchronous initial render. |
| V6 | Click a heading in tab A, then switch to tab B containing the same slug | Tab B restores its saved numeric position and the stale tab-A TOC hash is cleared. |
| V7 | Return to tab A | Its saved scroll position is restored; no stale hash jump is replayed. |
| V8 | Trigger a polling re-render while a jump is active and retain the target | The jump resumes against the new heading node and finishes correctly. |
| V9 | Remove the target during a polling re-render | The jump cancels safely, the owned hash clears, and no detached-node exception occurs. |
| V10 | Manually scroll through a long document | Scroll-spy updates `.active` and keeps the active TOC item visible. |
| V11 | Monkey-patch `Element.prototype.scrollIntoView` to throw | TOC navigation and scroll-spy still work, proving sidebar movement is isolated. |
| V12 | Emulate `prefers-reduced-motion: reduce` before page load | Navigation is immediate and no smooth sidebar motion is requested. |
| V13 | Use a duplicate heading title | Each TOC target remains unique because the heading index suffix is retained. |
| V14 | Use an emoji heading under native and Twemoji styles | The displayed TOC label retains the emoji and its target matches the rendered heading ID. |
| V15 | Collapse and restore the TOC with Cmd+backslash | Reopened links still navigate and no duplicate activation occurs. |
| V16 | Enter and leave edit mode | Hidden content is not navigated; the rebuilt TOC works once preview mode returns. |
| V17 | Enter and leave diff mode | Diff scrolling is unaffected; the rebuilt preview TOC works after exit. |
| V18 | Render annotated and variable-highlighted content | Annotation anchors remain present and offsets do not shift because navigation adds no text nodes or wrappers. |
| V19 | Click the final heading when there is insufficient content below it | The window reaches its maximum scroll position; failure to place the heading at exactly 80 pixels is accepted as normal clamping. |
| V20 | Use modified click or middle click on a TOC anchor | Native link behavior remains available because the delegated handler does not intercept it. |

Manual CDP inspection should additionally confirm:

```javascript
document.scrollingElement === document.documentElement
```

and, after a completed non-bottom-clamped jump:

```javascript
Math.abs(
  document.getElementById(location.hash.slice(1)).getBoundingClientRect().top -
  parseFloat(getComputedStyle(document.getElementById('content'))
    .getPropertyValue('--toc-heading-offset'))
) <= 2
```

Acceptance requires all applicable cases to pass in Chromium. If Chrome is unavailable, the browser phase is not considered passed; record it as unverified rather than silently skipping it.

## Idempotence and Recovery

The implementation is idempotent at runtime:

- `buildToc()` may run repeatedly without accumulating TOC entries because it clears the list.
- The binding guard compares the actual `#toc-list` node, so ordinary re-renders do not duplicate listeners and home-screen restoration binds the replacement node exactly once.
- A newer navigation generation invalidates all older callbacks.
- Hash updates use `replaceState()`, so retries do not grow browser history.
- Polling re-renders resolve target IDs against the new DOM instead of retaining detached nodes.

The verification script must use temporary files and unconditional cleanup, making repeated runs safe.

If the implementation causes a regression, revert only the feature’s edits with an inverse patch. Do not use `git reset --hard` or discard unrelated working-tree changes. The functional rollback is to restore native anchors, the old scroll-spy block, and remove the new CSS rule and verification script; however, retain the test failure evidence in the retrospective before rollback.

If smooth-scroll completion proves inconsistent across browsers, keep explicit scrolling and hash synchronization, but change only the completion detector. Do not restore `activeLink.scrollIntoView()`.

## Interfaces and Dependencies

No new runtime dependency is permitted.

The completed implementation should expose only global-scope functions and state compatible with concatenated scripts. Names may vary, but their responsibilities must match these interfaces:

```javascript
function buildToc(headings)
```

Build TOC entries from live headings whose IDs are already assigned.

```javascript
function getTocHeadingOffset()
```

Return the numeric computed value of `--toc-heading-offset`, falling back to `80`.

```javascript
function handleTocClick(event)
```

Delegate activation from the current `#toc-list`, validate the link and mode, prevent ordinary native navigation, and start the explicit jump.

```javascript
function navigateToTocHeading(targetId, options)
```

Validate the rendered target, claim a new jump generation, synchronize the hash when requested, and scroll to the clamped offset.

```javascript
function cancelTocJump(options)
```

Invalidate pending completion work and optionally clear a matching TOC-owned hash.

```javascript
function centerTocLink(link, behavior)
```

Scroll only `#toc-scroll`; it must never call `Element.scrollIntoView()`.

```javascript
function updateActiveHeading()
```

Retain request-animation-frame throttling, use the shared offset, update active classes, and suppress sidebar centering while a document jump is active.

The active jump record must contain at least:

```text
generation
targetId
tabId
```

The TOC hash ownership record must contain at least:

```text
targetId
tabId
```

The implementation may use `requestAnimationFrame`, `window.scrollTo`, `Element.scrollTo`, `history.replaceState`, `URL`, `getComputedStyle`, and existing `_prefersReducedMotion`. It must not introduce imports, frameworks, inline event handlers, or external packages.
