/* ── Home Screen ──────────────────────────────────────── */
let homeScreenActive = false;

/* Use shared formatTimeAgoShared from utils.js */
const _homeTimeAgo = formatTimeAgoShared;

async function showHomeScreen() {
  homeScreenActive = true;
  const content = document.getElementById('content');
  content.style.display = '';
  content.innerHTML = '<div class="home-loading"><div class="skeleton-line w60"></div><div class="skeleton-line w40"></div></div>';

  try {
    const res = await fetch('/api/recent');
    const data = await res.json();
    renderHomeScreen(data.entries || []);
  } catch (e) {
    renderHomeScreen([]);
  }
}

function hideHomeScreen() {
  homeScreenActive = false;
}

function renderHomeScreen(entries) {
  const content = document.getElementById('content');
  if (!content) return;

  if (entries.length === 0) {
    content.innerHTML = `<div class="home-empty">
      <i class="ph ph-files"></i>
      <h2>No Recent Files</h2>
      <p>Open a markdown file to get started</p>
      <button class="home-open-btn" onclick="document.getElementById('tab-add').click()">
        <i class="ph ph-plus"></i> Open File
      </button>
    </div>`;
    return;
  }

  const cards = entries.map((e, i) => {
    const tagPills = (e.tags || []).slice(0, 3).map(t =>
      `<span class="home-tag">${escapeHtml(t)}</span>`
    ).join('');
    return `<article class="home-card" style="animation-delay:${i * 50}ms">
      <div class="home-card-content" onclick="openRecentFile('${escapeHtml(e.path)}')">
        <h3 class="home-card-filename">${escapeHtml(e.filename)}</h3>
        <p class="home-card-path">${escapeHtml(e.path.replace(os_home, '~'))}</p>
        ${e.summary ? `<p class="home-card-summary">${escapeHtml(e.summary)}</p>` : ''}
        <div class="home-card-meta">
          ${e.wordCount ? `<span><i class="ph ph-text-aa"></i> ${e.wordCount.toLocaleString()}</span>` : ''}
          ${e.annotationCount ? `<span><i class="ph ph-chat-dots"></i> ${e.annotationCount}</span>` : ''}
          ${tagPills}
          <span class="home-card-time" data-timestamp="${e.lastOpened}">${_homeTimeAgo(e.lastOpened)}</span>
        </div>
      </div>
    </article>`;
  }).join('');

  content.innerHTML = `<div class="home-screen">
    <div class="home-header">
      <h1 class="home-title">Recent Files</h1>
    </div>
    <div class="home-grid">${cards}</div>
  </div>`;
}

/* Detect home directory for path shortening (lazy — tabs may be empty at parse time) */
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
/* Legacy alias for templates */
Object.defineProperty(window, 'os_home', { get: getOsHome });

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
      if (!tabs[data.id]) {
        tabs[data.id] = { filepath: data.filepath, filename: data.filename, content: '', mtime: 0, scrollY: 0 };
        await fetchTabContent(data.id);
      }
      switchTab(data.id);
      hideHomeScreen();
      renderTabBar();
    }
  } catch (e) {
    console.error('Failed to open recent file:', e);
  } finally {
    _recentFileOpening = false;
  }
}

/* Refresh relative timestamps every minute */
setInterval(() => {
  if (!homeScreenActive) return;
  document.querySelectorAll('.home-card-time[data-timestamp]').forEach(el => {
    el.textContent = _homeTimeAgo(el.dataset.timestamp);
  });
}, 60000);
