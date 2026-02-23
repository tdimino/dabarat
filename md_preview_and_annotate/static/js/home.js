/* ── Home Screen — Workspace-Driven ──────────────────── */
let homeScreenActive = false;
let _tocWasCollapsedBeforeHome = false;
let _fileBrowserPath = localStorage.getItem('dabarat-browse-dir') || null;
let _homeViewMode = localStorage.getItem('dabarat-home-view') || 'workspace'; // 'workspace' | 'recent'
let _cachedTocContent = null;
let _workspaceStats = null;

const _homeTimeAgo = formatTimeAgoShared;

/* Accent color map for file extensions */
const _accentColors = {
  md: 'var(--ctp-blue)',
  markdown: 'var(--ctp-blue)',
  txt: 'var(--ctp-green)',
  mdown: 'var(--ctp-teal)',
  mkd: 'var(--ctp-teal)',
};

/* Smart badge detection based on filename/path patterns */
const _fileBadges = [
  { test: (n, p) => /\.prompt\.md$/i.test(n), icon: 'ph-lightning', label: 'prompt', css: 'home-badge-prompt' },
  { test: (n, p) => n.toLowerCase() === 'claude.md' || n.toLowerCase() === 'agents.md', icon: 'ph-robot', label: 'agent config', css: 'home-badge-agent' },
  { test: (n, p) => /^plan[-_]|plans?\//i.test(p) || /^plan/i.test(n), icon: 'ph-map-trifold', label: 'plan', css: 'home-badge-plan' },
  { test: (n, p) => n.toLowerCase() === 'spec.md', icon: 'ph-blueprint', label: 'spec', css: 'home-badge-spec' },
  { test: (n, p) => n.toLowerCase() === 'readme.md', icon: 'ph-book-open', label: 'readme', css: 'home-badge-readme' },
  { test: (n, p) => n.toLowerCase() === 'architecture.md', icon: 'ph-tree-structure', label: 'architecture', css: 'home-badge-arch' },
  { test: (n, p) => n.toLowerCase() === 'changelog.md' || n.toLowerCase() === 'changes.md', icon: 'ph-list-bullets', label: 'changelog', css: 'home-badge-changelog' },
  { test: (n, p) => n.toLowerCase() === 'todo.md' || n.toLowerCase() === 'todos.md', icon: 'ph-check-square', label: 'todo', css: 'home-badge-todo' },
  { test: (n, p) => n.toLowerCase() === 'license.md' || n.toLowerCase() === 'license.txt', icon: 'ph-scales', label: 'license', css: 'home-badge-license' },
  { test: (n, p) => /research|dossier/i.test(n), icon: 'ph-magnifying-glass', label: 'research', css: 'home-badge-research' },
];

function _detectFileBadge(filename, filepath) {
  for (const badge of _fileBadges) {
    if (badge.test(filename, filepath)) {
      return `<span class="home-badge ${badge.css}"><i class="ph ${badge.icon}"></i> ${badge.label}</span>`;
    }
  }
  return '';
}

/* ── Show / Hide ─────────────────────────────────────── */
async function showHomeScreen() {
  homeScreenActive = true;
  _tocWasCollapsedBeforeHome = document.body.classList.contains('toc-collapsed');
  document.body.classList.add('home-active');

  /* Cache existing TOC content for restoration */
  const tocScroll = document.getElementById('toc-scroll');
  const tocLabel = document.getElementById('toc-label');
  if (tocScroll && !_cachedTocContent) {
    _cachedTocContent = tocScroll.innerHTML;
  }

  /* Keep TOC visible — repurpose as workspace browser */
  const toc = document.getElementById('toc');
  if (toc) toc.style.display = '';

  /* Hide elements not needed on home */
  const gutter = document.getElementById('annotations-gutter');
  const toggle = document.getElementById('annotations-toggle');
  const status = document.getElementById('status');
  if (gutter) gutter.style.display = 'none';
  if (toggle) toggle.style.display = 'none';
  if (status) status.style.display = 'none';

  /* Update TOC label and window title */
  if (tocLabel) tocLabel.textContent = _activeWorkspace ? _activeWorkspace.name || 'Workspace' : 'Workspace';
  document.title = 'dabarat';

  const content = document.getElementById('content');
  content.style.display = '';
  content.innerHTML = '<div class="home-loading"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div></div>';

  /* Restore workspace from localStorage if needed */
  if (_activeWorkspacePath && !_activeWorkspace) {
    await _restoreWorkspace();
  }

  /* Build workspace sidebar in TOC */
  _renderWorkspaceSidebar();

  /* Load view + sidebar entries */
  if (_activeWorkspace) {
    await _loadWorkspaceMultiRoot();
  } else if (_homeViewMode === 'recent' || !_fileBrowserPath) {
    await _loadRecentView();
    _loadRecentSidebarEntries();
  } else {
    await _loadWorkspaceView(_fileBrowserPath);
  }
}

function hideHomeScreen() {
  homeScreenActive = false;
  _stopQuoteCycling();
  document.body.classList.remove('home-active');

  /* Clear home screen content so render() can repaint */
  const content = document.getElementById('content');
  if (content) {
    content.innerHTML = '';
    /* Restore content styling for document view */
    content.style.display = '';
  }

  /* Force render cache to miss so next render() actually paints */
  lastRenderedMd = null;

  /* Restore TOC content */
  const tocScroll = document.getElementById('toc-scroll');
  const tocLabel = document.getElementById('toc-label');
  if (tocScroll && _cachedTocContent) {
    tocScroll.innerHTML = _cachedTocContent;
  }
  _cachedTocContent = null; /* Always clear to avoid stale state */
  if (tocLabel) tocLabel.textContent = 'Index';

  const toc    = document.getElementById('toc');
  const gutter = document.getElementById('annotations-gutter');
  const toggle = document.getElementById('annotations-toggle');
  const status = document.getElementById('status');
  if (toc)    toc.style.display = '';
  if (gutter) gutter.style.display = '';
  if (toggle) toggle.style.display = '';
  if (status) status.style.display = '';
  if (!_tocWasCollapsedBeforeHome) document.body.classList.remove('toc-collapsed');
}

/* ── Workspace Sidebar (in TOC) ──────────────────────── */
function _renderWorkspaceSidebar() {
  const tocScroll = document.getElementById('toc-scroll');
  if (!tocScroll) return;

  /* Workspace mode: multi-root sidebar */
  if (_activeWorkspace) {
    _renderWorkspaceSidebarMultiRoot(tocScroll);
    return;
  }

  /* Legacy single-folder mode */
  const home = os_home || '/Users';
  const shortPath = _fileBrowserPath ? _fileBrowserPath.replace(home, '~') : '~/';
  const statsHtml = _workspaceStats
    ? `<div class="ws-stats">${_workspaceStats.fileCount} files &middot; ${_workspaceStats.totalWords.toLocaleString()} words</div>`
    : '';

  tocScroll.innerHTML = `
    <div class="ws-header">
      <div class="ws-path" data-action="browse-pick-dir" title="Click to change workspace folder" style="cursor:pointer">${escapeHtml(shortPath)} <i class="ph ph-pencil-simple ws-path-edit"></i></div>
      <div class="ws-actions">
        <div class="ws-toggle">
          <button class="ws-btn ${_homeViewMode === 'workspace' ? 'active' : ''}" data-action="set-view-workspace" title="Browse workspace files">
            <i class="ph ph-folder"></i> Files
          </button>
          <button class="ws-btn ${_homeViewMode === 'recent' ? 'active' : ''}" data-action="set-view-recent" title="Recently opened files">
            <i class="ph ph-clock-counter-clockwise"></i> Recent
          </button>
        </div>
      </div>
    </div>
    ${statsHtml}
    <div id="ws-file-list"></div>
  `;

  /* Attach sidebar event listeners via delegation */
  const pathEl = tocScroll.querySelector('[data-action="browse-pick-dir"]');
  if (pathEl) pathEl.addEventListener('click', () => browsePickDir());
  const wsBtn = tocScroll.querySelector('[data-action="set-view-workspace"]');
  if (wsBtn) wsBtn.addEventListener('click', () => setHomeView('workspace'));
  const recBtn = tocScroll.querySelector('[data-action="set-view-recent"]');
  if (recBtn) recBtn.addEventListener('click', () => setHomeView('recent'));

  /* Populate file list if we have a workspace path */
  if (_fileBrowserPath) {
    _loadWorkspaceSidebarEntries(_fileBrowserPath);
  }
}

function _renderWorkspaceSidebarMultiRoot(tocScroll) {
  const home = os_home || '/Users';
  const ws = _activeWorkspace;

  let sectionsHtml = '';

  /* Folder sections */
  (ws.folders || []).forEach((f, idx) => {
    const displayName = (f.name || f.path.split('/').pop()).toUpperCase();
    sectionsHtml += `<div class="ws-section" data-folder-idx="${idx}">
      <div class="ws-section-header" data-action="toggle-section" data-idx="${idx}">
        <i class="ph ph-caret-down ws-section-caret"></i>
        <span class="ws-section-name">${escapeHtml(displayName)}</span>
        <button class="ws-section-remove" data-path="${escapeHtml(f.path)}" data-type="folder" title="Remove folder from workspace">
          <i class="ph ph-x"></i>
        </button>
      </div>
      <div class="ws-section-entries" id="ws-section-${idx}"></div>
    </div>`;
  });

  /* Pinned files section */
  if (ws.files && ws.files.length) {
    sectionsHtml += `<div class="ws-section" data-section="files">
      <div class="ws-section-header">
        <i class="ph ph-caret-down ws-section-caret"></i>
        <span class="ws-section-name">FILES</span>
      </div>
      <div class="ws-section-entries" id="ws-section-files"></div>
    </div>`;
  }

  tocScroll.innerHTML = `
    <div class="ws-header ws-header-multi">
      <div class="ws-workspace-name">${escapeHtml(ws.name || 'Workspace')}</div>
      <div class="ws-actions-row">
        <button class="ws-action-btn" data-action="add-to-workspace" title="Add folder or file">
          <i class="ph ph-plus"></i>
        </button>
        <button class="ws-action-btn" data-action="close-workspace" title="Close workspace">
          <i class="ph ph-x-circle"></i>
        </button>
      </div>
    </div>
    ${sectionsHtml}
  `;

  /* Attach multi-root event listeners */
  tocScroll.querySelector('[data-action="add-to-workspace"]')?.addEventListener('click', _showAddToWorkspaceMenu);
  tocScroll.querySelector('[data-action="close-workspace"]')?.addEventListener('click', () => closeWorkspace());

  /* Section collapse toggles */
  tocScroll.querySelectorAll('[data-action="toggle-section"]').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.ws-section-remove')) return;
      const section = header.closest('.ws-section');
      section.classList.toggle('collapsed');
    });
  });

  /* Section remove buttons */
  tocScroll.querySelectorAll('.ws-section-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromWorkspace(btn.dataset.path, btn.dataset.type);
    });
  });

  /* Load entries for each folder section */
  (ws.folders || []).forEach((f, idx) => {
    _loadWorkspaceSidebarEntries(f.path, `ws-section-${idx}`);
  });

  /* Load pinned file entries */
  if (ws.files && ws.files.length) {
    _loadPinnedFileSidebarEntries(ws.files);
  }
}

