/* ── Tab Bar ──────────────────────────────────────────── */
const TAB_MIN_WIDTH = 80;
const TAB_MAX_WIDTH = 160;
let _prevTabWidth = 0;
let _lastTabIds = new Set();
let _visibleTabStart = 0;

function _getTabBarVisibleWidth() {
  const mainArea = document.getElementById('main-area');
  return mainArea ? mainArea.clientWidth : document.getElementById('tab-bar').clientWidth;
}

/* ── Visible Window Algorithm ──────────────────────────── */
/* Computes which tabs fit in the available space.
   Only these tabs are rendered; the rest go to the overflow dropdown.
   The active tab is always guaranteed to be in the visible window. */
function _computeVisibleWindow() {
  const allIds = Object.keys(tabs);
  const totalTabs = allIds.length;
  if (totalTabs === 0) { _visibleTabStart = 0; return { visibleIds: [], hiddenIds: [], tabWidth: 0 }; }

  /* Clamp stale _visibleTabStart before any calculations */
  _visibleTabStart = Math.max(0, Math.min(_visibleTabStart, totalTabs - 1));

  const bar = document.getElementById('tab-bar');
  if (!bar) return { visibleIds: allIds, hiddenIds: [], tabWidth: TAB_MAX_WIDTH };

  const barWidth = _getTabBarVisibleWidth();

  /* Measure fixed-width children already in the DOM (home, add buttons).
     We need to account for the overflow button too if there will be hidden tabs,
     but we don't know yet — so we do a two-pass approach. */
  let fixedWidth = 0;
  for (const child of bar.children) {
    if (!child.classList.contains('tab') && child.id !== 'tab-overflow') {
      fixedWidth += child.offsetWidth;
    }
  }

  /* First pass: can all tabs fit without an overflow button? */
  let availableWidth = barWidth - fixedWidth;
  let maxVisible = Math.max(1, Math.floor(availableWidth / TAB_MIN_WIDTH));

  if (totalTabs <= maxVisible) {
    /* All fit — no overflow button needed */
    const tabWidth = Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, Math.floor(availableWidth / totalTabs)));
    return { visibleIds: allIds, hiddenIds: [], tabWidth };
  }

  /* Second pass: account for overflow button width.
     Briefly make it visible to measure accurately, then re-hide. */
  const overflowBtn = document.getElementById('tab-overflow');
  let overflowWidth = 34;
  if (overflowBtn) {
    overflowBtn.style.visibility = 'hidden';
    overflowBtn.style.display = 'flex';
    overflowBtn.textContent = '+' + (totalTabs - maxVisible);
    overflowWidth = overflowBtn.offsetWidth || 34;
    overflowBtn.style.display = 'none';
    overflowBtn.style.visibility = '';
  }
  availableWidth = barWidth - fixedWidth - overflowWidth;
  maxVisible = Math.max(1, Math.floor(availableWidth / TAB_MIN_WIDTH));
  maxVisible = Math.min(maxVisible, totalTabs);

  /* Guarantee the active tab is in the visible window */
  const activeIndex = allIds.indexOf(activeTabId);
  if (activeIndex >= 0) {
    if (activeIndex < _visibleTabStart) {
      _visibleTabStart = activeIndex;
    } else if (activeIndex >= _visibleTabStart + maxVisible) {
      _visibleTabStart = activeIndex - maxVisible + 1;
    }
  }
  /* Clamp to valid range */
  _visibleTabStart = Math.max(0, Math.min(_visibleTabStart, totalTabs - maxVisible));

  const visibleIds = allIds.slice(_visibleTabStart, _visibleTabStart + maxVisible);
  const hiddenIds = allIds.filter(id => !visibleIds.includes(id));
  const tabWidth = Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, Math.floor(availableWidth / visibleIds.length)));

  return { visibleIds, hiddenIds, tabWidth };
}

