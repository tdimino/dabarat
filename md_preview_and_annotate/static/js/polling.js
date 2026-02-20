/* ── Polling ──────────────────────────────────────────── */
const POLL_ACTIVE_MS = 500;
const POLL_TABS_MS = 2000;
let lastTabsCheck = 0;

async function poll() {
  /* Skip polling during diff mode or edit mode */
  if (diffState.active || editState.active) {
    setTimeout(poll, POLL_ACTIVE_MS);
    return;
  }

  /* On home screen, only check for new tabs added externally (via --add) */
  if (homeScreenActive) {
    try {
      const res = await fetch('/api/tabs');
      const tabList = await res.json();
      if (tabList.length > 0 && Object.keys(tabs).length === 0) {
        /* New tab appeared while on home screen — activate it */
        tabList.forEach(t => {
          tabs[t.id] = { filepath: t.filepath, filename: t.filename, content: '', mtime: 0, scrollY: 0 };
        });
        hideHomeScreen();
        activeTabId = tabList[0].id;
        renderTabBar();
        await fetchTabContent(activeTabId);
        document.getElementById('status-filepath').textContent = tabs[activeTabId].filepath;
      }
    } catch(e) {}
    setTimeout(poll, POLL_ACTIVE_MS);
    return;
  }
  const now = Date.now();

  /* Always poll active tab content (fast) */
  if (activeTabId && tabs[activeTabId]) {
    try {
      const res = await fetch('/api/content?tab=' + activeTabId);
      const data = await res.json();
      if (!data.error && data.mtime !== tabs[activeTabId].mtime) {
        tabs[activeTabId].content = data.content;
        tabs[activeTabId].mtime = data.mtime;
        currentFrontmatter = data.frontmatter || null;
        tabs[activeTabId].frontmatter = currentFrontmatter;
        render(data.content);
      }
    } catch (e) { /* ignore */ }
  }

  /* Check for new/removed tabs and poll inactive tab mtimes less frequently */
  if (now - lastTabsCheck >= POLL_TABS_MS) {
    lastTabsCheck = now;

    /* Poll inactive tabs */
    const inactiveIds = Object.keys(tabs).filter(id => id !== activeTabId);
    if (inactiveIds.length > 0) {
      await Promise.all(
        inactiveIds.map(id =>
          fetch('/api/content?tab=' + id)
            .then(r => r.json())
            .then(data => {
              if (!data.error && data.mtime !== tabs[id].mtime) {
                tabs[id].content = data.content;
                tabs[id].mtime = data.mtime;
                tabs[id].frontmatter = data.frontmatter || null;
              }
            })
            .catch(() => {})
        )
      );
    }

    /* Check for tabs added/removed externally */
    try {
      const res = await fetch('/api/tabs');
      const tabList = await res.json();
      let changed = false;
      tabList.forEach(t => {
        if (!tabs[t.id]) {
          tabs[t.id] = { filepath: t.filepath, filename: t.filename, content: '', mtime: 0, scrollY: 0 };
          changed = true;
          /* Immediately fetch content for new tab */
          fetchTabContent(t.id);
        }
      });
      const serverIds = new Set(tabList.map(t => t.id));
      for (const id of Object.keys(tabs)) {
        if (!serverIds.has(id)) {
          delete tabs[id];
          changed = true;
          if (id === activeTabId) {
            activeTabId = Object.keys(tabs)[0] || null;
            lastRenderedMd = '';
            if (activeTabId) {
              render(tabs[activeTabId].content);
              document.getElementById('status-filepath').textContent = tabs[activeTabId].filepath;
            }
          }
        }
      }
      if (changed) renderTabBar();
    } catch(e) {}
  }

  /* Poll annotations for active tab */
  if (activeTabId) {
    try {
      const res = await fetch('/api/annotations?tab=' + activeTabId);
      const data = await res.json();
      if (data.mtime !== (lastAnnotationMtimes[activeTabId] || 0)) {
        lastAnnotationMtimes[activeTabId] = data.mtime;
        annotationsCache[activeTabId] = data.annotations;
        renderAnnotations();
      }
    } catch(e) {}
  }

  setTimeout(poll, POLL_ACTIVE_MS);
}
