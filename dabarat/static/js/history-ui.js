/* ── Version History Browser ──────────────────────────── */
let gutterMode = 'none'; // 'none' | 'annotations' | 'versions'
let versionPanelMode = 'file'; // 'file' (active tab) | 'global' (cross-file activity)
let _versionsByRef = {}; // last-fetched versions keyed by ref, for labels/pins

/* ── Seen-state — which snapshots the user has actually looked at ──
   localStorage maps filepath → last-seen head version ref, or the
   '__unseen__' sentinel when polling caught an external change live.
   Shared across windows; missing entry means "never opened history". */
const historySeen = {
  _read() {
    try { return JSON.parse(localStorage.getItem('dabarat-history-seen')) || {}; }
    catch (_) { return {}; }
  },
  _write(map) {
    try { localStorage.setItem('dabarat-history-seen', JSON.stringify(map)); } catch (_) {}
  },
  markUnseen(filepath) {
    if (!filepath) return;
    const map = this._read();
    if (map[filepath] !== '__unseen__') {
      map[filepath] = '__unseen__';
      this._write(map);
    }
    _updateHistoryDot();
  },
  markSeen(filepath, headRef) {
    if (!filepath) return;
    const map = this._read();
    map[filepath] = headRef ? String(headRef) : '';
    this._write(map);
    _updateHistoryDot();
  },
  /* Unseen when live-flagged, or when the known head moved past the last-seen
     ref (headRef comes from card metadata; pass null to check the flag only) */
  isUnseenFor(filepath, headRef) {
    const seen = this._read()[filepath];
    if (seen === undefined) return false;
    if (seen === '__unseen__') return true;
    return headRef ? seen !== String(headRef) : false;
  }
};

function _updateHistoryDot() {
  const btn = document.getElementById('history-toggle');
  if (!btn) return;
  const path = typeof activeTabId !== 'undefined' && activeTabId && tabs[activeTabId]
    ? tabs[activeTabId].filepath : null;
  btn.classList.toggle('has-unseen', !!(path && historySeen.isUnseenFor(path, null)));
}

/* One halo pulse on the toggle, optionally with a transient version chip */
function pulseHistoryToggle(label) {
  const btn = document.getElementById('history-toggle');
  /* offsetParent is always null for the fixed-position toggle — use
     checkVisibility, which sees the display:none from home/edit/diff modes */
  if (!btn) return;
  if (btn.checkVisibility ? !btn.checkVisibility()
    : getComputedStyle(btn).display === 'none') return;
  if (label) {
    const chip = document.createElement('span');
    chip.className = 'history-chip';
    chip.textContent = label;
    btn.appendChild(chip);
    setTimeout(() => chip.classList.add('out'), 1800);
    setTimeout(() => chip.remove(), 2150);
  }
  btn.classList.remove('pulse');
  void btn.offsetWidth; /* restart the animation on rapid successive saves */
  btn.classList.add('pulse');
  setTimeout(() => btn.classList.remove('pulse'), 650);
  if (window.Motion && !_prefersReducedMotion) {
    Motion.animate(btn, { scale: [1, 1.18, 1] }, { duration: 0.45, easing: 'ease-out' });
  }
}

function openVersionPanel(opts) {
  /* Blocked in edit mode: restoring under a live Tiptap surface would leave
     the editor showing pre-restore content that silently wins the next save */
  if (typeof editState !== 'undefined' && editState.active) return;
  /* Home has no active document — the panel becomes the global activity feed */
  versionPanelMode = (opts && opts.mode) ||
    (typeof homeScreenActive !== 'undefined' && homeScreenActive ? 'global' : 'file');
  /* Check the DOM, not gutterMode — the annotations module manages its
     overlay with its own class and never writes gutterMode */
  const gutter = document.getElementById('annotations-gutter');
  if (gutter && gutter.classList.contains('overlay-open')) closeGutterOverlay();
  gutterMode = 'versions';
  const title = document.getElementById('version-panel-title');
  if (title) title.textContent = versionPanelMode === 'global' ? 'Activity' : 'History';
  const icon = document.getElementById('version-panel-icon');
  if (icon) icon.className = versionPanelMode === 'global'
    ? 'ph ph-pulse' : 'ph ph-clock-counter-clockwise';
  _setVersionPanelFilename();
  document.getElementById('version-panel').classList.add('open');
  document.body.classList.add('version-panel-open');
  loadVersionHistory();
}