function renderTabBar() {
  const bar = document.getElementById('tab-bar');
  bar.innerHTML = '';

  /* Home button */
  const homeBtn = document.createElement('button');
  homeBtn.id = 'tab-home';
  homeBtn.title = 'Home';
  homeBtn.innerHTML = '<i class="ph ph-house-simple"></i>';
  homeBtn.className = homeScreenActive ? 'active' : '';
  homeBtn.onclick = () => {
    if (homeScreenActive) return;
    showHomeScreen();
    renderTabBar();
  };
  bar.appendChild(homeBtn);

  /* + button (created early so it's in the DOM for width measurement) */
  const addBtn = document.createElement('button');
  addBtn.id = 'tab-add';
  addBtn.title = 'Open file';
  addBtn.innerHTML = '<i class="ph ph-plus"></i>';
  addBtn.onclick = showAddFileInput;
  bar.appendChild(addBtn);

  /* Overflow button (created early for width measurement, hidden initially) */
  const overflowBtn = document.createElement('button');
  overflowBtn.id = 'tab-overflow';
  overflowBtn.title = 'All tabs';
  overflowBtn.style.display = 'none';
  overflowBtn.onclick = (e) => {
    e.stopPropagation();
    showTabOverflowMenu(overflowBtn);
  };
  bar.appendChild(overflowBtn);

  /* Compute visible window (needs fixed children in DOM for measurement) */
  const { visibleIds, hiddenIds, tabWidth } = _computeVisibleWindow();

  /* Render only visible tabs — insert before the + button */
  visibleIds.forEach(id => {
    const tab = tabs[id];
    const div = document.createElement('div');
    div.className = 'tab' + (id === activeTabId ? ' active' : '');
    div.dataset.tab = id;
    div.title = tab.filepath;

    const nameSpan = document.createElement('span');
    nameSpan.textContent = tab.filename;
    div.appendChild(nameSpan);

    const close = document.createElement('span');
    close.className = 'tab-close';
    close.innerHTML = '&times;';
    close.onclick = (e) => { e.stopPropagation(); closeTab(id); };
    div.appendChild(close);

    div.onclick = () => switchTab(id);
    div.oncontextmenu = (e) => {
      e.preventDefault();
      showTabContextMenu(e.clientX, e.clientY, id);
    };
    bar.insertBefore(div, addBtn);
  });

  /* Update overflow button */
  if (hiddenIds.length > 0) {
    overflowBtn.style.display = 'flex';
    overflowBtn.textContent = '+' + hiddenIds.length;
  } else {
    overflowBtn.style.display = 'none';
  }

  /* Set tab widths */
  const tabEls = Array.from(bar.querySelectorAll('.tab'));
  const shouldAnimate = _prevTabWidth > 0 && _prevTabWidth !== tabWidth
    && window.Motion && !_prefersReducedMotion
    && document.readyState === 'complete';

  tabEls.forEach(el => {
    if (shouldAnimate) {
      el.style.width = _prevTabWidth + 'px';
      Motion.animate(el,
        { width: tabWidth + 'px' },
        { duration: 0.2, easing: 'ease-out' }
      );
    } else {
      el.style.width = tabWidth + 'px';
    }
  });
  _prevTabWidth = tabWidth;

  /* Animate newly added tabs */
  if (window.Motion && !_prefersReducedMotion) {
    const currentIds = new Set(visibleIds);
    visibleIds.forEach(id => {
      if (!_lastTabIds.has(id)) {
        const el = bar.querySelector('.tab[data-tab="' + id + '"]');
        if (el) {
          Motion.animate(el,
            { opacity: [0, 1], x: [-12, 0] },
            { duration: 0.2, easing: 'ease-out' }
          );
        }
      }
    });
    _lastTabIds = currentIds;
  } else {
    _lastTabIds = new Set(visibleIds);
  }
}

/* Recalc on container resize (catches window resize, TOC collapse, gutter toggle) */
if (typeof ResizeObserver !== 'undefined') {
  let _resizeRecalcPending = false;
  const _mainArea = document.getElementById('main-area');
  if (_mainArea) {
    new ResizeObserver(() => {
      if (!_resizeRecalcPending) {
        _resizeRecalcPending = true;
        requestAnimationFrame(() => {
          _resizeRecalcPending = false;
          renderTabBar();
        });
      }
    }).observe(_mainArea);
  }
} else {
  window.addEventListener('resize', renderTabBar);
}