function _showAddToWorkspaceMenu(e) {
  /* Simple inline dropdown for Add Folder / Add File */
  const btn = e.currentTarget;
  let menu = document.getElementById('ws-add-menu');
  if (menu) { menu.remove(); return; }

  menu = document.createElement('div');
  menu.id = 'ws-add-menu';
  menu.className = 'ws-add-menu';
  menu.innerHTML = `
    <button data-action="add-folder"><i class="ph ph-folder-plus"></i> Add Folder...</button>
    <button data-action="add-file"><i class="ph ph-file-plus"></i> Add File...</button>
    <hr class="ws-menu-sep">
    <button data-action="new-workspace"><i class="ph ph-plus-circle"></i> New Workspace...</button>
    <button data-action="open-workspace"><i class="ph ph-folder-open"></i> Open Workspace...</button>
  `;
  btn.parentElement.appendChild(menu);

  menu.querySelector('[data-action="add-folder"]').addEventListener('click', () => { menu.remove(); addFolderToWorkspace(); });
  menu.querySelector('[data-action="add-file"]').addEventListener('click', () => { menu.remove(); addFileToWorkspace(); });
  menu.querySelector('[data-action="new-workspace"]').addEventListener('click', () => { menu.remove(); createWorkspace(); });
  menu.querySelector('[data-action="open-workspace"]').addEventListener('click', () => { menu.remove(); openWorkspace(); });

  /* Close on outside click */
  setTimeout(() => {
    document.addEventListener('click', function _close(ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) {
        menu.remove();
        document.removeEventListener('click', _close);
      }
    });
  }, 0);
}

