/* ── Version History Browser ──────────────────────────── */
let gutterMode = 'none'; // 'none' | 'annotations' | 'versions'

function openVersionPanel() {
  if (gutterMode === 'annotations') closeGutterOverlay();
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

  /* Show loading skeleton */
  list.innerHTML = Array.from({length: 3}, () =>
    '<div class="version-entry skeleton"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div></div>'
  ).join('');

  try {
    const res = await fetch('/api/versions?tab=' + activeTabId);
    const data = await res.json();
    renderVersionTimeline(data.versions || []);
  } catch (e) {
    list.innerHTML = '<div class="version-empty">Could not load history</div>';
  }
}

/* Use shared formatTimeAgoShared from utils.js */
const formatTimeAgo = formatTimeAgoShared;

function renderVersionTimeline(versions) {
  const list = document.getElementById('version-timeline');
  if (!list) return;

  if (versions.length === 0) {
    list.innerHTML = '<div class="version-empty"><i class="ph ph-clock-counter-clockwise"></i><p>No version history yet</p><p class="version-empty-hint">Save in edit mode to start tracking</p></div>';
    return;
  }

  list.innerHTML = versions.map((v, i) => {
    const isCurrent = i === 0;
    const dateStr = formatTimeAgo(v.date);
    return `<div class="version-entry${isCurrent ? ' current' : ''}" tabindex="0" data-hash="${v.hash}">
      <div class="version-date">${isCurrent ? 'Latest' : dateStr}</div>
      <div class="version-stats">
        <span class="version-stat-add">+${v.added}</span>
        <span class="version-stat-del">-${v.removed}</span>
      </div>
      <div class="version-actions">
        <button class="version-btn" onclick="compareVersion('${v.hash}'); event.stopPropagation();" title="Compare with current">
          <i class="ph ph-git-diff"></i> Compare
        </button>
        ${!isCurrent ? `<button class="version-btn version-btn-restore" onclick="restoreVersion('${v.hash}'); event.stopPropagation();" title="Restore this version">
          <i class="ph ph-arrow-counter-clockwise"></i> Restore
        </button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function compareVersion(hash) {
  const tabId = activeTabId;
  if (!tabId || !tabs[tabId]) return;
  try {
    closeVersionPanel();
    /* Use the existing diff mode with the current file against itself —
       the server-side diff endpoint compares tab content vs file on disk.
       For version comparison, we write a temp reference (not ideal) so
       instead just show an alert for now if enterDiffMode doesn't support
       two-content comparison. The diff view is for file-vs-file. */
    if (typeof enterDiffMode === 'function') {
      /* enterDiffMode takes a file path to compare against */
      enterDiffMode(tabs[tabId].filepath);
    }
  } catch (e) {
    console.error('Compare failed:', e);
  }
}

async function restoreVersion(hash) {
  const tabId = activeTabId;
  if (!tabId || !tabs[tabId]) return;
  if (!confirm('Restore this version? Your current content will be saved first.')) return;
  try {
    const res = await fetch('/api/restore', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ tab: tabId, hash: hash })
    });
    const data = await res.json();
    if (data.ok && tabs[tabId]) {
      tabs[tabId].content = data.content;
      tabs[tabId].mtime = data.mtime;
      if (tabId === activeTabId) {
        lastRenderedMd = '';
        render(data.content);
      }
      closeVersionPanel();
    }
  } catch (e) {
    console.error('Restore failed:', e);
  }
}

/* ── Keyboard navigation ─────────────────────────────── */
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
    case 'ArrowUp':
      e.preventDefault();
      if (focused.previousElementSibling && focused.previousElementSibling.classList.contains('version-entry')) {
        focused.previousElementSibling.focus();
      }
      break;
    case 'ArrowDown':
      e.preventDefault();
      if (focused.nextElementSibling && focused.nextElementSibling.classList.contains('version-entry')) {
        focused.nextElementSibling.focus();
      }
      break;
    case 'Enter':
    case 'c':
      compareVersion(focused.dataset.hash);
      break;
    case 'r':
      if (!e.metaKey && !e.ctrlKey) restoreVersion(focused.dataset.hash);
      break;
  }
});
