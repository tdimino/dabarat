/* ── Tab Bar ──────────────────────────────────────────── */
let _lastTabIds = new Set();

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

  const ids = Object.keys(tabs);
  ids.forEach(id => {
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
    bar.appendChild(div);
  });

  /* + button */
  const addBtn = document.createElement('button');
  addBtn.id = 'tab-add';
  addBtn.title = 'Open file';
  addBtn.innerHTML = '<i class="ph ph-plus"></i>';
  addBtn.onclick = showAddFileInput;
  bar.appendChild(addBtn);

  /* Animate newly added tabs */
  if (window.Motion && !_prefersReducedMotion) {
    const currentIds = new Set(ids);
    ids.forEach(id => {
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
    _lastTabIds = new Set(ids);
  }

  /* Update overflow fade indicators */
  _updateTabOverflow();
}

/* ── Tab Overflow Indicators ─────────────────────────── */
let _tabOverflowBound = false;
function _updateTabOverflow() {
  const bar = document.getElementById('tab-bar');
  const wrapper = document.getElementById('tab-bar-wrapper');
  if (!bar || !wrapper) return;
  wrapper.classList.toggle('has-overflow-left', bar.scrollLeft > 4);
  wrapper.classList.toggle('has-overflow-right',
    bar.scrollLeft < bar.scrollWidth - bar.clientWidth - 4);
  if (!_tabOverflowBound) {
    bar.addEventListener('scroll', _updateTabOverflow, { passive: true });
    _tabOverflowBound = true;
  }
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

  /* Auto-scroll active tab into view */
  const activeEl = document.querySelector('.tab.active');
  if (activeEl) {
    activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

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

  /* Update status bar */
  document.getElementById('status-filepath').textContent = tabs[id].filepath;
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

  /* Animate tab collapse before removing */
  const tabEl = document.querySelector('.tab[data-tab="' + id + '"]');
  if (tabEl && window.Motion && !_prefersReducedMotion) {
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
  addBtn.style.display = 'none';

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
    } else if (e.key === 'Escape') {
      input.remove();
      const b2 = bar.querySelector('.tab-browse-btn');
      if (b2) b2.remove();
      addBtn.style.display = '';
    }
  };

  input.onblur = () => {
    setTimeout(() => {
      if (bar.contains(input)) {
        input.remove();
        const browse = bar.querySelector('.tab-browse-btn');
        if (browse) browse.remove();
        addBtn.style.display = '';
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