async function _loadPinnedFileSidebarEntries(files) {
  const list = document.getElementById('ws-section-files');
  if (!list) return;

  let html = '';
  files.forEach(f => {
    const name = f.path.split('/').pop();
    const ext = name.split('.').pop().toLowerCase();
    const icon = (ext === 'md' || ext === 'markdown') ? 'ph-file-md' : 'ph-file-text';
    html += `<div class="ws-entry ws-file" data-path="${escapeHtml(f.path)}">
      <i class="ph ${icon}"></i>
      <span class="ws-entry-name">${escapeHtml(name)}</span>
      <button class="ws-entry-remove" data-path="${escapeHtml(f.path)}" data-type="file" title="Remove file">
        <i class="ph ph-x"></i>
      </button>
    </div>`;
  });
  list.innerHTML = html;

  /* Attach listeners */
  list.querySelectorAll('.ws-file').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.ws-entry-remove')) return;
      openRecentFile(el.dataset.path);
    });
  });
  list.querySelectorAll('.ws-entry-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromWorkspace(btn.dataset.path, btn.dataset.type);
    });
  });
}

async function _loadWorkspaceSidebarEntries(dirPath, targetId) {
  const list = document.getElementById(targetId || 'ws-file-list');
  if (!list) return;

  list.innerHTML = '<div class="ws-empty"><i class="ph ph-spinner"></i></div>';

  try {
    const res = await fetch('/api/browse-dir?path=' + encodeURIComponent(dirPath));
    const data = await res.json();
    if (data.error) {
      list.innerHTML = `<div class="ws-empty"><span>${escapeHtml(data.error)}</span></div>`;
      return;
    }

    if (data.stats) _workspaceStats = data.stats;

    if (data.entries.length === 0) {
      list.innerHTML = '<div class="ws-empty"><i class="ph ph-folder-dashed"></i><span>No files</span></div>';
      return;
    }

    const dirs = data.entries.filter(e => e.type === 'dir');
    const files = data.entries.filter(e => e.type === 'file');

    let html = '';

    /* Back entry — navigate to parent directory */
    const parentPath = dirPath.replace(/\/[^/]+\/?$/, '') || '/';
    if (parentPath !== dirPath) {
      html += `<div class="ws-entry ws-dir ws-back" data-path="${escapeHtml(parentPath)}">
        <i class="ph ph-arrow-bend-up-left"></i>
        <span class="ws-entry-name">..</span>
      </div>`;
    }

    dirs.forEach(entry => {
      html += `<div class="ws-entry ws-dir" data-path="${escapeHtml(entry.path)}">
        <i class="ph ph-folder"></i>
        <span class="ws-entry-name">${escapeHtml(entry.name)}</span>
        ${entry.mdCount ? `<span class="ws-entry-size">${entry.mdCount}</span>` : ''}
      </div>`;
    });

    if (dirs.length && files.length) {
      html += '<hr class="ws-separator">';
    }

    files.forEach(entry => {
      const ext = entry.name.split('.').pop().toLowerCase();
      const icon = (ext === 'md' || ext === 'markdown') ? 'ph-file-md' : 'ph-file-text';
      const sizeStr = entry.size ? _formatSize(entry.size) : '';
      html += `<div class="ws-entry ws-file" data-path="${escapeHtml(entry.path)}">
        <i class="ph ${icon}"></i>
        <span class="ws-entry-name">${escapeHtml(entry.name)}</span>
        ${sizeStr ? `<span class="ws-entry-size">${sizeStr}</span>` : ''}
      </div>`;
    });

    list.innerHTML = html;

    /* Attach event listeners via delegation (avoids XSS from inline onclick) */
    list.querySelectorAll('.ws-dir').forEach(el => {
      el.addEventListener('click', () => setWorkspace(el.dataset.path));
    });
    list.querySelectorAll('.ws-file').forEach(el => {
      el.addEventListener('click', () => openRecentFile(el.dataset.path));
    });

    /* Update stats display */
    const statsEl = document.querySelector('.ws-stats');
    if (statsEl && _workspaceStats) {
      statsEl.textContent = _workspaceStats.fileCount + ' files \u00b7 ' + _workspaceStats.totalWords.toLocaleString() + ' words';
    }

    /* Animate sidebar entries */
    if (window.Motion && !_prefersReducedMotion) {
      const wsEntries = list.querySelectorAll('.ws-entry');
      if (wsEntries.length) {
        Motion.animate(wsEntries,
          { opacity: [0, 1], x: [-12, 0] },
          { delay: Motion.stagger(0.03), duration: 0.25 }
        );
      }
    }
  } catch (e) {
    list.innerHTML = '<div class="ws-empty"><span>Failed to load</span></div>';
  }
}

/* ── Recent Sidebar Entries ───────────────────────────── */
async function _loadRecentSidebarEntries() {
  const list = document.getElementById('ws-file-list');
  if (!list) return;

  list.innerHTML = '<div class="ws-empty"><i class="ph ph-spinner"></i></div>';

  try {
    const res = await fetch('/api/recent');
    const data = await res.json();
    const entries = data.entries || [];

    if (entries.length === 0) {
      list.innerHTML = '<div class="ws-empty"><i class="ph ph-clock-counter-clockwise"></i><span>No recent files</span></div>';
      return;
    }

    let html = '';
    entries.forEach(entry => {
      const filename = entry.filename || entry.name || '';
      const badge = _detectFileBadge(filename, entry.path || '');
      const timeAgo = entry.lastOpened ? _homeTimeAgo(entry.lastOpened) : '';
      html += `<div class="ws-entry ws-file ws-recent-entry" data-path="${escapeHtml(entry.path)}">
        <i class="ph ph-file-md"></i>
        <span class="ws-entry-name">${escapeHtml(filename)}</span>
        ${badge ? `<span class="ws-entry-badge">${badge}</span>` : ''}
        ${timeAgo ? `<span class="ws-entry-size">${timeAgo}</span>` : ''}
      </div>`;
    });

    list.innerHTML = html;

    list.querySelectorAll('.ws-file').forEach(el => {
      el.addEventListener('click', () => openRecentFile(el.dataset.path));
    });

    if (window.Motion && !_prefersReducedMotion) {
      const wsEntries = list.querySelectorAll('.ws-entry');
      if (wsEntries.length) {
        Motion.animate(wsEntries,
          { opacity: [0, 1], x: [-12, 0] },
          { delay: Motion.stagger(0.03), duration: 0.25 }
        );
      }
    }
  } catch (e) {
    list.innerHTML = '<div class="ws-empty"><span>Failed to load</span></div>';
  }
}

