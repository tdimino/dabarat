---
title: "feat: Instance monitoring, tab management overhaul, history clarity, home contrast remediation"
type: feat
status: completed
date: 2026-08-19
project: /Users/tomdimino/Desktop/Programming/dabarat
---

# Dabarat: Instances · Tabs · History Clarity · Home Contrast

> On execution start: copy this plan to `docs/plans/2026-08-19-001-feat-instances-tabs-history-contrast-plan.md` (ce-plan convention; plan mode restricted writes to this file).

## Context

Four problems from today's review (screenshot: 92 tabs, "+82" overflow dropdown over a document):

1. **Hidden instances.** 5 live PID files in `~/.dabarat/instances/` right now — three spawned by Finder within 2 seconds on 08-16, one running since 08-04. Instance discovery happens only at CLI launch (`_live_instances()`, `__main__.py:78-135`); the running UI has zero visibility into sibling windows, no way to focus or shut one down.
2. **Tab management collapses at scale.** No close-all/close-others, no middle-click close, no keyboard cycling; the "+82" overflow menu (`tabs.js:402-446`) is a flat, unsearchable filename list.
3. **History is illegible.** The per-file panel header says only "History" — no filename anywhere; rows show only `+N/−N` with no glimpse of content; the floating toggle is one of three identical unlabeled circles. (User believed the button appears only on home — actually inverted: it's document-only, hidden on home where the header "Activity" button serves the global timeline. Root problem is discoverability, not visibility logic.)
4. **Home contrast fails on light themes.** Rosé Pine Dawn worst: badge text 1.95:1, fourteen `--ctp-overlay0` text uses at 2.23–2.32:1, eight `--ctp-overlay1` uses at ~2.9:1 (some on interactive controls). `home.css` has zero `[data-theme]` overrides; the color audit's `USED_PAIRS` covers only 3 home pairs; `shots.py` never screenshots the home page. Plus a real bug: `.home-badge-license` references `--ctp-overlay1-rgb`, defined in no theme.

**Decisions made by Tom (structured questions, this session):**
- Instance monitor: **status-bar indicator + palette command** (not a home section).
- Version rows: **excerpt on expand** (lazy `/api/version/summary`).
- Home contrast: **everything readable** — all informational text and interactive controls pass 4.5:1; whisper waiver survives only for hover-revealed ghost controls (remove/refresh icons).
- Guardrails: **confirm before Close All**, **restore-session prompt >20 tabs**, **Ctrl+Tab cycling**. No stale-tab auto-suggest.

Prior art: `~/.claude/plans/2026-08-04-dabarat-home-redesign-history-surfacing-color-audit.md` (shipped in 6d72329..c526122); this is the corrective/extension pass.

---

## Workstream 1 — Instance Monitoring

**Files**: new `dabarat/instances.py`; `dabarat/server.py`, `dabarat/__main__.py`, `dabarat/template.py`, `static/js/tabs.js`, `static/palette.js`, `static/css/base-layout.css`

### 1a. Shared discovery module — `dabarat/instances.py` (new, ~100 lines)
Extract from `__main__.py`: `_ensure_instance_dir` (:64), `_pid_alive` (:68-75), `_server_running` (:416-424), `_live_instances` (:78-135), `_get_open_filepaths` (:458-467), `_INSTANCE_DIR` constant. `__main__.py` imports from here; lifecycle functions (`_register_instance`, `_save/_load/_clear_tab_state`) stay in `__main__.py`.

Public API: `discover_instances(self_port) -> [{port, pid, started, tabs: [{filename, filepath}], isSelf}]`. Serial 1s probes (max 5 instances); self skips the HTTP probe — caller substitutes its in-memory tab list.

### 1b. Endpoints — `server.py`
- **`GET /api/instances`** → `{instances: [...], maxInstances}`. Self tabs read from `self._tabs` under `_tabs_lock` (never self-probe over HTTP). Wire `PreviewHandler._max_instances` from `cmd_serve()`.
- **`POST /api/shutdown`** → `{ok: true}`, then `threading.Thread(target=cls._server_ref.shutdown, daemon=True).start()` after the response flushes (~200ms defer). `PreviewHandler._server_ref` set by `cmd_serve()`. Also run the existing atexit cleanup path (PID file + tabs.json) — verify `server.shutdown()` unwinds through it.
- **`POST /api/instances/shutdown`** body `{port}` — **proxy**: the client only ever talks to its own server; this handler makes a server-to-server urllib POST to the sibling's `/api/shutdown`, setting header `Origin: http://127.0.0.1:<sibling_port>` (urllib may set Origin freely; passes the sibling's strict `_check_origin` at server.py:255-270). **No CSRF relaxation and no CORS anywhere** — this corrects the naive design of a browser cross-port fetch, which would fail both Origin and preflight.

