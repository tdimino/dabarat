/* ── Variable Highlighting ───────────────────────────── */
function applyVariableHighlights(fm) {
  const content = document.getElementById('content');
  const varRegex = /(\{\{([a-zA-Z_][\w.]*?)\}\})|(\$\{([a-zA-Z_][\w.]*?)\})/g;
  const varDefs = (fm && fm.variables) || [];

  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement.closest('pre, code, .tpl-var-pill')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  /* Group matches by text node to handle multiple vars in one node */
  const nodeGroups = new Map();
  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent;
    let m;
    varRegex.lastIndex = 0;
    while ((m = varRegex.exec(text)) !== null) {
      const isMustache = !!m[1];
      if (!nodeGroups.has(node)) nodeGroups.set(node, []);
      nodeGroups.get(node).push({
        match: m[0], name: m[2] || m[4],
        index: m.index, syntax: isMustache ? 'mustache' : 'dollar'
      });
    }
  }

  if (nodeGroups.size === 0) return;

  function makePill(name, matchText, syntax) {
    const pill = document.createElement('span');
    pill.className = 'tpl-var-pill';
    pill.dataset.var = name;
    pill.dataset.syntax = syntax;
    pill.textContent = matchText;
    const varDef = varDefs.find(v => v.name === name);
    if (varDef) {
      const parts = [];
      if (varDef.type) parts.push(varDef.type);
      if (varDef.default !== undefined) parts.push('default: ' + varDef.default);
      if (varDef.description) parts.push(varDef.description);
      if (parts.length) pill.dataset.tooltip = parts.join(' \u00b7 ');
    }
    return pill;
  }

  /* Replace each text node with a fragment of text + pill nodes */
  for (const [textNode, nodeMatches] of nodeGroups) {
    nodeMatches.sort((a, b) => a.index - b.index);
    const frag = document.createDocumentFragment();
    const fullText = textNode.textContent;
    let cursor = 0;
    for (const m of nodeMatches) {
      if (m.index > cursor) {
        frag.appendChild(document.createTextNode(fullText.slice(cursor, m.index)));
      }
      frag.appendChild(makePill(m.name, m.match, m.syntax));
      cursor = m.index + m.match.length;
    }
    if (cursor < fullText.length) {
      frag.appendChild(document.createTextNode(fullText.slice(cursor)));
    }
    textNode.parentNode.replaceChild(frag, textNode);
  }
}

/* ── Variable Manifest Panel ────────────────────────── */