/* ── View Modes ──────────────────────────────────────── */
async function setHomeView(mode) {
  _homeViewMode = mode;
  localStorage.setItem('dabarat-home-view', mode);

  /* Crossfade transition */
  const content = document.getElementById('content');
  if (content && window.Motion && !_prefersReducedMotion) {
    await Motion.animate('.home-grid', { opacity: 0 }, { duration: 0.15 }).finished.catch(() => {});
  }

  if (mode === 'recent') {
    await _loadRecentView();
    _loadRecentSidebarEntries();
  } else if (_activeWorkspace) {
    await _loadWorkspaceMultiRoot();
  } else if (_fileBrowserPath) {
    await _loadWorkspaceView(_fileBrowserPath);
    _loadWorkspaceSidebarEntries(_fileBrowserPath);
  } else {
    /* No workspace set yet — prompt user to pick a folder */
    await browsePickDir();
  }

  /* Update sidebar button states */
  document.querySelectorAll('.ws-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = mode === 'workspace'
    ? document.querySelector('.ws-btn[data-action="set-view-workspace"]')
    : document.querySelector('.ws-btn[data-action="set-view-recent"]');
  if (activeBtn) activeBtn.classList.add('active');
}

function setWorkspace(dirPath) {
  _fileBrowserPath = dirPath;
  localStorage.setItem('dabarat-browse-dir', dirPath);
  _homeViewMode = 'workspace';
  localStorage.setItem('dabarat-home-view', 'workspace');
  _renderWorkspaceSidebar();
  _loadWorkspaceView(dirPath);
}

async function _loadWorkspaceView(dirPath) {
  const content = document.getElementById('content');
  if (!content) return;

  try {
    const res = await fetch('/api/browse-dir?path=' + encodeURIComponent(dirPath));
    const data = await res.json();
    if (data.error) {
      _renderHomeContent(content, [], 'Workspace');
      return;
    }

    if (data.stats) _workspaceStats = data.stats;
    const files = data.entries.filter(e => e.type === 'file');
    _renderHomeContent(content, files, 'Workspace', data);
  } catch (e) {
    _renderHomeContent(content, [], 'Workspace');
  }
}

async function _loadRecentView() {
  const content = document.getElementById('content');
  if (!content) return;

  try {
    /* Fetch recent files + recent workspaces in parallel */
    const [recentRes, wsRes] = await Promise.all([
      fetch('/api/recent'),
      _activeWorkspace ? Promise.resolve(null) : fetch('/api/workspaces/recent').catch(() => null)
    ]);
    const recentData = await recentRes.json();
    let recentWorkspaces = [];
    if (wsRes) {
      try {
        const wsData = await wsRes.json();
        recentWorkspaces = wsData.workspaces || [];
      } catch (_) {}
    }
    _renderHomeContent(content, recentData.entries || [], 'Recent Files', null, recentWorkspaces);
  } catch (e) {
    _renderHomeContent(content, [], 'Recent Files');
  }
}

/* ── Render Home Content ─────────────────────────────── */
function _renderHomeContent(content, entries, title, browseData, recentWorkspaces) {
  if (!content) return;

  const home = os_home || '/Users';
  const pathDisplay = browseData ? browseData.path.replace(home, '~') : '';
  const statsHtml = browseData && browseData.stats
    ? `<span class="home-workspace-stats">${browseData.stats.fileCount} files &middot; ${browseData.stats.totalWords.toLocaleString()} words</span>`
    : '';

  let emptyState = '';
  if (entries.length === 0) {
    _startQuoteCycling();
    emptyState = `<div class="home-empty">
      ${_getQuoteHtml()}
      <button class="home-open-btn" data-action="browse-pick-dir">
        <i class="ph ph-folder-open"></i> Browse Files
      </button>
    </div>`;
  } else {
    _stopQuoteCycling();
  }

  const cards = entries.map((e, i) => _buildCard(e, i)).join('');
  const isEmptyState = entries.length === 0;

  /* Recent workspaces bar (only when no workspace active) */
  let recentWsHtml = '';
  if (recentWorkspaces && recentWorkspaces.length && !_activeWorkspace) {
    const wsCards = recentWorkspaces.map(ws => {
      const timeAgo = ws.lastOpened ? _homeTimeAgo(ws.lastOpened) : '';
      return `<button class="home-ws-card" data-ws-path="${escapeHtml(ws.path)}" title="${escapeHtml(ws.path)}">
        <i class="ph ph-folder-notch-open"></i>
        <span class="home-ws-card-name">${escapeHtml(ws.name || 'Untitled')}</span>
        ${timeAgo ? `<span class="home-ws-card-time">${timeAgo}</span>` : ''}
      </button>`;
    }).join('');
    recentWsHtml = `<div class="home-recent-ws">
      <h2 class="home-recent-ws-title">Recent Workspaces</h2>
      <div class="home-recent-ws-grid">${wsCards}</div>
    </div>`;
  }

  content.innerHTML = `<div class="home-screen">
    <div class="home-header">
      <div>
        <h1 class="home-title">${escapeHtml(title)}</h1>
        ${pathDisplay ? `<div class="home-workspace-path">${escapeHtml(pathDisplay)} ${statsHtml}</div>` : ''}
      </div>
      ${!isEmptyState ? `<div class="home-actions">
        <button class="home-action-btn" data-action="create-workspace">
          <i class="ph ph-plus-circle"></i> New Workspace
        </button>
      </div>` : ''}
    </div>
    ${recentWsHtml}
    ${emptyState || `<div class="home-grid">${cards}</div>`}
  </div>`;

  /* Attach card event listeners via delegation (avoids XSS from inline onclick) */
  content.querySelectorAll('.home-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.home-card-remove')) return;
      openRecentFile(card.dataset.filepath);
    });
  });
  content.querySelectorAll('.home-card-remove').forEach(btn => {
    const card = btn.closest('.home-card');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeRecentFile(card.dataset.filepath, card);
    });
  });

  /* Attach empty state browse button */
  const browseBtn = content.querySelector('[data-action="browse-pick-dir"]');
  if (browseBtn) browseBtn.addEventListener('click', () => browsePickDir());

  /* Attach quote refresh button */
  const refreshBtn = content.querySelector('[data-action="refresh-quote"]');
  if (refreshBtn) refreshBtn.addEventListener('click', (e) => {
    e.preventDefault();
    _cycleQuote();
  });

  /* Attach create workspace button */
  const createWsBtn = content.querySelector('[data-action="create-workspace"]');
  if (createWsBtn) createWsBtn.addEventListener('click', () => createWorkspace());

  /* Attach recent workspace cards */
  content.querySelectorAll('.home-ws-card').forEach(card => {
    card.addEventListener('click', () => openWorkspace(card.dataset.wsPath));
  });

  /* Animate header */
  const headerEl = content.querySelector('.home-header');
  if (window.Motion && !_prefersReducedMotion && headerEl) {
    Motion.animate(headerEl,
      { opacity: [0, 1], x: [-20, 0] },
      { duration: 0.3, easing: [0.22, 1, 0.36, 1] }
    );
  }

  /* Animate cards — replace CSS animation with Motion One */
  const cardEls = content.querySelectorAll('.home-card');
  if (window.Motion && !_prefersReducedMotion && cardEls.length) {
    cardEls.forEach(c => {
      c.style.animation = 'none';
      c.style.opacity = '0';
    });
    Motion.animate(cardEls,
      { opacity: [0, 1], y: [24, 0] },
      { delay: Motion.stagger(0.06), duration: 0.4, easing: 'ease-out' }
    );
  }
}