### 1c. Client UI
- `template.py`: add `port` to `get_html()` signature; inject into `DABARAT_CONFIG`.
- `tabs.js` (+~80 lines): `#instance-indicator` in the status bar (bottom-left near `#status-filepath`) showing `:PORT`, with a count badge when siblings exist. Click → dropdown (reuse `.tab-context-menu` pattern, delegated `data-*` handlers): each instance row shows port + started-ago + tab filenames, actions **Focus** (`window.open('http://127.0.0.1:'+port)`) and **Shut Down** (confirm dialog → `POST /api/instances/shutdown`).
- Fetch cadence: on init once, on dropdown open, and a 30s interval only while `homeScreenActive` — never on the 2s poll.
- `palette.js`: "Instances" command opening the dropdown.
- Deferred (out of scope): adopt-tabs migration between instances.

---

## Workstream 2 — Tab Management Overhaul

**Files**: `dabarat/server.py`, `dabarat/__main__.py`, `static/js/tabs.js`, `static/palette.js`, `static/css/base-layout.css`

### 2a. Bulk close endpoint — `POST /api/close-bulk`
Body `{mode: "all"|"others"|"ids", keep: [], ids: []}` → `{ok, closed}`. Hold `_tabs_lock` **once** for the whole batch; fire `_notify_tabs_changed()` **once** (one `tabs.json` write, not 92). Place beside `/api/close` (server.py:858).

### 2b. Client bulk close — `tabs.js`
`closeAllTabs({keep, skipConfirm})` and `closeOtherTabs(keepId)`: confirm when closing >1 tab; exit edit/diff mode first; single POST; batch-delete client state (`tabs`, `annotationsCache`, `lastAnnotationMtimes`, `tagsCache`); **no per-tab Motion animation** — one `renderTabBar()` at the end; fall back to `showHomeScreen()` when empty (existing `closeTab` pattern, tabs.js:303-345).

### 2c. Context menu + palette + shortcuts
- `showTabContextMenu` (tabs.js:356-399): add separator support + **Close Others** (hidden when ≤1 tab) + **Close All**.
- `palette.js` `_refreshCommands` (:1067-1103): add "Close Other Tabs", "Close All Tabs".
- Middle-click close: `auxclick` (button 1) handler per tab in `renderTabBar`.
- **Ctrl+Tab / Ctrl+Shift+Tab** cycling through `Object.keys(tabs)`; if Chrome app-mode swallows Ctrl+Tab, fall back to Cmd+Opt+←/→ (test during implementation, keep whichever works).

### 2d. Overflow menu upgrade — rewrite `showTabOverflowMenu` (tabs.js:402-446)
Header with total count ("92 tabs"), **filter input** (autofocused; matches filename + filepath), per-row **close ×** (delegated `data-action`, re-renders list in place), ghost-tab dimming (`.ghost`), active-tab highlight. Stays a dropdown — Cmd+K palette already covers fuzzy-switching; no separate switcher panel.

### 2e. Restore-session prompt — `__main__.py`
In `cmd_serve()` where `_load_tab_state(port)` recovers a crashed session: if >20 tabs, AppleScript confirm "Restore N tabs from previous session?" (Restore / Start Fresh). Start Fresh discards the state file.

---

## Workstream 3 — Version-History Clarity

**Files**: `dabarat/history.py`, `dabarat/server.py`, `dabarat/template.py`, `static/js/history-ui.js`, `static/css/history-ui.css`, `static/css/base-layout.css`