function switchGutterTab(tab) {
  activeGutterTab = tab;
  document.querySelectorAll('.gutter-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  const notesPanel = document.getElementById('gutter-panel-notes');
  const varsPanel = document.getElementById('gutter-panel-variables');
  if (notesPanel) notesPanel.style.display = tab === 'notes' ? '' : 'none';
  if (varsPanel) varsPanel.style.display = tab === 'variables' ? '' : 'none';
  if (tab === 'variables') renderVariables();
}

function renderVariables() {
  const toolbar = document.getElementById('variables-toolbar');
  const list = document.getElementById('variables-list');
  const previewBar = document.getElementById('variables-preview-bar');
  if (!list) return;

  const fm = currentFrontmatter;
  const declaredVars = (fm && fm.variables) || [];

  /* Query pills in content for usage counts + undeclared detection */
  const pills = document.querySelectorAll('.tpl-var-pill');
  const usageCounts = {};
  const allContentVars = new Set();
  pills.forEach(pill => {
    const name = pill.dataset.var;
    if (name) {
      usageCounts[name] = (usageCounts[name] || 0) + 1;
      allContentVars.add(name);
    }
  });

  const declaredNames = new Set(declaredVars.map(v => v.name));
  const undeclaredNames = [...allContentVars].filter(n => !declaredNames.has(n));

  /* Update count badge */
  const countEl = document.getElementById('var-gutter-count');
  const total = declaredVars.length + undeclaredNames.length;
  if (countEl) countEl.textContent = total > 0 ? total : '';

  list.innerHTML = '';

  /* Empty state */
  if (declaredVars.length === 0 && undeclaredNames.length === 0) {
    list.innerHTML = '<div class="var-hint">No template variables found.<br>Use <code>{{var}}</code> or <code>${var}</code> in your markdown.</div>';
    if (toolbar) toolbar.innerHTML = '';
    if (previewBar) previewBar.style.display = 'none';
    return;
  }

  /* Toolbar: Fill & Preview toggle */
  if (toolbar) {
    toolbar.innerHTML = '';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'var-fill-toggle' + (fillInMode ? ' active' : '');
    toggleBtn.innerHTML = '<i class="ph ph-pencil-simple"></i> Fill & Preview';
    toggleBtn.onclick = () => toggleFillInMode();
    toolbar.appendChild(toggleBtn);
  }

  /* Declared variable cards */
  declaredVars.forEach((v, i) => {
    list.appendChild(buildVariableCard(v, usageCounts[v.name] || 0, false, i));
  });

  /* Undeclared section */
  if (undeclaredNames.length > 0) {
    const hdr = document.createElement('div');
    hdr.className = 'var-section-header warning';
    hdr.textContent = 'Undeclared (' + undeclaredNames.length + ')';
    list.appendChild(hdr);
    undeclaredNames.forEach((name, i) => {
      list.appendChild(buildVariableCard({ name }, usageCounts[name] || 0, true, declaredVars.length + i));
    });
  }

  /* Preview bar */
  if (previewBar) {
    if (fillInMode) {
      previewBar.style.display = '';
      previewBar.innerHTML = '';
      const previewBtn = document.createElement('button');
      previewBtn.className = 'var-preview-btn primary';
      previewBtn.textContent = 'Preview';
      previewBtn.onclick = () => showVariablesPreview();
      const resetBtn = document.createElement('button');
      resetBtn.className = 'var-preview-btn ghost';
      resetBtn.textContent = 'Reset';
      resetBtn.onclick = () => resetFillInValues();
      previewBar.appendChild(previewBtn);
      previewBar.appendChild(resetBtn);
    } else {
      previewBar.style.display = 'none';
    }
  }
}

function buildVariableCard(varDef, usageCount, isUndeclared, index) {
  const card = document.createElement('div');
  card.className = 'var-card';
  card.style.animationDelay = (index * 0.03) + 's';

  const header = document.createElement('div');
  header.className = 'var-card-header';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'var-card-name';
  nameSpan.textContent = varDef.name;
  header.appendChild(nameSpan);

  if (varDef.type) {
    const tb = document.createElement('span');
    tb.className = 'var-card-badge type-' + varDef.type;
    tb.textContent = varDef.type;
    header.appendChild(tb);
  }
  if (varDef.required) {
    const rb = document.createElement('span');
    rb.className = 'var-card-badge required';
    rb.textContent = 'required';
    header.appendChild(rb);
  }
  if (isUndeclared) {
    const ub = document.createElement('span');
    ub.className = 'var-card-badge undeclared';
    ub.textContent = 'undeclared';
    header.appendChild(ub);
  }
  if (usageCount > 0) {
    const cb = document.createElement('span');
    cb.className = 'var-card-badge usage-count';
    cb.textContent = usageCount + '\u00d7';
    cb.title = 'Used ' + usageCount + ' time' + (usageCount !== 1 ? 's' : '') + ' in content';
    header.appendChild(cb);
  }

  card.appendChild(header);

  if (varDef.description) {
    const desc = document.createElement('div');
    desc.className = 'var-card-desc';
    desc.textContent = varDef.description;
    card.appendChild(desc);
  }

  if (varDef.default !== undefined && varDef.default !== null) {
    const def = document.createElement('div');
    def.className = 'var-card-default';
    def.innerHTML = '<span>default:</span> ' + escapeHtml(String(varDef.default));
    card.appendChild(def);
  }

  /* Fill-in input */
  if (fillInMode) {
    const wrap = document.createElement('div');
    wrap.className = 'var-card-input';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = varDef.default !== undefined ? String(varDef.default) : varDef.name;
    input.dataset.varName = varDef.name;
    input.value = fillInValues[varDef.name] || '';
    if (!fillInValues[varDef.name] && varDef.default !== undefined) {
      input.value = String(varDef.default);
      fillInValues[varDef.name] = String(varDef.default);
    }
    input.oninput = () => { fillInValues[varDef.name] = input.value; };
    input.onclick = (e) => e.stopPropagation();
    wrap.appendChild(input);
    card.appendChild(wrap);
  }

  card.onclick = () => highlightVariableInContent(varDef.name);
  return card;
}

function highlightVariableInContent(varName) {
  const pills = document.querySelectorAll('.tpl-var-pill[data-var="' + varName + '"]');
  if (pills.length === 0) return;
  pills[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  pills.forEach(pill => {
    pill.classList.add('var-highlight-pulse');
    setTimeout(() => pill.classList.remove('var-highlight-pulse'), 800);
  });
}

function toggleFillInMode() {
  fillInMode = !fillInMode;
  if (!fillInMode) fillInValues = {};
  renderVariables();
}

function resetFillInValues() {
  fillInValues = {};
  const vars = (currentFrontmatter && currentFrontmatter.variables) || [];
  vars.forEach(v => {
    if (v.default !== undefined) fillInValues[v.name] = String(v.default);
  });
  renderVariables();
}

function showVariablesPreview() {
  const tab = tabs[activeTabId];
  if (!tab) return;

  let md = lastRenderedMd;
  const allVars = { ...fillInValues };
  const vars = (currentFrontmatter && currentFrontmatter.variables) || [];
  vars.forEach(v => {
    if (allVars[v.name] === undefined && v.default !== undefined) {
      allVars[v.name] = String(v.default);
    }
  });

  for (const [name, value] of Object.entries(allVars)) {
    if (value === undefined || value === null) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const safeValue = value.replace(/\$/g, '$$$$');
    md = md.replace(new RegExp('\\{\\{' + escaped + '\\}\\}', 'g'), safeValue);
    md = md.replace(new RegExp('\\$\\{' + escaped + '\\}', 'g'), safeValue);
  }

  let html;
  if (typeof marked === 'undefined') {
    html = '<pre>' + escapeHtml(md) + '</pre>';
  } else {
    html = marked.parse(md, { gfm: true, breaks: false });
  }

  const existing = document.getElementById('var-preview-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'var-preview-overlay';

  const header = document.createElement('div');
  header.className = 'preview-header';
  const title = document.createElement('span');
  title.className = 'preview-title';
  title.textContent = 'Variable Preview';
  header.appendChild(title);
  const badge = document.createElement('span');
  badge.className = 'preview-badge';
  const subCount = Object.values(allVars).filter(v => v).length;
  badge.textContent = subCount + ' substituted';
  header.appendChild(badge);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'preview-close';
  closeBtn.innerHTML = '<i class="ph ph-x"></i>';
  closeBtn.onclick = closeVariablesPreview;
  header.appendChild(closeBtn);
  overlay.appendChild(header);

  const body = document.createElement('div');
  body.className = 'preview-body';
  body.innerHTML = html;
  if (typeof hljs !== 'undefined') {
    body.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
  }
  overlay.appendChild(body);
  document.body.appendChild(overlay);

  if (_previewEscHandler) {
    document.removeEventListener('keydown', _previewEscHandler, true);
  }
  _previewEscHandler = (e) => {
    if (e.key === 'Escape') {
      closeVariablesPreview();
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener('keydown', _previewEscHandler, true);
}

let _previewEscHandler = null;
function closeVariablesPreview() {
  const overlay = document.getElementById('var-preview-overlay');
  if (overlay) overlay.remove();
  if (_previewEscHandler) {
    document.removeEventListener('keydown', _previewEscHandler, true);
    _previewEscHandler = null;
  }
}