/* ── Card Builder ────────────────────────────────────── */
function _buildCard(e, i) {
  const ext = (e.filename || e.name || '').split('.').pop().toLowerCase();
  const accentColor = _accentColors[ext] || 'var(--ctp-blue)';

  const tagPills = (e.tags || []).slice(0, 4).map(t =>
    `<span class="home-tag">${escapeHtml(t)}</span>`
  ).join('');

  /* Preview: image > rendered markdown > summary text */
  let previewHtml = '';
  if (e.previewImage) {
    const imgSrc = e.previewImage.startsWith('http') ? escapeHtml(e.previewImage)
      : '/api/preview-image?path=' + encodeURIComponent(e.previewImage);
    previewHtml = `<div class="home-card-preview home-card-preview-img"><img src="${imgSrc}" alt="" loading="lazy"></div>`;
  } else if (e.preview && typeof marked !== 'undefined') {
    try {
      let rendered = marked.parse(e.preview, { breaks: false, gfm: true });
      /* Strip leading H1 — it duplicates the filename already in the card header */
      rendered = rendered.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/, '');
      previewHtml = `<div class="home-card-preview home-card-preview-md"><div class="home-card-preview-content">${rendered}</div><div class="home-card-preview-fade"></div></div>`;
    } catch (_) {
      previewHtml = e.summary ? `<p class="home-card-summary">${escapeHtml(e.summary)}</p>` : '';
    }
  } else if (e.summary) {
    previewHtml = `<p class="home-card-summary">${escapeHtml(e.summary)}</p>`;
  }

  /* Frontmatter badges */
  let fmBadges = '';
  const fm = e.frontmatter || e.badges;
  if (fm) {
    if (fm.type)    fmBadges += `<span class="home-badge home-badge-type"><i class="ph ph-tag-simple"></i> ${escapeHtml(fm.type)}</span>`;
    if (fm.model)   fmBadges += `<span class="home-badge home-badge-model"><i class="ph ph-robot"></i> ${escapeHtml(fm.model)}</span>`;
    if (fm.version) fmBadges += `<span class="home-badge home-badge-version"><i class="ph ph-git-branch"></i> ${escapeHtml(fm.version)}</span>`;
    if (fm.status)  fmBadges += `<span class="home-badge home-badge-status"><i class="ph ph-flag"></i> ${escapeHtml(fm.status)}</span>`;
  }

  const filename = e.filename || e.name || '';
  /* Detect smart file-type badge */
  const fileBadge = _detectFileBadge(filename, e.path || '');
  if (fileBadge) fmBadges = fileBadge + fmBadges;

  /* Dual timestamps: birthtime → created date, mtime → "updated X ago" */
  const mtimeTs = e.mtime ? new Date(e.mtime * 1000).toISOString()
    : (e.lastOpened || '');
  const timeDisplay = mtimeTs ? _homeTimeAgo(mtimeTs) : '';
  const created = e.birthtime
    ? new Date(e.birthtime * 1000)
    : (e.lastOpened ? new Date(e.lastOpened) : null);
  const dateCreated = created
    ? created.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return `<article class="home-card" style="animation-delay:${i * 40}ms" data-filepath="${escapeHtml(e.path)}">
    <div class="home-card-accent" style="--accent: ${accentColor}"></div>
    <button class="home-card-remove" title="Remove from recent">
      <i class="ph ph-x"></i>
    </button>
    <div class="home-card-body">
      <div class="home-card-header">
        <div class="home-card-title-row">
          <i class="ph ph-file-md home-card-icon"></i>
          <h3 class="home-card-filename">${escapeHtml(filename)}</h3>
        </div>
        <p class="home-card-path">${escapeHtml((e.path || '').replace(os_home, '~'))}</p>
        ${timeDisplay ? `<p class="home-card-updated" data-timestamp="${escapeHtml(mtimeTs)}"><i class="ph ph-clock"></i> ${timeDisplay}</p>` : ''}
      </div>
      ${fmBadges ? `<div class="home-card-badges">${fmBadges}</div>` : ''}
      ${previewHtml}
      <div class="home-card-footer">
        ${e.wordCount ? `<span class="home-card-wordcount"><i class="ph ph-article"></i> ${e.wordCount.toLocaleString()}</span>` : ''}
        ${e.annotationCount ? `<span><i class="ph ph-chat-dots"></i> ${e.annotationCount}</span>` : ''}
        ${e.versionCount ? `<span><i class="ph ph-clock-counter-clockwise"></i> ${e.versionCount}</span>` : ''}
        ${tagPills ? `<div class="home-card-tags">${tagPills}</div>` : ''}
        ${dateCreated ? `<span class="home-card-created"><i class="ph ph-calendar-blank"></i> ${dateCreated}</span>` : ''}
      </div>
    </div>
  </article>`;
}