function switchTab(id) {
  if (!tabs[id]) return;
  if (id === activeTabId && !homeScreenActive) return;

  /* Leave home screen if active */
  if (homeScreenActive) {
    hideHomeScreen();
    renderTabBar();
  }

  /* Exit edit mode if active */
  if (editState.active) {
    if (editState.dirty && !confirm('Discard unsaved changes?')) return;
    exitEditMode(true);
  }

  /* Exit diff mode if active */
  if (diffState.active) exitDiffMode();

  /* Cancel pending annotation */
  document.getElementById('annotation-form').style.display = 'none';
  document.getElementById('annotate-carousel').classList.remove('visible');
  annotateSelection = null;

  /* Reset variable panel state */
  fillInMode = false;
  fillInValues = {};

  /* Save scroll position */
  if (activeTabId && tabs[activeTabId]) {
    tabs[activeTabId].scrollY = window.scrollY;
  }

  activeTabId = id;
  lastRenderedMd = '';  /* Force re-render for new tab */
  lastRenderedAnnotationsKey = '';
  localStorage.setItem('dabarat-active-tab', id);

  renderTabBar();

  /* Restore per-tab frontmatter (prevents stale indicator bar from other tabs) */
  currentFrontmatter = tabs[id].frontmatter || null;

  if (tabs[id].content) {
    render(tabs[id].content);
  } else {
    /* Content not yet loaded — fetch immediately */
    fetchTabContent(id);
  }

  /* Fetch tags for this tab */
  fetchTags(id).then(() => renderTagPills());

  /* Restore scroll position */
  requestAnimationFrame(() => {
    window.scrollTo(0, tabs[id].scrollY || 0);
  });

  /* Update status bar and window title */
  document.getElementById('status-filepath').textContent = tabs[id].filepath;
  document.title = tabs[id].filename + ' — dabarat';
}

/* Fetch content for a single tab and render if active */
async function fetchTabContent(id) {
  try {
    const res = await fetch('/api/content?tab=' + id);
    const data = await res.json();
    if (data.error || !tabs[id]) return;
    tabs[id].content = data.content;
    tabs[id].mtime = data.mtime;
    tabs[id].frontmatter = data.frontmatter || null;
    if (id === activeTabId) {
      currentFrontmatter = tabs[id].frontmatter;
      render(data.content);
    }
  } catch (e) { /* ignore */ }
}

async function closeTab(id) {
  /* Exit edit mode if active on this tab */
  if (editState.active && editState.tabId === id) exitEditMode(true);

  /* Exit diff mode if the left tab is being closed */
  if (diffState.active && diffState.leftTabId === id) exitDiffMode();

  /* Animate tab collapse before removing (only if tab is visible in DOM) */
  const tabEl = document.querySelector('.tab[data-tab="' + id + '"]');
  if (tabEl && window.Motion && !_prefersReducedMotion) {
    tabEl.dataset.closing = '1';
    await Motion.animate(tabEl,
      { opacity: 0, width: '0px', paddingLeft: '0px', paddingRight: '0px' },
      { duration: 0.15, easing: 'ease-out' }
    ).finished.catch(() => {});
  }

  try {
    await fetch('/api/close', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id: id})
    });
  } catch(e) {}

  delete tabs[id];
  delete annotationsCache[id];
  delete lastAnnotationMtimes[id];
  delete tagsCache[id];

  if (id === activeTabId) {
    activeTabId = Object.keys(tabs)[0] || null;
    lastRenderedMd = '';
    if (activeTabId && tabs[activeTabId].content) {
      render(tabs[activeTabId].content);
      document.getElementById('status-filepath').textContent = tabs[activeTabId].filepath;
    } else if (!activeTabId) {
      showHomeScreen();
    }
  }
  renderTabBar();
}

/* ── Tab Context Menu ─────────────────────────────────── */
function dismissTabContextMenu() {
  const existing = document.querySelector('.tab-context-menu');
  if (existing) {
    if (existing._dismissCtrl) existing._dismissCtrl.abort();
    existing.remove();
  }
}