/* Which document is this timeline about? File mode names the active tab;
   global mode reads "All files". Re-set after fetches too — a tab switch
   during the request must not leave a stale name in the header. */
function _setVersionPanelFilename() {
  const el = document.getElementById('version-panel-filename');
  if (!el) return;
  if (versionPanelMode === 'file' && typeof activeTabId !== 'undefined'
      && activeTabId && tabs[activeTabId]) {
    el.textContent = tabs[activeTabId].filename;
    el.title = tabs[activeTabId].filepath;
  } else {
    el.textContent = versionPanelMode === 'global' ? 'All files' : '';
    el.title = '';
  }
}

function closeVersionPanel() {
  gutterMode = 'none';
  document.getElementById('version-panel').classList.remove('open');
  document.body.classList.remove('version-panel-open');
}

function _timelineSkeleton(list) {
  list.innerHTML = Array.from({length: 3}, () =>
    '<div class="version-entry skeleton"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div></div>'
  ).join('');
}

async function loadVersionHistory() {
  if (versionPanelMode === 'global') return loadGlobalActivity();
  const list = document.getElementById('version-timeline');
  if (!list || !activeTabId) return;
  const requestedTab = activeTabId;

  _timelineSkeleton(list);

  try {
    const res = await fetch('/api/versions?tab=' + requestedTab);
    const data = await res.json();
    /* A tab switch, mode flip, or panel close during the fetch makes this stale */
    if (requestedTab !== activeTabId || gutterMode !== 'versions' || versionPanelMode !== 'file') return;
    /* A server-side failure (locked/corrupt versions.db) must not masquerade
       as a pristine empty timeline */
    if (data.error && !(data.versions || []).length) {
      list.innerHTML = '<div class="version-empty">Could not load history<span class="version-empty-hint">' + escapeHtml(data.error) + '</span></div>';
      return;
    }
    renderVersionTimeline(data.versions || []);
  } catch (e) {
    if (requestedTab === activeTabId) {
      list.innerHTML = '<div class="version-empty">Could not load history</div>';
    }
  }
}

let _globalActivityGen = 0;

async function loadGlobalActivity() {
  const list = document.getElementById('version-timeline');
  if (!list) return;
  /* Mode flags alone can't spot a close-and-reopen — a slow first response
     would repaint over a fresher second one, so tag each request */
  const gen = ++_globalActivityGen;

  _timelineSkeleton(list);

  try {
    const res = await fetch('/api/versions/recent');
    const data = await res.json();
    if (gen !== _globalActivityGen) return;
    if (gutterMode !== 'versions' || versionPanelMode !== 'global') return;
    if (data.error && !(data.versions || []).length) {
      list.innerHTML = '<div class="version-empty">Could not load activity<span class="version-empty-hint">' + escapeHtml(data.error) + '</span></div>';
      return;
    }
    renderGlobalTimeline(data.versions || []);
  } catch (e) {
    if (gen !== _globalActivityGen) return;
    list.innerHTML = '<div class="version-empty">Could not load activity</div>';
  }
}

/* Use shared formatTimeAgoShared from utils.js */
const formatTimeAgo = formatTimeAgoShared;

const _SOURCE_BADGES = { external: 'external', restore: 'restore', import: 'import' };