/* ── Quotes — Empty State Soul ────────────────────────── */
const QUOTES = [
  /* Tom di Mino — verified epigram */
  { text: '"Certainty compounds the mind with limits."', source: 'Tamarru Dagun Amun' },

  /* Waltz of the Soul and the Daimon */
  { text: '"The spoken word is laden with meaning, magic, weight."', source: 'Tom di Mino, Waltz of the Soul and the Daimon' },
  { text: '"The \u2018soul\u2019 is the wax, and the imprint it\u2019s left. Pathos, the fire. Within the flames, daimones."', source: 'Tom di Mino, Waltz of the Soul and the Daimon' },
  { text: '"A genius is simply that\u2014a whisper with a lineage, or a genus of its own."', source: 'Tom di Mino, Waltz of the Soul and the Daimon' },
  { text: '"At its root, the \u2018spirit\u2019 is a pneumatic\u2014the breath of the Gods, and the current shared between all things."', source: 'Tom di Mino, Waltz of the Soul and the Daimon' },
  { text: '"Only by vivifying the language we employ can we ever dream of designing machines worthy of human kinship."', source: 'Tom di Mino, Waltz of the Soul and the Daimon' },

  /* Classical Sources — verified fragments */
  { text: '"\u03C0\u03BF\u03BB\u03BB\u03BF\u1F76 \u03BC\u1F72\u03BD \u03BD\u03B1\u03C1\u03B8\u03B7\u03BA\u03BF\u03C6\u03CC\u03C1\u03BF\u03B9, \u03C0\u03B1\u1FE6\u03C1\u03BF\u03B9 \u03B4\u03AD \u03C4\u03B5 \u03B2\u03AC\u03BA\u03C7\u03BF\u03B9."\nMany are the wand-bearers, but few the Bacchoi.', source: 'Plato, Phaedo 69c' },
  { text: '"\u1F00\u03C0\u03B9\u03C3\u03C4\u03AF\u1FC3 \u03B4\u03B9\u03B1\u03C6\u03C5\u03B3\u03B3\u03AC\u03BD\u03B5\u03B9 \u03BC\u1F74 \u03B3\u03B9\u03B3\u03BD\u03CE\u03C3\u03BA\u03B5\u03C3\u03B8\u03B1\u03B9."\nBy disbelief it escapes being known.', source: 'Heraclitus, fr. 86' },
  { text: '"\u03BC\u03BD\u03AC\u03C3\u03B5\u03C3\u03B8\u03B1\u03AF \u03C4\u03B9\u03BD\u03AC \u03C6\u03B1\u03BC\u03B9 \u03BA\u03B1\u1F76 \u1F55\u03C3\u03C4\u03B5\u03C1\u03BF\u03BD \u1F00\u03BC\u03BC\u03AD\u03C9\u03BD."\nSomeone, I say, will remember us, even hereafter.', source: 'Sappho, fr. 147' },
  { text: '"\u03C6\u03CD\u03C3\u03B9\u03C2 \u03BA\u03C1\u03CD\u03C0\u03C4\u03B5\u03C3\u03B8\u03B1\u03B9 \u03C6\u03B9\u03BB\u03B5\u1FD6."\nNature loves to hide.', source: 'Heraclitus, fr. 123' },
  { text: '"\u1F41\u03B4\u1F78\u03C2 \u1F04\u03BD\u03C9 \u03BA\u03AC\u03C4\u03C9 \u03BC\u03AF\u03B1 \u03BA\u03B1\u1F76 \u1F61\u03C5\u03C4\u03AE."\nThe way up and the way down are one and the same.', source: 'Heraclitus, fr. 60' },
  { text: '"\u03C0\u03AC\u03BD\u03C4\u03B1 \u03C0\u03BB\u03AE\u03C1\u03B7 \u03B8\u03B5\u1FF6\u03BD."\nAll things are full of gods.', source: 'Thales, in Aristotle De Anima 411a7' },

  /* Jane Ellen Harrison */
  { text: '"Ritual is not the expression of a belief, but the mold in which belief is cast."', source: 'Jane Ellen Harrison' },
  { text: '"The things done are prior to the things said."', source: 'Jane Ellen Harrison, Themis' },
  { text: '"The mystery is not something you understand; it is something that happens to you."', source: 'Jane Ellen Harrison' },

  /* Cyrus H. Gordon */
  { text: '"The Mediterranean was a bridge, not a barrier."', source: 'Cyrus H. Gordon' },
  { text: '"The Minoan and Semitic worlds were not isolated; they were in constant dialogue."', source: 'Cyrus H. Gordon' },
  { text: '"To understand the ancient world, you must cross the disciplinary boundaries that divide it."', source: 'Cyrus H. Gordon' },

  /* Michael C. Astour */
  { text: '"Etymology is the archaeology of language."', source: 'Michael C. Astour' },
  { text: '"The Bronze Age Mediterranean knew no borders\u2014only ports."', source: 'Michael C. Astour, Hellenosemitica' },
];

let _quoteIndex = Math.floor(Math.random() * QUOTES.length);
let _quoteInterval = null;

function _cycleQuote() {
  _quoteIndex = (_quoteIndex + 1) % QUOTES.length;
  const el = document.querySelector('.home-quote');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => {
    const textEl = el.querySelector('.home-quote-text');
    const srcEl = el.querySelector('.home-quote-source');
    if (textEl) textEl.textContent = QUOTES[_quoteIndex].text;
    if (srcEl) srcEl.textContent = '\u2014 ' + QUOTES[_quoteIndex].source;
    el.style.opacity = '1';
  }, 300);
}

function _startQuoteCycling() {
  if (_quoteInterval) clearInterval(_quoteInterval);
  _quoteInterval = setInterval(_cycleQuote, 5 * 60 * 1000);
}

function _stopQuoteCycling() {
  if (_quoteInterval) { clearInterval(_quoteInterval); _quoteInterval = null; }
}