function showTabContextMenu(x, y, tabId) {
  dismissTabContextMenu();
  const menu = document.createElement('div');
  menu.className = 'tab-context-menu';
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  const items = [
    { label: 'Rename', icon: 'ph-pencil-simple', action: () => startTabRename(tabId) },
    { label: 'Copy Path', icon: 'ph-copy', action: () => {
      navigator.clipboard.writeText(tabs[tabId].filepath);
    }},
    { label: 'Close', icon: 'ph-x', action: () => closeTab(tabId) },
  ];

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'tab-context-item';
    row.innerHTML = '<i class="ph ' + item.icon + '"></i>' + item.label;
    row.onclick = () => { dismissTabContextMenu(); item.action(); };
    menu.appendChild(row);
  });

  document.body.appendChild(menu);

  /* Keep menu on screen */
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  });

  /* Dismiss on click-outside or Escape — use AbortController to prevent leaks */
  const ctrl = new AbortController();
  menu._dismissCtrl = ctrl;
  setTimeout(() => {
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) { dismissTabContextMenu(); ctrl.abort(); }
    }, { signal: ctrl.signal });
  }, 0);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { dismissTabContextMenu(); ctrl.abort(); }
  }, { signal: ctrl.signal });
}

/* ── Tab Overflow Dropdown ────────────────────────────── */
function showTabOverflowMenu(anchor) {
  dismissTabContextMenu();
  const menu = document.createElement('div');
  menu.className = 'tab-context-menu tab-overflow-menu';

  const rect = anchor.getBoundingClientRect();
  menu.style.right = (window.innerWidth - rect.right) + 'px';
  menu.style.top = rect.bottom + 'px';
  menu.style.left = 'auto';

  /* Show ALL tabs — active one highlighted */
  const allIds = Object.keys(tabs);
  allIds.forEach(id => {
    const row = document.createElement('div');
    row.className = 'tab-context-item' + (id === activeTabId ? ' active' : '');
    row.innerHTML = '<i class="ph ph-file-text"></i>' +
      '<span style="overflow:hidden;text-overflow:ellipsis">' +
      tabs[id].filename + '</span>';
    row.title = tabs[id].filepath;
    row.onclick = () => { dismissTabContextMenu(); switchTab(id); };
    menu.appendChild(row);
  });

  document.body.appendChild(menu);

  /* Keep on screen */
  requestAnimationFrame(() => {
    const mr = menu.getBoundingClientRect();
    if (mr.bottom > window.innerHeight)
      menu.style.top = (window.innerHeight - mr.height - 8) + 'px';
    if (mr.left < 0) { menu.style.left = '8px'; menu.style.right = 'auto'; }
  });

  /* Dismiss — reuse AbortController pattern */
  const ctrl = new AbortController();
  menu._dismissCtrl = ctrl;
  setTimeout(() => {
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) { dismissTabContextMenu(); ctrl.abort(); }
    }, { signal: ctrl.signal });
  }, 0);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { dismissTabContextMenu(); ctrl.abort(); }
  }, { signal: ctrl.signal });
}

function startTabRename(tabId) {
  const tabDiv = document.querySelector('.tab[data-tab="' + tabId + '"]');
  if (!tabDiv) return;
  const nameSpan = tabDiv.querySelector('span');
  if (!nameSpan) return;

  const oldName = tabs[tabId].filename;
  const input = document.createElement('input');
  input.className = 'tab-rename-input';
  input.value = oldName;
  input.type = 'text';

  nameSpan.replaceWith(input);
  input.focus();
  /* Select just the name part, not the .md extension */
  const dotIdx = oldName.lastIndexOf('.');
  if (dotIdx > 0) {
    input.setSelectionRange(0, dotIdx);
  } else {
    input.select();
  }

  const commit = async () => {
    let newName = input.value.trim();
    /* Strip .md if present — server auto-appends it */
    if (newName.endsWith('.md')) newName = newName.slice(0, -3);
    if (!newName || newName + '.md' === oldName) {
      renderTabBar();
      return;
    }
    try {
      const res = await fetch('/api/rename', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ tab: tabId, name: newName })
      });
      const data = await res.json();
      if (data.ok) {
        tabs[tabId].filename = data.filename;
        tabs[tabId].filepath = data.filepath;
        if (tabId === activeTabId) {
          document.getElementById('status-filepath').textContent = data.filepath;
        }
      } else {
        console.error('Rename failed:', data.error);
      }
    } catch(e) {
      console.error('Rename failed:', e);
    }
    renderTabBar();
  };

  input.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { renderTabBar(); }
  };
  input.onblur = () => setTimeout(commit, 100);
}

