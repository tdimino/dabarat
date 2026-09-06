/* ── Polling ──────────────────────────────────────────── */
const POLL_ACTIVE_MS = 500;
const POLL_TABS_MS = 2000;
const POLL_HIDDEN_MS = 5000;   /* background tab: a slow heartbeat, not silence */
let lastTabsCheck = 0;
let _editProbeFailures = 0;
/* One poll chain only: every setTimeout(poll) goes through _schedulePoll so
   visibilitychange can cancel the pending tick and fire immediately, and
   _pollInFlight stops that immediate call from forking a second chain */
let _pollTimer = null;
let _pollInFlight = false;

function _schedulePoll(ms) {
  clearTimeout(_pollTimer);
  _pollTimer = setTimeout(poll, ms);
}

/* Conditional content fetch: the server answers {unchanged:true} when the
   changeKey we hold is still current, so an idle document costs bytes,
   not the whole body, twice a second */
function _contentUrl(id) {
  const key = tabs[id] && tabs[id].changeKey;
  return '/api/content?tab=' + id + (key ? '&since=' + encodeURIComponent(key) : '');
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    _editProbeFailures = 0;
    _hideServerUnreachableBanner();
    /* Catch up at once rather than waiting out the hidden interval */
    if (!_pollInFlight) { clearTimeout(_pollTimer); poll(); }
  }
});

async function poll() {
  if (_pollInFlight) return;
  _pollInFlight = true;
  try {
    await _pollOnce();
  } finally {
    _pollInFlight = false;
  }
}

async function _pollOnce() {
  /* Full polling pauses during diff/edit mode, but edit mode keeps a
     lightweight stat-only watch so external changes surface immediately */
  if (diffState.active || editState.active) {
    if (editState.active && activeTabId && tabs[activeTabId] && !document.hidden) {
      try {
        const res = await fetch('/api/mtime?tab=' + activeTabId);
        const data = await res.json();
        _editProbeFailures = 0;
        _hideServerUnreachableBanner();
        if (!data.error) {
          /* Every successful probe re-syncs ghost state, so a recreated
             file clears its strikethrough during edit mode too */
          _setTabGhost(activeTabId, !!data.fileMissing);
          _setTabFileError(activeTabId, data.statError || null);
        }
        if (!data.fileMissing && data.changeKey && data.changeKey !== tabs[activeTabId].changeKey) {
          _showExternalChangeBanner();
        }
      } catch(e) {
        /* ~3s of consecutive failures → warn; single hiccups stay quiet */
        _editProbeFailures++;
        if (_editProbeFailures >= 6) _showServerUnreachableBanner();
      }
    }
    /* Detect tabs added externally (e.g. via --add) even during edit mode */
    const now = Date.now();
    if (editState.active && now - lastTabsCheck >= POLL_TABS_MS) {
      lastTabsCheck = now;
      try {
        const res = await fetch('/api/tabs');
        const tabList = await res.json();
        let changed = false;
        tabList.forEach(t => {
          if (!tabs[t.id] && !_closePending.has(t.id)) {
            tabs[t.id] = { filepath: t.filepath, filename: t.filename, content: '', mtime: 0, scrollY: 0 };
            changed = true;
            fetchTabContent(t.id);
          }
        });
        if (changed) renderTabBar();
      } catch(e) {}
    }
    _schedulePoll(document.hidden ? POLL_HIDDEN_MS : POLL_ACTIVE_MS);
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
    _schedulePoll(document.hidden ? POLL_HIDDEN_MS : POLL_ACTIVE_MS);
    return;
  }

  /* Background window: keep the heartbeat (a change should still be
     rendered by the time the user comes back) but stop hammering */
  if (document.hidden) {
    _schedulePoll(POLL_HIDDEN_MS);
    return;
  }
  const now = Date.now();

  /* Always poll active tab content (fast) */
  if (activeTabId && tabs[activeTabId]) {
    try {
      const res = await fetch(_contentUrl(activeTabId));
      const data = await res.json();
      _editProbeFailures = 0;
      _hideServerUnreachableBanner();
      if (!data.error) {
        _setTabGhost(activeTabId, !!data.fileMissing);
        _setTabFileError(activeTabId, data.fileError || null);
      }
      if (!data.error && !data.unchanged && data.changeKey !== tabs[activeTabId].changeKey) {
        tabs[activeTabId].content = data.content;
        tabs[activeTabId].body = data.body;
        tabs[activeTabId].mtime = data.mtime;
        tabs[activeTabId].changeKey = data.changeKey;
        currentFrontmatter = data.frontmatter || null;
        tabs[activeTabId].frontmatter = currentFrontmatter;
        render(tabBody(tabs[activeTabId]));
        /* The server snapshotted this external change — flag it unseen,
           and refresh an open panel rather than dotting the toggle the
           user is already looking past */
        historySeen.markUnseen(tabs[activeTabId].filepath);
        if (typeof gutterMode !== 'undefined' && gutterMode === 'versions') {
          loadVersionHistory();
        }
      }
    } catch (e) {
      /* Read mode has no save at risk, but live reload going dark for
         ~3s straight deserves the same banner edit mode gets */
      _editProbeFailures++;
      if (_editProbeFailures >= 6) {
        _showServerUnreachableBanner(
          'Server unreachable — live reload and external-change detection are paused.');
      }
    }
  }
  /* Keep the toggle's unseen dot in sync with the active tab */
  _updateHistoryDot();

  /* Check for new/removed tabs and poll inactive tab mtimes less frequently */
  if (now - lastTabsCheck >= POLL_TABS_MS) {
    lastTabsCheck = now;

    /* Poll inactive tabs */
    const inactiveIds = Object.keys(tabs).filter(id => id !== activeTabId);
    if (inactiveIds.length > 0) {
      await Promise.all(
        inactiveIds.map(id =>
          fetch(_contentUrl(id))
            .then(r => r.json())
            .then(data => {
              if (!tabs[id]) return;   /* closed while the fetch was in flight */
              if (!data.error) _setTabGhost(id, !!data.fileMissing);
              if (!data.error && !data.unchanged && data.changeKey !== tabs[id].changeKey) {
                tabs[id].content = data.content;
                tabs[id].body = data.body;
                tabs[id].mtime = data.mtime;
                tabs[id].changeKey = data.changeKey;
                tabs[id].frontmatter = data.frontmatter || null;
                historySeen.markUnseen(tabs[id].filepath);
                /* The global feed spans files — keep an open one live */
                if (typeof gutterMode !== 'undefined' && gutterMode === 'versions'
                    && versionPanelMode === 'global') {
                  loadGlobalActivity();
                }
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
        /* _closePending guards a poll fetch that was already in flight
           when a close deleted the tab locally — the stale response must
           not resurrect it (tabs.js owns the set) */
        if (!tabs[t.id] && !_closePending.has(t.id)) {
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
              currentFrontmatter = tabs[activeTabId].frontmatter || null;
              render(tabBody(tabs[activeTabId]));
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

  _schedulePoll(POLL_ACTIVE_MS);
}