### 3a. Panel identity
- `template.py` (:229-231): panel header becomes mode label + filename slot:
  `#version-panel-title` ("History"/"Activity", keeps 8px uppercase style) + new `#version-panel-filename` (12px DM Sans, ellipsized, `--ctp-text`) + existing count badge.
- `history-ui.js` `openVersionPanel` (:89-90) and `renderVersionTimeline` (:165): file mode sets filename from `tabs[activeTabId].filename` (re-set after fetch in case of tab switch); global mode clears it. Mode icons: `ph-clock-counter-clockwise` (file) vs `ph-pulse` (Activity) so the two panels read differently.
- Global rows (:268): keep basename prominent, add a dimmed parent-directory suffix (path already in hover title).

### 3b. Change excerpt on expand
- `history.py`: new `version_change_summary(filepath, ref)` — locate version + predecessor by `created_at_us` for the file_id, decompress both blobs, `difflib.unified_diff`, return first hunk's changed lines (≤2 lines) + context. First version diffs against empty.
- `server.py`: `GET /api/version/summary?tab=&hash=` near the other version endpoints (:612-697).
- `history-ui.js`: caret expander per row (delegated); click fetches once, caches in `_versionsByRef`, reveals `.version-excerpt` (Victor Mono 10px, `+`/`−` lines colored via existing `--stat-add`/`--stat-del` role tokens).
- Stretch (P2, only if cheap): word-level highlight inside change blocks in the Compare view (`diff.py compute_side_by_side` + `diff.js renderDiffPanel`).

### 3c. Floating-button labels
All three right-edge circles (annotations/edit/history, template.py:223-225) get `.float-btn-label` spans — collapsed to 0-width, expand-on-hover into a pill (`max-width`/`opacity`/`margin` transition; border-radius 50% → 17px on hover). Labels: **Notes / Edit / History**. Shared CSS in `base-layout.css`, respecting the existing halo-glow hover pattern.

---

## Workstream 4 — Home Contrast Remediation ("everything readable")

**Files**: `static/css/theme-variables.css`, `static/css/home.css`, `scripts/color-audit/audit.py`, `scripts/color-audit/shots.py`, `CLAUDE.md`

### 4a. Bug fix first
Add `--ctp-overlay1-rgb` companions to all 8 theme blocks in `theme-variables.css` (`.home-badge-license` background currently silently broken).

### 4b. Role tokens (`:root` defaults alias accents; light themes override with concrete hexes)
| Token | Default | Consumers |
|---|---|---|
| `--home-meta` | `var(--ctp-overlay0)` | paths, timestamps, day seps, stats, empty states, kicker, ws sidebar meta — must pass 4.5:1 |
| `--home-control` | `var(--ctp-overlay1)` | Browse Files, ws action buttons, version counter, section names/titles — 4.5:1 |
| `--badge-prompt-fg` / `--badge-status-fg` / `--badge-plan-fg` / `--badge-changelog-fg` / `--badge-license-fg` | respective accents | badge text on 0.18-alpha wash over `--card-bg` — 4.5:1 composited |
| `--home-icon` | `var(--ctp-green)` | card file icon — 3:1 |

Per-badge tokens (not one shared) so each hue walks its own lightness path. Values come from `solve.py` (hue held, lightness walked) for **all four light themes** in four separate `[data-theme]` blocks (values differ per theme — grouped selector not applicable; convention satisfied by all four being present). Dark themes expected to pass on defaults — verify via audit.

### 4c. home.css migration
Swap all 22 raw overlay text colors to role tokens per the decided split:
- **Must pass** (→ `--home-meta`/`--home-control`): lines 39, 45, 199, 207, 213, 221, 229, 388, 399, 429, 444, 485, 598, 624, 641, 737, 787, 822, 837, 958, 984, 999, 1042 — including card date/updated (Tom chose full readability).
- **Waived ghosts** (stay overlay, hover-revealed only): `.home-card-remove` (:131), `.ws-section-remove` (:847), `.ws-entry-remove`, `.home-quote-refresh`.
- Badges (:259-271) → `--badge-*-fg`; `.home-card-icon` (:175) → `--home-icon`; `.ws-entry` hover bumped to clear 4.5:1 on `--interactive-hover-bg`.

