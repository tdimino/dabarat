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
  overflowBtn.setAttribute('aria-haspopup', 'menu');
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
    div.className = 'tab' + (id === activeTabId ? ' active' : '') + (tab._missing ? ' ghost' : '');
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
    /* Middle-click closes (auxclick fires after the button is released) */
    div.onauxclick = (e) => {
      if (e.button === 1) { e.preventDefault(); closeTab(id); }
    };
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

  /* Close version panel — its timeline and refs belong to the previous tab */
  if (typeof gutterMode !== 'undefined' && gutterMode === 'versions') closeVersionPanel();

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
    render(tabBody(tabs[id]));
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

  /* Ghost state follows the active tab */
  if (tabs[id]._missing) _showFileMissingBanner(); else _hideFileMissingBanner();
}

/* Fetch content for a single tab and render if active */
async function fetchTabContent(id) {
  try {
    const res = await fetch('/api/content?tab=' + id);
    const data = await res.json();
    if (data.error || !tabs[id]) return;
    tabs[id].content = data.content;
    tabs[id].body = data.body;
    tabs[id].mtime = data.mtime;
    tabs[id].changeKey = data.changeKey;
    tabs[id].frontmatter = data.frontmatter || null;
    if (id === activeTabId) {
      currentFrontmatter = tabs[id].frontmatter;
      render(tabBody(tabs[id]));
    }
  } catch (e) { /* ignore */ }
}

/* Tab ids being closed right now. A poll /api/tabs fetch already in
   flight when the local delete happens would otherwise resurrect the
   rows from its stale response (polling.js checks this set). Ids are
   held for one extra poll cycle; a reopened file gets a fresh uuid, so
   a held id can never block a legitimate tab. */
const _closePending = new Set();

function _releaseClosePending(ids) {
  setTimeout(() => ids.forEach(id => _closePending.delete(id)), 2500);
}

async function closeTab(id) {
  /* Exit edit mode if active on this tab */
  if (editState.active && editState.tabId === id) exitEditMode(true);
  _closePending.add(id);

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
  _releaseClosePending([id]);

  if (id === activeTabId) {
    activeTabId = Object.keys(tabs)[0] || null;
    lastRenderedMd = '';
    if (activeTabId && tabs[activeTabId].content) {
      currentFrontmatter = tabs[activeTabId].frontmatter || null;
      render(tabBody(tabs[activeTabId]));
      document.getElementById('status-filepath').textContent = tabs[activeTabId].filepath;
    } else if (!activeTabId) {
      showHomeScreen();
    }
  }
  renderTabBar();
}

/* ── Bulk close ───────────────────────────────────────── */
/* One confirm, one POST, one render — no per-tab animation. Client state
   is deleted synchronously BEFORE the fetch so the 2s poll cannot
   resurrect rows between the request and the response. */
async function _closeBulk(mode, keepIds) {
  const keep = new Set(keepIds || []);
  const doomed = Object.keys(tabs).filter(id => !keep.has(id));
  if (!doomed.length) return;
  if (doomed.length > 1 && !confirm('Close ' + doomed.length + ' tabs?')) return;

  /* Exit modes that reference a closing tab before its state is deleted */
  if (editState.active && doomed.includes(editState.tabId)) exitEditMode(true);
  if (diffState.active && doomed.includes(diffState.leftTabId)) exitDiffMode();
  if (typeof gutterMode !== 'undefined' && gutterMode === 'versions') closeVersionPanel();

  /* Snapshot so a failed request can put the state back — otherwise the
     client deletes locally, the server keeps the tabs, and the next poll
     silently resurrects them, which reads as "nothing happened". */
  const snapshot = {};
  doomed.forEach(id => {
    snapshot[id] = tabs[id];
    _closePending.add(id);
    delete tabs[id];
    delete annotationsCache[id];
    delete lastAnnotationMtimes[id];
    delete tagsCache[id];
  });

  let failure = null;
  try {
    const res = await fetch('/api/close-bulk', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mode: mode, keep: Array.from(keep)})
    });
    if (!res.ok) failure = 'HTTP ' + res.status;
  } catch(e) { failure = 'network error'; }
  _releaseClosePending(doomed);

  if (failure) {
    doomed.forEach(id => { tabs[id] = snapshot[id]; });
    renderTabBar();
    _showServerActionFailedBanner(
      'Could not close tabs (' + failure + '). ' +
      (failure === 'HTTP 404'
        ? 'This dabarat server predates the feature — restart it to pick up the new code.'
        : 'Check that the dabarat server is still running.'));
    return;
  }

  if (!activeTabId || !tabs[activeTabId]) {
    activeTabId = Object.keys(tabs)[0] || null;
    lastRenderedMd = '';
    if (activeTabId) {
      const t = tabs[activeTabId];
      currentFrontmatter = t.frontmatter || null;
      if (t.content) {
        render(tabBody(t));
        document.getElementById('status-filepath').textContent = t.filepath;
      } else {
        fetchTabContent(activeTabId);
      }
    } else if (!homeScreenActive) {
      showHomeScreen();
    }
  }
  renderTabBar();
}

