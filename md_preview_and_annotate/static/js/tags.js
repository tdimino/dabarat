/* ── Tags ────────────────────────────────────────────── */
async function fetchTags(tabId) {
  try {
    const res = await fetch('/api/tags?tab=' + tabId);
    const data = await res.json();
    tagsCache[tabId] = data.tags || [];
  } catch (e) { /* ignore */ }
}

async function addTag(tabId, tag) {
  try {
    await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab: tabId, action: 'add', tag: tag })
    });
    if (!tagsCache[tabId]) tagsCache[tabId] = [];
    tag = tag.trim().toLowerCase();
    if (!tagsCache[tabId].includes(tag)) tagsCache[tabId].push(tag);
    renderTagPills();
  } catch (e) { /* ignore */ }
}

async function removeTag(tabId, tag) {
  try {
    await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tab: tabId, action: 'remove', tag: tag })
    });
    tag = tag.trim().toLowerCase();
    tagsCache[tabId] = (tagsCache[tabId] || []).filter(t => t !== tag);
    renderTagPills();
  } catch (e) { /* ignore */ }
}

function renderTagPills() {
  /* Status bar tag pills */
  const statusTags = document.getElementById('status-tags');
  if (statusTags) {
    statusTags.innerHTML = '';
    const fileTags = tagsCache[activeTabId] || [];
    fileTags.forEach(tag => {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      const c = CommandPalette.TAG_COLORS[tag] || CommandPalette.TAG_COLORS._default;
      pill.style.background = c.bg;
      pill.style.color = c.fg;
      pill.textContent = '#' + tag;
      statusTags.appendChild(pill);
    });
  }

  /* Tab bar tag dots */
  document.querySelectorAll('.tab').forEach(tabEl => {
    const id = tabEl.dataset.tab;
    tabEl.querySelectorAll('.tab-tag-dot').forEach(d => d.remove());
    const fileTags = tagsCache[id] || [];
    fileTags.slice(0, 3).forEach(tag => {
      const dot = document.createElement('span');
      dot.className = 'tab-tag-dot';
      const c = CommandPalette.TAG_COLORS[tag] || CommandPalette.TAG_COLORS._default;
      dot.style.background = c.fg;
      dot.title = '#' + tag;
      tabEl.insertBefore(dot, tabEl.querySelector('.tab-close'));
    });
  });
}
