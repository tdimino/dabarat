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

  /* Update TOC label */
  if (tocLabel) tocLabel.textContent = 'Workspace';

  const content = document.getElementById('content');
  content.style.display = '';
  content.innerHTML = '<div class="home-loading"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div></div>';

  /* Build workspace sidebar in TOC */
  _renderWorkspaceSidebar();

  /* Load view */
  if (_homeViewMode === 'recent' || !_fileBrowserPath) {
    await _loadRecentView();
  } else {
    await _loadWorkspaceView(_fileBrowserPath);
  }
}

function hideHomeScreen() {
  homeScreenActive = false;
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

  const home = os_home || '/Users';
  const shortPath = _fileBrowserPath ? _fileBrowserPath.replace(home, '~') : '~/';
  const statsHtml = _workspaceStats
    ? `<div class="ws-stats">${_workspaceStats.fileCount} files &middot; ${_workspaceStats.totalWords.toLocaleString()} words</div>`
    : '';

  tocScroll.innerHTML = `
    <div class="ws-header">
      <div class="ws-path" title="${escapeHtml(_fileBrowserPath || '')}">${escapeHtml(shortPath)}</div>
      <div class="ws-actions">
        <button class="ws-btn" onclick="browsePickDir()" title="Open Folder">
          <i class="ph ph-folder-open"></i> Open
        </button>
        <button class="ws-btn ${_homeViewMode === 'workspace' ? 'active' : ''}" onclick="setHomeView('workspace')" title="Workspace">
          <i class="ph ph-folder"></i>
        </button>
        <button class="ws-btn ${_homeViewMode === 'recent' ? 'active' : ''}" onclick="setHomeView('recent')" title="Recent">
          <i class="ph ph-clock-counter-clockwise"></i>
        </button>
      </div>
    </div>
    ${statsHtml}
    <div id="ws-file-list"></div>
  `;

  /* Populate file list if we have a workspace path */
  if (_fileBrowserPath) {
    _loadWorkspaceSidebarEntries(_fileBrowserPath);
  }
}

async function _loadWorkspaceSidebarEntries(dirPath) {
  const list = document.getElementById('ws-file-list');
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
  } else {
    if (_fileBrowserPath) {
      await _loadWorkspaceView(_fileBrowserPath);
    } else {
      await _loadRecentView();
    }
  }

  /* Update sidebar button states */
  document.querySelectorAll('.ws-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = mode === 'workspace'
    ? document.querySelector('.ws-btn[onclick*="workspace"]')
    : document.querySelector('.ws-btn[onclick*="recent"]');
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
    const res = await fetch('/api/recent');
    const data = await res.json();
    _renderHomeContent(content, data.entries || [], 'Recent Files');
  } catch (e) {
    _renderHomeContent(content, [], 'Recent Files');
  }
}

/* ── Render Home Content ─────────────────────────────── */
function _renderHomeContent(content, entries, title, browseData) {
  if (!content) return;

  const home = os_home || '/Users';
  const pathDisplay = browseData ? browseData.path.replace(home, '~') : '';
  const statsHtml = browseData && browseData.stats
    ? `<span class="home-workspace-stats">${browseData.stats.fileCount} files &middot; ${browseData.stats.totalWords.toLocaleString()} words</span>`
    : '';

  const emptyState = entries.length === 0
    ? `<div class="home-empty">
        <i class="ph ph-files"></i>
        <h2>${title === 'Recent Files' ? 'No Recent Files' : 'No Files Found'}</h2>
        <p>Open a markdown file or browse a workspace to get started</p>
        <button class="home-open-btn" onclick="showAddFileInput()">
          <i class="ph ph-plus"></i> Open File
        </button>
      </div>`
    : '';

  const cards = entries.map((e, i) => _buildCard(e, i)).join('');

  content.innerHTML = `<div class="home-screen">
    <div class="home-header">
      <div>
        <h1 class="home-title">${escapeHtml(title)}</h1>
        ${pathDisplay ? `<div class="home-workspace-path">${escapeHtml(pathDisplay)} ${statsHtml}</div>` : ''}
      </div>
      <div class="home-actions">
        <button class="home-action-btn" onclick="showAddFileInput()">
          <i class="ph ph-file-plus"></i> Open File
        </button>
      </div>
    </div>
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
      const rendered = marked.parse(e.preview, { breaks: false, gfm: true });
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

  /* Description: frontmatter description > frontmatter summary > server summary */
  const desc = (fm && fm.description) || (fm && fm.summary) || e.summary || '';
  const descHtml = desc ? `<p class="home-card-desc">${escapeHtml(desc)}</p>` : '';

  const timestamp = e.lastOpened || (e.mtime ? new Date(e.mtime * 1000).toISOString() : '');
  const timeDisplay = timestamp ? _homeTimeAgo(timestamp) : '';

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
          ${timeDisplay ? `<span class="home-card-time" data-timestamp="${escapeHtml(timestamp)}">${timeDisplay}</span>` : ''}
        </div>
        <p class="home-card-path">${escapeHtml((e.path || '').replace(os_home, '~'))}</p>
      </div>
      ${fmBadges ? `<div class="home-card-badges">${fmBadges}</div>` : ''}
      ${descHtml}
      ${previewHtml}
      <div class="home-card-footer">
        ${e.wordCount ? `<span><i class="ph ph-text-aa"></i> ${e.wordCount.toLocaleString()}</span>` : ''}
        ${e.annotationCount ? `<span><i class="ph ph-chat-dots"></i> ${e.annotationCount}</span>` : ''}
        ${e.versionCount ? `<span><i class="ph ph-clock-counter-clockwise"></i> ${e.versionCount}</span>` : ''}
        ${tagPills ? `<div class="home-card-tags">${tagPills}</div>` : ''}
      </div>
    </div>
  </article>`;
}

/* ── File Browser (legacy compat + pick dir) ─────────── */
async function browsePickDir() {
  try {
    const res = await fetch('/api/browse', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}' });
    const data = await res.json();
    if (data.filepath) {
      const dir = data.filepath.replace(/\/[^/]+$/, '');
      setWorkspace(dir);
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

/* Refresh relative timestamps every minute */
setInterval(() => {
  if (!homeScreenActive) return;
  document.querySelectorAll('.home-card-time[data-timestamp]').forEach(el => {
    el.textContent = _homeTimeAgo(el.dataset.timestamp);
  });
}, 60000);