function closeAllTabs() { return _closeBulk('all', []); }
function closeOtherTabs(keepId) {
  return _closeBulk('others', [keepId || activeTabId].filter(Boolean));
}

/* ── Keyboard tab cycling ─────────────────────────────── */
/* Ctrl+Tab / Ctrl+Shift+Tab, with Cmd+Opt+←/→ as the fallback binding
   (Chrome app mode swallows Ctrl+Tab in some configurations).
   cycleTab is also a palette command — the shortcut's discoverable home. */
function cycleTab(dir) {
  const ids = Object.keys(tabs);
  if (ids.length < 2) return;
  const idx = ids.indexOf(activeTabId);
  switchTab(ids[((idx < 0 ? 0 : idx) + dir + ids.length) % ids.length]);
}

document.addEventListener('keydown', (e) => {
  /* Never cycle away from an in-progress text entry (rename input,
     overflow filter, version label, Tiptap surface) */
  if (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) return;
  let dir = 0;
  if (e.ctrlKey && !e.metaKey && e.key === 'Tab') {
    dir = e.shiftKey ? -1 : 1;
  } else if (e.metaKey && e.altKey &&
             (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    dir = e.key === 'ArrowRight' ? 1 : -1;
  }
  if (!dir) return;
  e.preventDefault();
  cycleTab(dir);
});

/* ── Tab Context Menu ─────────────────────────────────── */
/* Shared keyboard model for the .tab-context-menu family — rows carry
   role="menuitem" tabindex="-1"; ArrowUp/Down move focus (wrapping),
   Enter activates the focused row. Bound on the menu so the overflow
   filter keeps its own Enter handler while its ArrowDown falls through
   to the first row. */
function _menuKeyNav(menu, itemSelector) {
  menu.setAttribute('role', 'menu');
  menu.addEventListener('keydown', (e) => {
    const rows = [...menu.querySelectorAll(itemSelector)];
    if (!rows.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = rows.indexOf(document.activeElement);
      const next = idx < 0
        ? (e.key === 'ArrowDown' ? rows[0] : rows[rows.length - 1])
        : rows[(idx + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
      next.focus();
    } else if (e.key === 'Enter' && rows.includes(document.activeElement)) {
      e.preventDefault();
      document.activeElement.click();
    }
  });
}

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

  const multi = Object.keys(tabs).length > 1;
  const items = [
    { label: 'Rename', icon: 'ph-pencil-simple', action: () => startTabRename(tabId) },
    { label: 'Copy Path', icon: 'ph-copy', action: () => {
      navigator.clipboard.writeText(tabs[tabId].filepath);
    }},
    { sep: true },
    { label: 'Close', icon: 'ph-x', action: () => closeTab(tabId) },
    ...(multi ? [{ label: 'Close Others', icon: 'ph-broom',
                   action: () => closeOtherTabs(tabId) }] : []),
    { label: 'Close All', icon: 'ph-x-square', action: () => closeAllTabs() },
  ];

  items.forEach(item => {
    if (item.sep) {
      const hr = document.createElement('div');
      hr.className = 'tab-context-sep';
      menu.appendChild(hr);
      return;
    }
    const row = document.createElement('div');
    row.className = 'tab-context-item';
    row.setAttribute('role', 'menuitem');
    row.tabIndex = -1;
    row.innerHTML = '<i class="ph ' + item.icon + '"></i>' + item.label;
    row.onclick = () => { dismissTabContextMenu(); item.action(); };
    menu.appendChild(row);
  });
  _menuKeyNav(menu, '.tab-context-item');

  document.body.appendChild(menu);
  const first = menu.querySelector('.tab-context-item');
  if (first) first.focus();

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
/* Count header + Close All, filter input (filename + filepath match),
   per-row close ×, ghost dimming, active highlight. All actions via
   delegated data-* handlers on the menu — no inline onclick in rows. */
function showTabOverflowMenu(anchor) {
  dismissTabContextMenu();
  const menu = document.createElement('div');
  menu.className = 'tab-context-menu tab-overflow-menu';

  const rect = anchor.getBoundingClientRect();
  menu.style.right = (window.innerWidth - rect.right) + 'px';
  menu.style.top = rect.bottom + 'px';
  menu.style.left = 'auto';

  const header = document.createElement('div');
  header.className = 'tab-overflow-header';
  header.innerHTML =
    '<span class="tab-overflow-count"></span>' +
    '<button class="tab-overflow-close-all" data-action="close-all">Close All</button>';
  menu.appendChild(header);

  const filter = document.createElement('input');
  filter.className = 'tab-overflow-filter';
  filter.type = 'text';
  filter.placeholder = 'Filter tabs…';
  filter.setAttribute('aria-label', 'Filter tabs');
  menu.appendChild(filter);

  const list = document.createElement('div');
  list.className = 'tab-overflow-list';
  menu.appendChild(list);

  const renderList = () => {
    const allIds = Object.keys(tabs);
    const q = filter.value.trim().toLowerCase();
    const shown = allIds.filter(id =>
      !q || tabs[id].filename.toLowerCase().includes(q)
         || tabs[id].filepath.toLowerCase().includes(q));
    list.innerHTML = shown.map(id => {
      const t = tabs[id];
      return '<div class="tab-context-item' +
        (id === activeTabId ? ' active' : '') +
        (t._missing ? ' ghost' : '') +
        '" role="menuitem" tabindex="-1"' +
        ' data-tab="' + id + '" title="' + escapeHtml(t.filepath) + '">' +
        '<i class="ph ph-file-text"></i>' +
        '<span class="tab-overflow-name">' + escapeHtml(t.filename) + '</span>' +
        '<button class="tab-overflow-close" data-action="close" ' +
        'title="Close" aria-label="Close ' + escapeHtml(t.filename) +
        '">&times;</button></div>';
    }).join('') || '<div class="tab-overflow-empty">No matching tabs</div>';
    header.querySelector('.tab-overflow-count').textContent =
      allIds.length + (allIds.length === 1 ? ' tab' : ' tabs');
  };
  renderList();
  _menuKeyNav(menu, '.tab-context-item[data-tab]');
  filter.addEventListener('input', renderList);
  filter.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = list.querySelector('.tab-context-item[data-tab]');
      if (first) { dismissTabContextMenu(); switchTab(first.dataset.tab); }
    }
  });

  menu.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="close-all"]')) {
      dismissTabContextMenu();
      closeAllTabs();
      return;
    }
    const row = e.target.closest('.tab-context-item[data-tab]');
    if (!row) return;
    const id = row.dataset.tab;
    if (e.target.closest('[data-action="close"]')) {
      await closeTab(id);
      if (!Object.keys(tabs).length) { dismissTabContextMenu(); return; }
      renderList();
    } else {
      dismissTabContextMenu();
      switchTab(id);
    }
  });

  document.body.appendChild(menu);
  filter.focus();

  /* Keep on screen — all four edges (an anchor wider than the viewport
     yields a negative right offset, pushing the menu past the right edge) */
  requestAnimationFrame(() => {
    const mr = menu.getBoundingClientRect();
    if (mr.bottom > window.innerHeight)
      menu.style.top = (window.innerHeight - mr.height - 8) + 'px';
    if (mr.right > window.innerWidth) {
      menu.style.right = '8px'; menu.style.left = 'auto';
    } else if (mr.left < 0) {
      menu.style.left = '8px'; menu.style.right = 'auto';
    }
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

/* ── Ghost tabs (file deleted/moved on disk) ──────────── */
function _setTabGhost(id, missing) {
  if (!tabs[id] || !!tabs[id]._missing === !!missing) return;
  tabs[id]._missing = !!missing;
  renderTabBar();
  if (id === activeTabId) {
    if (missing) _showFileMissingBanner(); else _hideFileMissingBanner();
  }
}

/* One factory for every .status-banner: same markup, same dismiss wiring,
   and a polite live region so the message is announced, not just drawn.
   Keyed by id — calling again with the same id replaces the text in
   place. Message is set via textContent (error names come from the OS). */
function _showStatusBanner(id, message) {
  _hideStatusBanner(id);
  const banner = document.createElement('div');
  banner.id = id;
  banner.className = 'status-banner';
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  banner.innerHTML = '<i class="ph ph-warning" aria-hidden="true"></i><span></span>' +
    '<button type="button" data-action="dismiss">Dismiss</button>';
  banner.querySelector('span').textContent = message;
  banner.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="dismiss"]')) banner.remove();
  });
  document.body.appendChild(banner);
}