### 4d. Audit + screenshot coverage
- `audit.py` `USED_PAIRS`: add home-meta/-control on base+card, five badge composited-wash pairs, home-icon, and re-tier the old waived "card meta" row to P1 (waiver now covers only ghost controls). Re-run: **exit 0 required**.
- `shots.py`: second pass — launch a file-less instance with seeded `recent.json` (fixture files with badge-triggering names: `alpha.prompt.md`, `CHANGELOG.md`, plus tags/versions metadata) → `shots/home-<theme>.png` for all 8 themes.
- `CLAUDE.md`: rewrite the whisper-tier bullet — waiver narrowed to hover-revealed ghost controls on home; document-view whisper items (figcaptions, footnote backrefs, list markers) unchanged.
- Sweep (P2, same pass if quick): the 31 latte-only `[data-theme]` blocks missing the other light themes that audit already flags — at minimum fix any affecting home/history/diff surfaces.

---

## Build Sequence

1. **W4a** overlay1-rgb bug fix (zero risk) → **W4b–d** contrast remediation + audit gate (self-contained, visible immediately)
2. **W2a–b** bulk-close endpoint + client → **W2c–e** menus, shortcuts, overflow rewrite, restore prompt
3. **W1a–c** instances module → endpoints (incl. proxy) → status-bar UI
4. **W3a** panel identity → **W3b** excerpts → **W3c** button labels
5. Docs: `agent_docs/api-reference.md` (4 new endpoints), CLAUDE.md conventions (whisper waiver, instance endpoints)

Each workstream is independently landable; commit per milestone. **Reinstall after every batch**: `pip install .` (non-editable install trap — served content ≠ disk otherwise).

## Verification

- **New** `scripts/verify/phase12_instances_tabs.py` (CDP pattern from phase7/11): /api/instances shape + isSelf tab parity; close-bulk all/others semantics; tabs.json written once per bulk close (mtime probe); shutdown returns 200 then port stops accepting within 2s; proxy shutdown of a spawned second instance works and cleans its PID file; overflow filter + per-row close via CDP; Ctrl+Tab cycling.
- **New** `scripts/verify/phase13_history_clarity.py`: panel header shows filename in file mode / "Activity" global; `/api/version/summary` returns first-change lines for v2-vs-v1 fixture; excerpt expand renders.
- **Color gate**: `python3 scripts/color-audit/audit.py` exits 0 with the extended USED_PAIRS; `shots.py` produces home-page matrix for 8 themes; eyeball Rosé Pine Dawn + Vellum home shots.
- **Regression**: phase7–11 verify scripts still pass; manual: 92-tab instance → Close All confirms once, lands on home, sibling instances visible in status bar.

## Edge Cases (deliverable per coding workflow)

- Bulk close while a kept tab is in edit mode with unsaved changes (exit-edit ordering); bulk close racing the 2s tab poll (client deletes state synchronously first).
- `/api/instances` when a sibling dies mid-probe (1s timeout, row dropped, stale PID cleaned by existing logic).
- Shutdown of an instance whose window still has a dirty editor (server can't know dirty state — confirm dialog wording covers it).
- `version_change_summary` for the first version (empty predecessor), identical-content versions (`restore` source), huge files (cap diff scan).
- Ctrl+Tab swallowed by Chrome app mode → fallback binding.
- Restore prompt when AppleScript unavailable (SSH/headless) → restore silently, log.

## Sources

- Origin: user review of 2026-08-19 (screenshot: 92-tab overflow) + structured decisions this session (instance placement, excerpt-on-expand, full readability, 3 guardrails)
- Exploration reports (this session): instance lifecycle/tabs (server+client), version-history UI/store, home theming/audit tooling — file:line anchors inline above
- Prior plan: `~/.claude/plans/2026-08-04-dabarat-home-redesign-history-surfacing-color-audit.md` (shipped 6d72329..c526122)
- Conventions: dabarat `CLAUDE.md` — thread-safety (locked tab helpers), event delegation, Motion One guards, color-role tokens, light-theme override rule, whisper tier (to be amended)
