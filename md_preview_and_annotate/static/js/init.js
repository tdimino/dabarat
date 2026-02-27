/* ── Init ─────────────────────────────────────────────── */
async function init() {
  const res = await fetch('/api/tabs');
  const tabList = await res.json();

  tabList.forEach(t => {
    tabs[t.id] = { filepath: t.filepath, filename: t.filename, content: '', mtime: 0, scrollY: 0 };
  });

  /* Restore active tab: URL param (PDF export) > localStorage > first */
  const urlTab = new URLSearchParams(window.location.search).get('tab');
  const stored = localStorage.getItem('dabarat-active-tab');
  if (urlTab && tabs[urlTab]) {
    activeTabId = urlTab;
  } else if (stored && tabs[stored]) {
    activeTabId = stored;
  } else if (tabList.length > 0) {
    activeTabId = tabList[0].id;
  }

  renderTabBar();

  /* Fetch all content in parallel */
  await Promise.all(
    Object.keys(tabs).map(id =>
      fetch('/api/content?tab=' + id)
        .then(r => r.json())
        .then(data => {
          tabs[id].content = data.content;
          tabs[id].mtime = data.mtime;
          tabs[id].frontmatter = data.frontmatter || null;
          if (id === activeTabId) {
            currentFrontmatter = tabs[id].frontmatter;
          }
        })
        .catch(() => {})
    )
  );

  if (Object.keys(tabs).length === 0) {
    showHomeScreen();
  } else if (activeTabId && tabs[activeTabId]) {
    render(tabs[activeTabId].content);
    document.getElementById('status-filepath').textContent = tabs[activeTabId].filepath;
  }

  /* Fetch tags for all tabs */
  await Promise.all(Object.keys(tabs).map(id => fetchTags(id)));
  renderTagPills();

  initEditor();

  /* Signal render-complete for headless PDF export */
  if (document.documentElement.dataset.export === '1') {
    const sentinel = document.createElement('div');
    sentinel.id = 'dabarat-render-complete';
    document.body.appendChild(sentinel);
  } else {
    poll();
  }
}

init();