function _hideStatusBanner(id) {
  const b = document.getElementById(id);
  if (b) b.remove();
}

function _showFileMissingBanner() {
  if (document.getElementById('file-missing-banner')) return;
  _showStatusBanner('file-missing-banner',
    'File no longer exists on disk — showing last known content. Saving will recreate it.');
}

function _hideFileMissingBanner() { _hideStatusBanner('file-missing-banner'); }

/* A server-side action failed (endpoint missing on a stale process, 5xx,
   unreachable). */
function _showServerActionFailedBanner(message) {
  _showStatusBanner('server-action-banner', message);
}

/* File exists but cannot be read (permissions, encoding, replaced by a dir) */
function _setTabFileError(id, errName) {
  if (!tabs[id]) return;
  const prev = tabs[id]._fileError || null;
  tabs[id]._fileError = errName || null;
  if (id !== activeTabId || prev === tabs[id]._fileError) return;
  if (!errName) { _hideStatusBanner('file-error-banner'); return; }
  _showStatusBanner('file-error-banner',
    'File cannot be read (' + errName + ') — showing last known content.');
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

/* ── Instance monitor ─────────────────────────────────── */
/* Status-bar indicator (:PORT + sibling count badge) with a dropdown of
   all live instances. Fetch cadence: init, dropdown open, 45s interval —
   never the 2s poll (sibling probes cost up to 1s each server-side). */
let _instancesCache = [];

async function fetchInstances() {
  try {
    const res = await fetch('/api/instances');
    const data = await res.json();
    _instancesCache = data.instances || [];
  } catch (e) { _instancesCache = []; }
  _renderInstanceIndicator();
  return _instancesCache;
}

function _renderInstanceIndicator() {
  const el = document.getElementById('instance-indicator');
  if (!el) return;
  const port = (window.DABARAT_CONFIG || {}).port || '';
  const siblings = _instancesCache.filter(i => !i.isSelf).length;
  el.querySelector('.instance-port').textContent = ':' + port;
  const badge = el.querySelector('.instance-count');
  if (siblings > 0) {
    badge.textContent = '+' + siblings;
    badge.style.display = '';
    el.title = siblings + ' other instance' + (siblings === 1 ? '' : 's') + ' running';
    el.setAttribute('aria-label', 'Dabarat instances — ' + el.title);
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
    el.title = 'Dabarat instances';
    el.setAttribute('aria-label', 'Dabarat instances');
  }
}

function _instanceStartedAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just started';
  if (m < 60) return 'up ' + m + 'm';
  const h = Math.floor(m / 60);
  if (h < 48) return 'up ' + h + 'h';
  return 'up ' + Math.floor(h / 24) + 'd';
}