function renderVersionTimeline(versions) {
  const list = document.getElementById('version-timeline');
  if (!list) return;

  _setVersionPanelFilename();
  const badge = document.getElementById('version-count-badge');
  if (badge) badge.textContent = versions.length ? ' · ' + versions.length : '';

  if (versions.length === 0) {
    list.innerHTML = '<div class="version-empty"><i class="ph ph-clock-counter-clockwise"></i><p>No version history yet</p><p class="version-empty-hint">Save in edit mode to start tracking</p></div>';
    return;
  }

  _versionsByRef = {};
  versions.forEach(v => { _versionsByRef[v.hash] = v; });

  /* Viewing the timeline is what "seen" means */
  if (activeTabId && tabs[activeTabId]) {
    historySeen.markSeen(tabs[activeTabId].filepath, versions.length ? versions[0].hash : null);
  }

  let lastDay = '';
  const parts = [];
  versions.forEach((v, i) => {
    const isCurrent = i === 0;
    const day = new Date(v.date).toLocaleDateString(undefined,
      { month: 'short', day: 'numeric', year: 'numeric' });
    if (day !== lastDay) {
      parts.push(`<div class="version-day-sep">${day}</div>`);
      lastDay = day;
    }
    const srcBadge = _SOURCE_BADGES[v.source]
      ? `<span class="version-source-badge version-source-${v.source}">${_SOURCE_BADGES[v.source]}</span>`
      : '';
    const labelHtml = v.label
      ? `<div class="version-label"><i class="ph ph-tag"></i> ${escapeHtml(v.label)}</div>`
      : '';
    parts.push(`<div class="version-entry${isCurrent ? ' current' : ''}${v.pinned ? ' pinned' : ''}" tabindex="0" data-hash="${v.hash}">
      <div class="version-date">${isCurrent ? 'Latest' : formatTimeAgo(v.date)}${srcBadge}${v.pinned ? '<i class="ph-fill ph-push-pin version-pin-mark"></i>' : ''}</div>
      ${labelHtml}
      <div class="version-stats">
        <span class="version-stat-add">+${v.added}</span>
        <span class="version-stat-del">-${v.removed}</span>
        <button class="version-excerpt-toggle" data-action="excerpt" title="What changed" aria-expanded="false"><i class="ph ph-caret-down"></i></button>
      </div>
      <div class="version-excerpt" hidden></div>
      <div class="version-actions">
        <button class="version-btn" data-action="compare" title="Compare with current">
          <i class="ph ph-git-diff"></i> Compare
        </button>
        ${!isCurrent ? `<button class="version-btn version-btn-restore" data-action="restore" title="Restore this version">
          <i class="ph ph-arrow-counter-clockwise"></i> Restore
        </button>` : ''}
        <button class="version-btn version-btn-icon" data-action="pin" title="${v.pinned ? 'Unpin' : 'Pin (never pruned)'}">
          <i class="ph${v.pinned ? '-fill' : ''} ph-push-pin"></i>
        </button>
        <button class="version-btn version-btn-icon" data-action="label" title="Name this version">
          <i class="ph ph-tag"></i>
        </button>
      </div>
    </div>`);
  });
  list.innerHTML = parts.join('');

  /* Stagger-animate version entries */
  if (window.Motion && !_prefersReducedMotion) {
    const entries = list.querySelectorAll('.version-entry');
    if (entries.length) {
      Motion.animate(entries,
        { opacity: [0, 1], x: [8, 0] },
        { delay: Motion.stagger(0.03), duration: 0.2 }
      );
    }
  }
}

/* Global cross-file activity — same day-sep timeline, navigational entries */
function renderGlobalTimeline(versions) {
  const list = document.getElementById('version-timeline');
  if (!list) return;

  _setVersionPanelFilename();
  const badge = document.getElementById('version-count-badge');
  if (badge) badge.textContent = versions.length ? ' · ' + versions.length : '';

  if (versions.length === 0) {
    list.innerHTML = '<div class="version-empty"><i class="ph ph-clock-counter-clockwise"></i><p>No activity yet</p><p class="version-empty-hint">Saves and external edits will appear here</p></div>';
    return;
  }

  let lastDay = '';
  const parts = [];
  versions.forEach(v => {
    const day = new Date(v.date).toLocaleDateString(undefined,
      { month: 'short', day: 'numeric', year: 'numeric' });
    if (day !== lastDay) {
      parts.push(`<div class="version-day-sep">${day}</div>`);
      lastDay = day;
    }
    const srcBadge = _SOURCE_BADGES[v.source]
      ? `<span class="version-source-badge version-source-${v.source}">${_SOURCE_BADGES[v.source]}</span>`
      : '';
    const labelHtml = v.label
      ? `<div class="version-label"><i class="ph ph-tag"></i> ${escapeHtml(v.label)}</div>`
      : '';
    const parentDir = (v.path || '').split('/').slice(-2, -1)[0] || '';
    parts.push(`<div class="version-entry global" tabindex="0" data-hash="${v.hash}" data-path="${escapeHtml(v.path)}" title="${escapeHtml(v.path)}">
      <div class="version-date">${formatTimeAgo(v.date)}${srcBadge}${v.pinned ? '<i class="ph-fill ph-push-pin version-pin-mark"></i>' : ''}</div>
      <div class="version-file"><i class="ph ph-file-md"></i> ${escapeHtml(v.name)}${parentDir ? `<span class="version-file-dir">· ${escapeHtml(parentDir)}/</span>` : ''}</div>
      ${labelHtml}
      <div class="version-stats">
        <span class="version-stat-add">+${v.added}</span>
        <span class="version-stat-del">-${v.removed}</span>
      </div>
    </div>`);
  });
  list.innerHTML = parts.join('');

  if (window.Motion && !_prefersReducedMotion) {
    const entries = list.querySelectorAll('.version-entry');
    if (entries.length) {
      Motion.animate(entries,
        { opacity: [0, 1], x: [8, 0] },
        { delay: Motion.stagger(0.03), duration: 0.2 }
      );
    }
  }
}

