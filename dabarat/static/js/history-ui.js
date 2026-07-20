/* ── Version History Browser ──────────────────────────── */
let gutterMode = 'none'; // 'none' | 'annotations' | 'versions'
let _versionsByRef = {}; // last-fetched versions keyed by ref, for labels/pins

function openVersionPanel() {
  /* Blocked in edit mode: restoring under a live Tiptap surface would leave
     the editor showing pre-restore content that silently wins the next save */
  if (typeof editState !== 'undefined' && editState.active) return;
  /* Check the DOM, not gutterMode — the annotations module manages its
     overlay with its own class and never writes gutterMode */
  const gutter = document.getElementById('annotations-gutter');
  if (gutter && gutter.classList.contains('overlay-open')) closeGutterOverlay();
  gutterMode = 'versions';
  document.getElementById('version-panel').classList.add('open');
  loadVersionHistory();
}

function closeVersionPanel() {
  gutterMode = 'none';
  document.getElementById('version-panel').classList.remove('open');
}

async function loadVersionHistory() {
  const list = document.getElementById('version-timeline');
  if (!list || !activeTabId) return;
  const requestedTab = activeTabId;

  /* Show loading skeleton */
  list.innerHTML = Array.from({length: 3}, () =>
    '<div class="version-entry skeleton"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div></div>'
  ).join('');

  try {
    const res = await fetch('/api/versions?tab=' + requestedTab);
    const data = await res.json();
    /* A tab switch or panel close during the fetch makes this response stale */
    if (requestedTab !== activeTabId || gutterMode !== 'versions') return;
    renderVersionTimeline(data.versions || []);
  } catch (e) {
    if (requestedTab === activeTabId) {
      list.innerHTML = '<div class="version-empty">Could not load history</div>';
    }
  }
}

/* Use shared formatTimeAgoShared from utils.js */
const formatTimeAgo = formatTimeAgoShared;

const _SOURCE_BADGES = { external: 'external', restore: 'restore', import: 'import' };

function renderVersionTimeline(versions) {
  const list = document.getElementById('version-timeline');
  if (!list) return;

  const badge = document.getElementById('version-count-badge');
  if (badge) badge.textContent = versions.length ? ' · ' + versions.length : '';

  if (versions.length === 0) {
    list.innerHTML = '<div class="version-empty"><i class="ph ph-clock-counter-clockwise"></i><p>No version history yet</p><p class="version-empty-hint">Save in edit mode to start tracking</p></div>';
    return;
  }

  _versionsByRef = {};
  versions.forEach(v => { _versionsByRef[v.hash] = v; });

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
      </div>
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

/* Delegated actions — dynamic HTML carries data-* only, never inline handlers */
document.getElementById('version-timeline')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.version-btn');
  const entry = e.target.closest('.version-entry');
  if (!entry || !entry.dataset.hash) return;
  const ref = entry.dataset.hash;
  if (!btn) return;
  e.stopPropagation();
  switch (btn.dataset.action) {
    case 'compare': compareVersion(ref); break;
    case 'restore': restoreVersion(ref); break;
    case 'pin': togglePinVersion(ref); break;
    case 'label': labelVersion(ref); break;
  }
});

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

async function labelVersion(hash) {
  const v = _versionsByRef[hash];
  if (!activeTabId || !v) return;
  const label = prompt('Version name:', v.label || '');
  if (label === null) return;
  try {
    const res = await fetch('/api/version/label', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ tab: activeTabId, hash: hash, label: label.trim() })
    });
    if (!res.ok) throw new Error('server returned ' + res.status);
    loadVersionHistory();
  } catch (e) {
    console.error('Label failed:', e);
    alert('Label failed: ' + e.message);
  }
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
    case 'c':
      compareVersion(focused.dataset.hash);
      break;
    case 'r':
      if (!e.metaKey && !e.ctrlKey) restoreVersion(focused.dataset.hash);
      break;
    case 'p':
      togglePinVersion(focused.dataset.hash);
      break;
  }
});