async function showInstanceMenu(anchor) {
  dismissTabContextMenu();
  const menu = document.createElement('div');
  menu.className = 'tab-context-menu instance-menu';
  /* Rows hold real buttons, so this is a dialog, not a menu — Tab
     traverses Focus/Shut Down natively, Escape dismisses below */
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', 'Dabarat instances');

  /* Anchor above the status bar; palette invocations on home (status bar
     hidden, zero rect) pin to the bottom-left corner instead */
  const rect = anchor ? anchor.getBoundingClientRect() : null;
  if (rect && rect.width > 0) {
    menu.style.left = rect.left + 'px';
    menu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
  } else {
    menu.style.left = '16px';
    menu.style.bottom = '44px';
  }
  menu.style.top = 'auto';

  const renderRows = () => {
    if (!_instancesCache.length) {
      menu.innerHTML = '<div class="instance-empty">No instances found</div>';
      return;
    }
    menu.innerHTML = _instancesCache.map(inst => {
      const files = inst.tabs.map(t => escapeHtml(t.filename));
      const listing = files.length
        ? files.slice(0, 4).join(', ') + (files.length > 4 ? ' (+' + (files.length - 4) + ')' : '')
        : 'no tabs';
      const ago = _instanceStartedAgo(inst.started);
      return '<div class="instance-row' + (inst.isSelf ? ' self' : '') + '" data-port="' + inst.port + '">' +
        '<div class="instance-row-head">' +
          '<span class="instance-row-port">:' + inst.port + '</span>' +
          (inst.isSelf ? '<span class="instance-row-self">this window</span>' : '') +
          (ago ? '<span class="instance-row-ago">' + ago + '</span>' : '') +
        '</div>' +
        '<div class="instance-row-files" title="' +
          escapeHtml(inst.tabs.map(t => t.filepath).join('\n')) + '">' + listing + '</div>' +
        (inst.isSelf ? '' :
          '<div class="instance-row-actions">' +
            '<button data-action="focus" aria-label="Focus instance on port ' +
              inst.port + '">Focus</button>' +
            '<button data-action="shutdown" aria-label="Shut down instance on port ' +
              inst.port + '">Shut Down</button>' +
          '</div>') +
        '</div>';
    }).join('');
  };
  menu.innerHTML = '<div class="instance-empty">Scanning…</div>';

  menu.addEventListener('click', async (e) => {
    const row = e.target.closest('.instance-row[data-port]');
    if (!row) return;
    const port = parseInt(row.dataset.port, 10);
    if (e.target.closest('[data-action="focus"]')) {
      window.open('http://127.0.0.1:' + port);
    } else if (e.target.closest('[data-action="shutdown"]')) {
      /* Name what's at stake — the decision shouldn't lean on memory of
         the file listing the user just read in the row */
      const inst = _instancesCache.find(i => i.port === port);
      const names = inst ? inst.tabs.map(t => t.filename) : [];
      const holding = !names.length ? '' :
        ' (' + names.slice(0, 2).join(', ') +
        (names.length > 2 ? ' +' + (names.length - 2) + ' more' : '') + ')';
      if (!confirm('Shut down the instance on :' + port + holding +
                   '? Unsaved edits in its window will be lost.')) return;
      try {
        const res = await fetch('/api/instances/shutdown', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({port: port})
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          alert('Shutdown of :' + port + ' failed' + (data.error ? ': ' + data.error : ''));
        }
      } catch (err) {
        alert('Shutdown of :' + port + ' failed: ' + err.message);
      }
      await fetchInstances();
      renderRows();
    }
  });

  document.body.appendChild(menu);
  await fetchInstances();
  renderRows();

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

(() => {
  const el = document.getElementById('instance-indicator');
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    showInstanceMenu(el);
  });
  fetchInstances();
  setInterval(fetchInstances, 45000);
})();
