/* ── Frontmatter Helpers ────────────────────────────── */
/* Find an open tab whose frontmatter name/slug matches a given slug */
function _findTabBySlug(slug) {
  if (!slug) return null;
  for (const [id, tab] of Object.entries(tabs)) {
    const fm = tab.frontmatter;
    if (fm && (fm.name === slug || fm.slug === slug)) return id;
  }
  return null;
}

/* Compute children: other open tabs whose parent field matches this name/slug */
function _findChildren(thisName) {
  if (!thisName) return [];
  const children = [];
  for (const [id, tab] of Object.entries(tabs)) {
    if (id === activeTabId) continue;
    const fm = tab.frontmatter;
    if (fm && fm.parent === thisName) children.push({ id, name: fm.name || fm.slug || tab.filename });
  }
  return children;
}

/* ── Frontmatter Indicator Bar ───────────────────────── */
/* Type-to-accent color mapping */
const FM_ACCENT_COLORS = {
  'prompt': 'var(--ctp-mauve)',
  'chat': 'var(--ctp-blue)',
  'plan': 'var(--ctp-peach)',
  'spec': 'var(--ctp-teal)',
  'research': 'var(--ctp-sapphire)',
  'skill': 'var(--ctp-green)',
  'text': 'var(--ctp-green)',
  'code': 'var(--ctp-peach)',
};

function renderFrontmatterIndicator(fm) {
  const existing = document.getElementById('frontmatter-indicator');
  if (existing) existing.remove();
  if (!fm || Object.keys(fm).length === 0) return;

  const bar = document.createElement('div');
  bar.id = 'frontmatter-indicator';
  bar.className = 'fm-indicator';
  bar.title = 'Click to view frontmatter';
  bar.addEventListener('click', () => showFrontmatterPopup(fm));

  /* Set type-keyed accent color */
  const accent = FM_ACCENT_COLORS[fm.type] || 'var(--ctp-mauve)';
  bar.style.setProperty('--fm-accent', accent);

  const name = fm.name || fm.slug || 'frontmatter';

  /* Build chips */
  const chips = [];
  if (fm.version != null) chips.push('<span class="fm-ind-detail version">v' + fm.version + '</span>');
  if (fm.type) chips.push('<span class="fm-ind-detail type">' + fm.type + '</span>');
  if (fm.model) chips.push('<span class="fm-ind-detail model">' + fm.model + '</span>');
  if (fm.temperature != null) chips.push('<span class="fm-ind-detail temperature">t=' + fm.temperature + '</span>');
  const vars = fm.variables;
  if (Array.isArray(vars) && vars.length > 0) chips.push('<span class="fm-ind-detail">{{' + vars.length + '}}</span>');
  const deps = fm.depends_on || [];
  if (deps.length > 0) chips.push('<span class="fm-ind-detail">' + deps.length + 'd</span>');

  /* Lineage chips */
  const lineageChips = [];
  if (fm.parent) {
    const parentTabId = _findTabBySlug(fm.parent);
    if (parentTabId) {
      lineageChips.push('<span class="fm-ind-link" data-nav-tab="' + parentTabId + '" title="Go to parent: ' + escapeHtml(fm.parent) + '"><i class="ph ph-arrow-elbow-left-up"></i> ' + escapeHtml(fm.parent) + '</span>');
    } else {
      lineageChips.push('<span class="fm-ind-detail"><i class="ph ph-arrow-elbow-left-up"></i> ' + escapeHtml(fm.parent) + '</span>');
    }
  }
  const children = _findChildren(name);
  children.forEach(c => {
    lineageChips.push('<span class="fm-ind-link" data-nav-tab="' + c.id + '" title="Go to child: ' + escapeHtml(c.name) + '"><i class="ph ph-arrow-elbow-right-down"></i> ' + escapeHtml(c.name) + '</span>');
  });

  bar.innerHTML =
    '<span class="fm-ind-left">' +
      '<i class="ph ph-file-code fm-ind-icon"></i>' +
      '<span class="fm-ind-name">' + escapeHtml(name) + '</span>' +
    '</span>' +
    (chips.length ? '<span class="fm-ind-sep"></span><span class="fm-ind-chips">' + chips.join('') + '</span>' : '') +
    (lineageChips.length ? '<span class="fm-ind-sep"></span><span class="fm-ind-chips">' + lineageChips.join('') + '</span>' : '') +
    '<span class="fm-ind-expand">\u2197 details</span>';

  /* Attach click handlers to navigable lineage chips */
  bar.querySelectorAll('.fm-ind-link[data-nav-tab]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      switchTab(el.dataset.navTab);
    });
  });

  const content = document.getElementById('content');
  content.parentNode.insertBefore(bar, content);
}