function _getQuoteHtml() {
  const q = QUOTES[_quoteIndex];
  return `<blockquote class="home-quote">
    <button class="home-quote-refresh" data-action="refresh-quote" title="Next quote">
      <i class="ph ph-arrows-clockwise"></i>
    </button>
    <p class="home-quote-text">${escapeHtml(q.text)}</p>
    <cite class="home-quote-source">\u2014 ${escapeHtml(q.source)}</cite>
  </blockquote>`;
}

/* ── File Browser (legacy compat + pick dir) ─────────── */
async function browsePickDir() {
  try {
    const res = await fetch('/api/browse-folder', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}' });
    const data = await res.json();
    if (data.folderpath) {
      if (_activeWorkspace) {
        /* If workspace active, add this folder to it */
        await addFolderToWorkspace(data.folderpath);
      } else {
        /* Legacy single-folder mode */
        setWorkspace(data.folderpath);
      }
    }
  } catch (e) {}
}

/* ── Helpers ─────────────────────────────────────────── */
let _osHomeCache = null;
function getOsHome() {
  if (_osHomeCache) return _osHomeCache;
  const first = Object.values(tabs)[0];
  if (first && first.filepath) {
    const parts = first.filepath.split('/');
    if (parts.length > 3) { _osHomeCache = '/' + parts[1] + '/' + parts[2]; return _osHomeCache; }
  }
  return '/Users';
}
Object.defineProperty(window, 'os_home', { get: getOsHome });

function _formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'k';
  return (bytes / (1024 * 1024)).toFixed(1) + 'M';
}

let _recentFileOpening = false;
async function openRecentFile(filepath) {
  if (_recentFileOpening) return;
  _recentFileOpening = true;
  try {
    const res = await fetch('/api/add', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ filepath: filepath })
    });
    const data = await res.json();
    if (data.id) {
      hideHomeScreen();
      if (!tabs[data.id]) {
        tabs[data.id] = { filepath: data.filepath, filename: data.filename, content: '', mtime: 0, scrollY: 0 };
      }
      activeTabId = data.id;
      renderTabBar();
      await fetchTabContent(data.id);
      document.getElementById('status-filepath').textContent = tabs[data.id].filepath;
      localStorage.setItem('dabarat-active-tab', data.id);
    }
  } catch (e) {
    console.error('Failed to open file:', e);
  } finally {
    _recentFileOpening = false;
  }
}

async function removeRecentFile(filepath, cardEl) {
  try {
    await fetch('/api/recent/remove', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ path: filepath })
    });
    if (cardEl) {
      /* Animate out with Motion One */
      if (window.Motion && !_prefersReducedMotion) {
        await Motion.animate(cardEl,
          { opacity: 0, x: 40, scale: 0.95 },
          { duration: 0.2, easing: 'ease-in' }
        ).finished;
        cardEl.remove();
      } else {
        cardEl.style.transition = 'opacity 0.2s, transform 0.2s';
        cardEl.style.opacity = '0';
        cardEl.style.transform = 'translateX(20px)';
        setTimeout(() => cardEl.remove(), 200);
      }
      if (!document.querySelector('.home-card')) {
        const content = document.getElementById('content');
        _renderHomeContent(content, [], _homeViewMode === 'recent' ? 'Recent Files' : 'Workspace');
      }
    }
  } catch (e) {
    console.error('Failed to remove recent file:', e);
  }
}

/* ── Workspace Lifecycle ─────────────────────────────── */

async function createWorkspace() {
  try {
    /* Get save location via macOS dialog */
    const saveRes = await fetch('/api/workspace/save-as', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ name: 'My Workspace' })
    });
    const saveData = await saveRes.json();
    if (saveData.cancelled || !saveData.filepath) return;

    /* Pre-populate with current browse dir if set */
    const folders = _fileBrowserPath ? [{ path: _fileBrowserPath }] : [];
    const name = saveData.filepath.split('/').pop().replace(/\.dabarat-workspace$/, '') || 'My Workspace';

    const res = await fetch('/api/workspace', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ path: saveData.filepath, name, folders })
    });
    const data = await res.json();
    if (data.workspace) {
      _activeWorkspace = data.workspace;
      _activeWorkspacePath = data.path;
      localStorage.setItem('dabarat-workspace-path', data.path);
      _renderWorkspaceSidebar();
      await _loadWorkspaceMultiRoot();
    }
  } catch (e) {
    console.error('Failed to create workspace:', e);
  }
}

async function openWorkspace(wsPath) {
  try {
    let path = wsPath;
    if (!path) {
      /* macOS file picker for .dabarat-workspace files */
      const res = await fetch('/api/browse', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}' });
      const data = await res.json();
      if (!data.filepath) return;
      path = data.filepath;
    }
    const res = await fetch('/api/workspace/open', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ path })
    });
    const data = await res.json();
    if (data.workspace) {
      _activeWorkspace = data.workspace;
      _activeWorkspacePath = data.path;
      localStorage.setItem('dabarat-workspace-path', data.path);
      _renderWorkspaceSidebar();
      await _loadWorkspaceMultiRoot();
    }
  } catch (e) {
    console.error('Failed to open workspace:', e);
  }
}

async function closeWorkspace() {
  try {
    await fetch('/api/workspace/close', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: '{}'
    });
    _activeWorkspace = null;
    _activeWorkspacePath = null;
    localStorage.removeItem('dabarat-workspace-path');
    _renderWorkspaceSidebar();
    if (_fileBrowserPath) {
      await _loadWorkspaceView(_fileBrowserPath);
    } else {
      await _loadRecentView();
    }
  } catch (e) {
    console.error('Failed to close workspace:', e);
  }
}

async function addFolderToWorkspace(folderPath) {
  if (!folderPath) {
    try {
      const res = await fetch('/api/browse-folder', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}' });
      const data = await res.json();
      if (data.cancelled || !data.folderpath) return;
      folderPath = data.folderpath;
    } catch (e) { return; }
  }
  try {
    const res = await fetch('/api/workspace/add-folder', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ path: folderPath })
    });
    const data = await res.json();
    if (data.workspace) {
      _activeWorkspace = data.workspace;
      _renderWorkspaceSidebar();
      await _loadWorkspaceMultiRoot();
    }
  } catch (e) {
    console.error('Failed to add folder:', e);
  }
}