function showAddFileInput() {
  const bar = document.getElementById('tab-bar');
  const addBtn = document.getElementById('tab-add');
  const overflowBtn = document.getElementById('tab-overflow');
  addBtn.style.display = 'none';
  if (overflowBtn) overflowBtn.style.display = 'none';

  const input = document.createElement('input');
  input.className = 'tab-add-input';
  input.type = 'text';
  input.placeholder = 'path/to/file.md';

  input.onkeydown = async (e) => {
    if (e.key === 'Enter') {
      const path = input.value.trim();
      if (path) {
        try {
          const res = await fetch('/api/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({filepath: path})
          });
          const data = await res.json();
          if (data.error) {
            input.style.borderColor = 'var(--ctp-red)';
            input.title = data.error;
            e.preventDefault();
            return;
          }
          if (data.id && !tabs[data.id]) {
            tabs[data.id] = {
              filepath: data.filepath || path,
              filename: data.filename,
              content: '', mtime: 0, scrollY: 0
            };
            /* Fetch content immediately */
            fetchTabContent(data.id);
          }
          /* Track in recent files for command palette */
          if (typeof CommandPalette !== 'undefined' && data.filepath) {
            CommandPalette.saveRecent(data.filepath, data.filename);
          }
          if (homeScreenActive) hideHomeScreen();
          if (data.id) switchTab(data.id);
          renderTabBar();
        } catch(err) {
          console.error('Failed to add file:', err);
        }
      }
      input.remove();
      const b1 = bar.querySelector('.tab-browse-btn');
      if (b1) b1.remove();
      addBtn.style.display = '';
      renderTabBar();
    } else if (e.key === 'Escape') {
      input.remove();
      const b2 = bar.querySelector('.tab-browse-btn');
      if (b2) b2.remove();
      addBtn.style.display = '';
      renderTabBar();
    }
  };

  input.onblur = () => {
    setTimeout(() => {
      if (bar.contains(input)) {
        input.remove();
        const browse = bar.querySelector('.tab-browse-btn');
        if (browse) browse.remove();
        addBtn.style.display = '';
        renderTabBar();
      }
    }, 150);
  };

  const browseBtn = document.createElement('button');
  browseBtn.className = 'tab-browse-btn';
  browseBtn.title = 'Browse files';
  browseBtn.innerHTML = '<i class="ph ph-folder-open"></i>';
  browseBtn.onmousedown = (e) => e.preventDefault(); /* prevent input blur */
  browseBtn.onclick = async (e) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/browse', { method: 'POST' });
      const data = await res.json();
      if (data.filepath) {
        input.value = data.filepath;
        input.onkeydown({ key: 'Enter', preventDefault: () => {} });
      }
    } catch(err) { console.error('Browse failed:', err); }
  };

  bar.insertBefore(input, addBtn);
  bar.insertBefore(browseBtn, addBtn);
  input.focus();
}

/* ── Cross-file Link Interception ─────────────────────── */
document.addEventListener('click', (e) => {
  const a = e.target.closest('#content a');
  if (!a) return;
  const href = a.getAttribute('href');
  if (!href) return;

  if (href.endsWith('.md') && !href.startsWith('http')) {
    e.preventDefault();
    openFileAsTab(href);
  }
});

async function openFileAsTab(path) {
  try {
    const res = await fetch('/api/add', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({filepath: path})
    });
    const data = await res.json();
    if (data.error) { console.error(data.error); return; }
    if (data.id && !tabs[data.id]) {
      tabs[data.id] = {
        filepath: data.filepath || path,
        filename: data.filename,
        content: '', mtime: 0, scrollY: 0
      };
    }
    if (data.id) {
      renderTabBar();
      switchTab(data.id);
    }
  } catch(e) {
    console.error('Failed to open file:', e);
  }
}