/* Delegated actions — dynamic HTML carries data-* only, never inline handlers */
document.getElementById('version-timeline')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.version-btn, .version-excerpt-toggle');
  const entry = e.target.closest('.version-entry');
  if (!entry || !entry.dataset.hash) return;
  const ref = entry.dataset.hash;
  if (!btn) {
    /* Global entries navigate: open the file with its own timeline showing */
    if (versionPanelMode === 'global' && entry.dataset.path) {
      openRecentFile(entry.dataset.path, { openHistory: true });
    }
    return;
  }
  e.stopPropagation();
  switch (btn.dataset.action) {
    case 'compare': compareVersion(ref); break;
    case 'restore': restoreVersion(ref); break;
    case 'pin': togglePinVersion(ref); break;
    case 'label': labelVersion(ref); break;
    case 'excerpt': toggleVersionExcerpt(ref, entry); break;
  }
});

/* Lazy first-change excerpt — fetched once per version, cached on the
   version object in _versionsByRef */
async function toggleVersionExcerpt(ref, entry) {
  const box = entry.querySelector('.version-excerpt');
  const toggle = entry.querySelector('.version-excerpt-toggle');
  const caret = toggle && toggle.querySelector('i');
  if (!box) return;
  if (!box.hidden) {
    box.hidden = true;
    if (caret) caret.className = 'ph ph-caret-down';
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    return;
  }
  const v = _versionsByRef[ref];
  if (!v || v._excerpt === 'loading') return;
  let ex = v._excerpt;
  if (ex === undefined) {
    v._excerpt = 'loading';  /* blocks a concurrent double-fetch */
    box.innerHTML = '<span class="version-excerpt-none">Loading…</span>';
    box.hidden = false;
    try {
      const res = await fetch('/api/version/summary?tab=' + activeTabId +
        '&hash=' + encodeURIComponent(ref));
      const data = await res.json();
      ex = data.error ? null
        : { lines: data.lines || [], truncated: !!data.truncated };
    } catch (e) { ex = null; }
    /* Cache only successes — a transient failure must stay retryable */
    if (ex) v._excerpt = ex;
    else delete v._excerpt;
    /* The timeline may have re-rendered mid-fetch; this row is detached
       and the fresh one carries its own state */
    if (!entry.isConnected) return;
  }
  if (!ex) {
    box.innerHTML = '<span class="version-excerpt-none">Could not load changes — click to retry</span>';
  } else if (!ex.lines.length) {
    box.innerHTML = '<span class="version-excerpt-none">Identical content (no line changes)</span>';
  } else {
    box.innerHTML = ex.lines.map(l => {
      const cls = l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : 'ctx';
      /* title carries the full line — the box scrolls horizontally, but a
         hover/read of the whole change shouldn't require dragging */
      return '<div class="version-excerpt-line ' + cls + '" title="' +
        escapeHtml(l) + '">' + escapeHtml(l) + '</div>';
    }).join('') + (ex.truncated ? '<div class="version-excerpt-line more">⋯</div>' : '');
  }
  box.hidden = false;
  if (caret) caret.className = 'ph ph-caret-up';
  if (toggle) toggle.setAttribute('aria-expanded', 'true');
}

function _versionDisplayLabel(ref) {
  const v = _versionsByRef[ref];
  if (!v) return 'Version ' + ref;
  return v.label || new Date(v.date).toLocaleString(undefined,
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function compareVersion(hash) {
  if (!activeTabId || !tabs[activeTabId]) return;
  closeVersionPanel();
  if (typeof enterVersionDiffMode === 'function') {
    enterVersionDiffMode(hash, _versionDisplayLabel(hash));
  }
}

async function restoreVersion(hash) {
  const tabId = activeTabId;
  if (!tabId || !tabs[tabId]) return;
  /* Never restore over an open editor or an in-flight save */
  if (typeof editState !== 'undefined' && editState.active) {
    alert('Close edit mode before restoring a version.');
    return;
  }
  if (typeof _saveInFlight !== 'undefined' && _saveInFlight) {
    alert('A save is in progress — try again in a moment.');
    return;
  }
  if (!confirm('Restore this version? Your current content will be saved first.')) return;
  try {
    const res = await fetch('/api/restore', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ tab: tabId, hash: hash })
    });
    const data = await res.json();
    if (!data.ok) {
      alert('Restore failed: ' + (data.error || 'unknown error'));
      return;
    }
    if (data.ok && tabs[tabId]) {
      tabs[tabId].content = data.content;
      tabs[tabId].mtime = data.mtime;
      tabs[tabId].changeKey = data.changeKey;
      if (tabId === activeTabId) {
        lastRenderedMd = '';
        /* Full refetch applies the body/frontmatter split and renders
           (same pattern as edit/diff exit) */
        await fetchTabContent(tabId);
      }
      closeVersionPanel();
    }
  } catch (e) {
    console.error('Restore failed:', e);
    alert('Restore failed: ' + e.message);
  }
}