async function addFileToWorkspace() {
  try {
    const browseRes = await fetch('/api/browse-file', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}' });
    const browseData = await browseRes.json();
    if (browseData.cancelled || !browseData.filepath) return;

    const res = await fetch('/api/workspace/add-file', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ path: browseData.filepath })
    });
    const data = await res.json();
    if (data.workspace) {
      _activeWorkspace = data.workspace;
      _renderWorkspaceSidebar();
      await _loadWorkspaceMultiRoot();
    }
  } catch (e) {
    console.error('Failed to add file:', e);
  }
}

async function removeFromWorkspace(entryPath, entryType) {
  try {
    const res = await fetch('/api/workspace/remove', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ path: entryPath, type: entryType })
    });
    const data = await res.json();
    if (data.workspace) {
      _activeWorkspace = data.workspace;
      _renderWorkspaceSidebar();
      await _loadWorkspaceMultiRoot();
    }
  } catch (e) {
    console.error('Failed to remove from workspace:', e);
  }
}

/* ── Multi-Root Workspace View ──────────────────────── */
async function _loadWorkspaceMultiRoot() {
  const content = document.getElementById('content');
  if (!content || !_activeWorkspace) return;

  content.innerHTML = '<div class="home-loading"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div></div>';

  /* Fan out one browse-dir per folder root + one file-metadata per pinned file */
  const folderPromises = (_activeWorkspace.folders || []).map(async (f) => {
    try {
      const res = await fetch('/api/browse-dir?path=' + encodeURIComponent(f.path));
      const data = await res.json();
      return { folder: f, data, error: data.error };
    } catch (e) {
      return { folder: f, data: null, error: e.message };
    }
  });

  const filePromises = (_activeWorkspace.files || []).map(async (f) => {
    try {
      const res = await fetch('/api/file-metadata?path=' + encodeURIComponent(f.path));
      const data = await res.json();
      return { ...data, type: 'file' };
    } catch (e) {
      return { path: f.path, name: f.path.split('/').pop(), type: 'file' };
    }
  });

  const [folderResults, fileResults] = await Promise.all([
    Promise.all(folderPromises),
    Promise.all(filePromises)
  ]);

  /* Build sectioned HTML */
  const home = os_home || '/Users';
  let sectionsHtml = '';

  folderResults.forEach(({ folder, data, error }) => {
    const files = data && !error ? data.entries.filter(e => e.type === 'file') : [];
    const stats = data && data.stats ? `${data.stats.fileCount} files &middot; ${data.stats.totalWords.toLocaleString()} words` : '';
    const cards = files.map((e, i) => _buildCard(e, i)).join('');

    sectionsHtml += `<div class="home-section">
      <div class="home-section-header">
        <h2 class="home-section-title">${escapeHtml(folder.name || folder.path.split('/').pop())}</h2>
        <span class="home-section-stats">${stats}</span>
        <button class="home-section-remove" data-path="${escapeHtml(folder.path)}" data-type="folder" title="Remove folder from workspace">
          <i class="ph ph-x"></i>
        </button>
      </div>
      ${files.length ? `<div class="home-grid">${cards}</div>` : '<div class="home-section-empty">No markdown files</div>'}
    </div>`;
  });

  /* Pinned files section */
  if (fileResults.length) {
    const cards = fileResults.map((e, i) => _buildCard(e, i)).join('');
    sectionsHtml += `<div class="home-section">
      <div class="home-section-header">
        <h2 class="home-section-title">Files</h2>
      </div>
      <div class="home-grid">${cards}</div>
    </div>`;
  }

  if (!sectionsHtml) {
    sectionsHtml = `<div class="home-empty">
      <i class="ph ph-files"></i>
      <h2>Empty Workspace</h2>
      <p>Add folders or files to get started</p>
      <button class="home-open-btn" data-action="add-folder-ws">
        <i class="ph ph-folder-plus"></i> Add Folder
      </button>
    </div>`;
  }

  content.innerHTML = `<div class="home-screen">
    <div class="home-header">
      <div>
        <h1 class="home-title">${escapeHtml(_activeWorkspace.name || 'Workspace')}</h1>
      </div>
      <div class="home-actions">
        <button class="home-action-btn" data-action="add-folder-ws">
          <i class="ph ph-folder-plus"></i> Add Folder
        </button>
        <button class="home-action-btn" data-action="add-file-ws">
          <i class="ph ph-file-plus"></i> Add File
        </button>
      </div>
    </div>
    ${sectionsHtml}
  </div>`;

  /* Attach action button listeners */
  content.querySelectorAll('[data-action="add-folder-ws"]').forEach(btn =>
    btn.addEventListener('click', () => addFolderToWorkspace())
  );
  content.querySelectorAll('[data-action="add-file-ws"]').forEach(btn =>
    btn.addEventListener('click', () => addFileToWorkspace())
  );

  /* Attach section remove buttons */
  content.querySelectorAll('.home-section-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromWorkspace(btn.dataset.path, btn.dataset.type);
    });
  });

  /* Attach card event listeners */
  content.querySelectorAll('.home-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.home-card-remove')) return;
      openRecentFile(card.dataset.filepath);
    });
  });

  /* Attach card remove buttons */
  content.querySelectorAll('.home-card-remove').forEach(btn => {
    const card = btn.closest('.home-card');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (card) removeRecentFile(card.dataset.filepath, card);
    });
  });

  /* Animate */
  if (window.Motion && !_prefersReducedMotion) {
    const sections = content.querySelectorAll('.home-section');
    if (sections.length) {
      Motion.animate(sections,
        { opacity: [0, 1], y: [16, 0] },
        { delay: Motion.stagger(0.08), duration: 0.35, easing: 'ease-out' }
      );
    }
  }
}

/* ── Restore Workspace on Load ──────────────────────── */
async function _restoreWorkspace() {
  if (!_activeWorkspacePath) return false;
  try {
    const res = await fetch('/api/workspace/open', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ path: _activeWorkspacePath })
    });
    const data = await res.json();
    if (data.workspace) {
      _activeWorkspace = data.workspace;
      return true;
    }
  } catch (e) {}
  /* Workspace file gone — clear stale reference */
  _activeWorkspacePath = null;
  localStorage.removeItem('dabarat-workspace-path');
  return false;
}

/* Refresh relative timestamps every minute */
setInterval(() => {
  if (!homeScreenActive) return;
  document.querySelectorAll('.home-card-time[data-timestamp]').forEach(el => {
    el.textContent = _homeTimeAgo(el.dataset.timestamp);
  });
}, 60000);