/* ── Frontmatter Popup ──────────────────────────────── */
function showFrontmatterPopup(fm) {
  if (!fm) fm = currentFrontmatter;
  if (!fm || Object.keys(fm).length === 0) return;

  /* Remove existing popup */
  const existing = document.getElementById('fm-popup-backdrop');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'fm-popup-backdrop';
  backdrop.className = 'fm-popup-backdrop';

  function closeFmPopup() {
    const doRemove = () => {
      backdrop.remove();
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
    if (window.Motion && !_prefersReducedMotion) {
      Motion.animate(popup, { scale: 0.98, opacity: 0 }, { duration: 0.15, easing: 'ease-in' })
        .finished.then(doRemove).catch(doRemove);
    } else {
      doRemove();
    }
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeFmPopup();
  });

  /* Lock page scroll while popup is open */
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  const popup = document.createElement('div');
  popup.className = 'fm-popup';

  /* Header */
  const header = document.createElement('div');
  header.className = 'fm-popup-header';
  const title = document.createElement('span');
  title.className = 'fm-popup-title';
  title.textContent = fm.name || fm.slug || 'Frontmatter';
  header.appendChild(title);
  if (fm.version !== undefined && fm.version !== null) {
    const ver = document.createElement('span');
    ver.className = 'pmc-badge pmc-version';
    ver.textContent = 'v' + fm.version;
    header.appendChild(ver);
  }
  if (fm.type) {
    const typ = document.createElement('span');
    typ.className = 'pmc-badge pmc-type';
    typ.textContent = fm.type;
    header.appendChild(typ);
  }
  const closeBtn = document.createElement('button');
  closeBtn.className = 'fm-popup-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', closeFmPopup);
  header.appendChild(closeBtn);
  popup.appendChild(header);

  /* Body — render all frontmatter fields as a table */
  const body = document.createElement('div');
  body.className = 'fm-popup-body';

  /* Metadata row: model, temperature, labels */
  const metaFields = [];
  if (fm.model) metaFields.push(['model', fm.model]);
  if (fm.temperature !== undefined) metaFields.push(['temperature', fm.temperature]);
  if (fm.author) metaFields.push(['author', fm.author]);
  if (fm.created) metaFields.push(['created', String(fm.created)]);

  if (metaFields.length > 0) {
    const metaRow = document.createElement('div');
    metaRow.className = 'fm-popup-meta';
    metaFields.forEach(([k, v]) => {
      const item = document.createElement('div');
      item.className = 'fm-popup-meta-item';
      item.innerHTML = '<span class="fm-popup-key">' + k + '</span><span class="fm-popup-val">' + v + '</span>';
      metaRow.appendChild(item);
    });
    body.appendChild(metaRow);
  }

  /* Labels */
  const labels = fm.labels || [];
  if (labels.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'fm-popup-section';
    sec.innerHTML = '<div class="fm-popup-key">labels</div>';
    const pills = document.createElement('div');
    pills.className = 'fm-popup-pills';
    labels.forEach(l => {
      const p = document.createElement('span');
      p.className = 'pmc-label';
      p.textContent = l;
      pills.appendChild(p);
    });
    sec.appendChild(pills);
    body.appendChild(sec);
  }

  /* Tags */
  const fmTags = fm.tags || [];
  if (fmTags.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'fm-popup-section';
    sec.innerHTML = '<div class="fm-popup-key">tags</div>';
    const pills = document.createElement('div');
    pills.className = 'fm-popup-pills';
    fmTags.forEach(t => {
      const p = document.createElement('span');
      p.className = 'pmc-tag';
      p.textContent = '#' + t;
      pills.appendChild(p);
    });
    sec.appendChild(pills);
    body.appendChild(sec);
  }

  /* Variables table */
  const vars = fm.variables || [];
  if (vars.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'fm-popup-section';
    sec.innerHTML = '<div class="fm-popup-key">variables (' + vars.length + ')</div>';
    const table = document.createElement('table');
    table.className = 'fm-popup-var-table';
    table.innerHTML = '<thead><tr><th>name</th><th>type</th><th>default</th><th>required</th><th>description</th></tr></thead>';
    const tbody = document.createElement('tbody');
    vars.forEach(v => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="fm-var-name">' + (v.name || '') + '</td>' +
        '<td>' + (v.type || '') + '</td>' +
        '<td>' + (v.default !== undefined ? v.default : '') + '</td>' +
        '<td>' + (v.required ? 'yes' : '') + '</td>' +
        '<td class="fm-var-desc">' + (v.description || '') + '</td>';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    sec.appendChild(table);
    body.appendChild(sec);
  }

  /* Lineage — parent & children */
  const thisName = fm.name || fm.slug;
  const parentSlug = fm.parent;
  const childTabs = _findChildren(thisName);
  if (parentSlug || childTabs.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'fm-popup-section';
    sec.innerHTML = '<div class="fm-popup-key">lineage</div>';
    const pills = document.createElement('div');
    pills.className = 'fm-popup-pills';
    if (parentSlug) {
      const p = document.createElement('span');
      const parentTabId = _findTabBySlug(parentSlug);
      p.className = 'pmc-badge fm-lineage-link' + (parentTabId ? ' fm-nav' : '');
      p.innerHTML = '<i class="ph ph-arrow-elbow-left-up"></i> ' + escapeHtml(parentSlug);
      p.title = 'Parent prompt';
      if (parentTabId) {
        p.style.cursor = 'pointer';
        p.addEventListener('click', () => { closeFmPopup(); switchTab(parentTabId); });
      }
      pills.appendChild(p);
    }
    childTabs.forEach(c => {
      const p = document.createElement('span');
      p.className = 'pmc-badge fm-lineage-link fm-nav';
      p.innerHTML = '<i class="ph ph-arrow-elbow-right-down"></i> ' + escapeHtml(c.name);
      p.title = 'Child prompt';
      p.style.cursor = 'pointer';
      p.addEventListener('click', () => { closeFmPopup(); switchTab(c.id); });
      pills.appendChild(p);
    });
    sec.appendChild(pills);
    body.appendChild(sec);
  }

  /* depends_on */
  const deps = fm.depends_on || [];
  if (deps.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'fm-popup-section';
    sec.innerHTML = '<div class="fm-popup-key">depends_on</div>';
    const pills = document.createElement('div');
    pills.className = 'fm-popup-pills';
    deps.forEach(d => {
      const p = document.createElement('span');
      p.className = 'pmc-badge pmc-version';
      p.textContent = d;
      pills.appendChild(p);
    });
    sec.appendChild(pills);
    body.appendChild(sec);
  }

  /* Raw YAML fallback: show any other keys not already rendered */
  const shownKeys = new Set(['name', 'slug', 'version', 'type', 'model', 'temperature',
    'author', 'created', 'labels', 'tags', 'variables', 'depends_on', 'parent']);
  const extraKeys = Object.keys(fm).filter(k => !shownKeys.has(k));
  if (extraKeys.length > 0) {
    const sec = document.createElement('div');
    sec.className = 'fm-popup-section';
    sec.innerHTML = '<div class="fm-popup-key">other</div>';
    const pre = document.createElement('pre');
    pre.className = 'fm-popup-raw';
    const extra = {};
    extraKeys.forEach(k => { extra[k] = fm[k]; });
    pre.textContent = JSON.stringify(extra, null, 2);
    sec.appendChild(pre);
    body.appendChild(sec);
  }

  popup.appendChild(body);
  backdrop.appendChild(popup);
  document.body.appendChild(backdrop);

  /* Spring entrance for popup + stagger sections */
  if (window.Motion && !_prefersReducedMotion) {
    Motion.animate(popup,
      { scale: [0.96, 1], opacity: [0, 1] },
      { easing: Motion.spring({ stiffness: 300, damping: 22 }) }
    );
    const sections = popup.querySelectorAll('.fm-popup-section, .fm-popup-meta');
    if (sections.length) {
      Motion.animate(sections,
        { opacity: [0, 1], y: [8, 0] },
        { delay: Motion.stagger(0.04), duration: 0.2 }
      );
    }
  }

  /* Close on Escape */
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeFmPopup();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}