async function togglePinVersion(hash) {
  const v = _versionsByRef[hash];
  if (!activeTabId || !v) return;
  try {
    const res = await fetch('/api/version/pin', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ tab: activeTabId, hash: hash, pinned: !v.pinned })
    });
    if (!res.ok) throw new Error('server returned ' + res.status);
    loadVersionHistory();
  } catch (e) {
    console.error('Pin failed:', e);
    alert('Pin failed: ' + e.message);
  }
}

function labelVersion(hash) {
  const v = _versionsByRef[hash];
  if (!activeTabId || !v) return;
  const entry = document.querySelector(`.version-entry[data-hash="${hash}"]`);
  if (!entry || entry.querySelector('.version-label-input')) return;

  /* Inline edit row in place of the native prompt() dialog */
  const row = document.createElement('div');
  row.className = 'version-label-edit';
  row.innerHTML = '<i class="ph ph-tag"></i><input class="version-label-input" type="text" maxlength="120" placeholder="Name this version">';
  const input = row.querySelector('input');
  input.value = v.label || '';
  entry.insertBefore(row, entry.querySelector('.version-actions'));
  input.focus();
  input.select();

  let done = false;
  const commit = async (save) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    row.remove();
    if (!save || value === (v.label || '')) return;
    try {
      const res = await fetch('/api/version/label', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ tab: activeTabId, hash: hash, label: value })
      });
      if (!res.ok) throw new Error('server returned ' + res.status);
      loadVersionHistory();
    } catch (e) {
      console.error('Label failed:', e);
      alert('Label failed: ' + e.message);
    }
  };
  input.addEventListener('keydown', (e) => {
    /* Typing must not trigger panel shortcuts, and Escape here cancels
       the edit — not the panel */
    e.stopPropagation();
    if (e.key === 'Enter') commit(true);
    else if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
  input.addEventListener('click', (e) => e.stopPropagation());
}

/* ── Keyboard ────────────────────────────────────────── */

/* Cmd+Shift+H toggles the panel (mirrors Cmd+Shift+E for edit mode) */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault();
    gutterMode === 'versions' ? closeVersionPanel() : openVersionPanel();
  }
});

document.addEventListener('keydown', (e) => {
  if (gutterMode !== 'versions') return;

  if (e.key === 'Escape') {
    closeVersionPanel();
    e.preventDefault();
    return;
  }

  const focused = document.activeElement;
  if (!focused || !focused.classList.contains('version-entry')) return;

  switch (e.key) {
    case 'ArrowUp': {
      e.preventDefault();
      let prev = focused.previousElementSibling;
      while (prev && !prev.classList.contains('version-entry')) prev = prev.previousElementSibling;
      if (prev) prev.focus();
      break;
    }
    case 'ArrowDown': {
      e.preventDefault();
      let next = focused.nextElementSibling;
      while (next && !next.classList.contains('version-entry')) next = next.nextElementSibling;
      if (next) next.focus();
      break;
    }
    case 'Enter':
      if (versionPanelMode === 'global') {
        if (focused.dataset.path) openRecentFile(focused.dataset.path, { openHistory: true });
      } else {
        compareVersion(focused.dataset.hash);
      }
      break;
    /* Compare/restore/pin act on the active tab — file mode only */
    case 'c':
      if (versionPanelMode === 'file') compareVersion(focused.dataset.hash);
      break;
    case 'r':
      if (versionPanelMode === 'file' && !e.metaKey && !e.ctrlKey) restoreVersion(focused.dataset.hash);
      break;
    case 'p':
      if (versionPanelMode === 'file') togglePinVersion(focused.dataset.hash);
      break;
  }
});
