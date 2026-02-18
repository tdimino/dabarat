/* ── Diff Mode ───────────────────────────────────────── */
let diffState = { active: false, leftTabId: null, rightPath: null };

async function enterDiffMode(againstPath) {
  if (!activeTabId || !tabs[activeTabId]) return;

  diffState.active = true;
  diffState.leftTabId = activeTabId;
  diffState.rightPath = againstPath;

  /* Hide normal content, show diff view */
  document.getElementById('content').style.display = 'none';
  const fmIndicator = document.getElementById('frontmatter-indicator');
  if (fmIndicator) fmIndicator.style.display = 'none';
  const diffView = document.getElementById('diff-view');
  diffView.style.display = 'flex';

  /* Hide annotations gutter in diff mode */
  const gutter = document.getElementById('annotations-gutter');
  const toggle = document.getElementById('annotations-toggle');
  if (gutter) gutter.style.display = 'none';
  if (toggle) toggle.style.display = 'none';
  document.getElementById('main-area').style.marginRight = '0';

  /* Fetch diff from server */
  try {
    const url = '/api/diff?tab=' + activeTabId +
      '&against=' + encodeURIComponent(againstPath);
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.error('Diff error:', data.error);
      exitDiffMode();
      return;
    }
    renderDiff(data);
  } catch (e) {
    console.error('Diff fetch failed:', e);
    exitDiffMode();
  }
}

function exitDiffMode() {
  diffState.active = false;
  diffState.leftTabId = null;
  diffState.rightPath = null;

  /* Restore normal view */
  document.getElementById('content').style.display = '';
  document.getElementById('diff-view').style.display = 'none';
  const gutter = document.getElementById('annotations-gutter');
  const toggle = document.getElementById('annotations-toggle');
  if (gutter) gutter.style.display = '';
  if (toggle) toggle.style.display = '';
  document.getElementById('main-area').style.marginRight = '';

  /* Force re-render */
  lastRenderedMd = '';
  if (activeTabId && tabs[activeTabId] && tabs[activeTabId].content) {
    render(tabs[activeTabId].content);
  }
}

function renderDiff(data) {
  /* Filenames */
  document.getElementById('diff-left-name').textContent = data.left_filename;
  document.getElementById('diff-right-name').textContent = data.right_filename;

  /* Stats bar */
  const s = data.body.stats;
  document.getElementById('diff-stats-bar').innerHTML =
    '<span class="diff-stat-add">+' + s.added + ' added</span>' +
    '<span class="diff-stat-del">\u2212' + s.removed + ' removed</span>' +
    '<span class="diff-stat-chg">~' + s.changed + ' changed</span>';

  /* Frontmatter diff bar */
  const fmBar = document.getElementById('diff-fm-bar');
  if (data.fm_changed) {
    fmBar.style.display = '';
    const fmLeft = data.fm_left || '';
    const fmRight = data.fm_right || '';
    fmBar.innerHTML = '<details><summary><i class="ph ph-caret-right"></i> Frontmatter changed</summary>' +
      '<div class="diff-fm-body">' + renderFrontmatterDiffHtml(fmLeft, fmRight) + '</div></details>';
  } else {
    fmBar.style.display = 'none';
    fmBar.innerHTML = '';
  }

  /* Render both panels */
  const leftPanel = document.getElementById('diff-panel-left');
  const rightPanel = document.getElementById('diff-panel-right');
  renderDiffPanel(leftPanel, data.body.left);
  renderDiffPanel(rightPanel, data.body.right);

  /* Identical files message */
  if (s.added === 0 && s.removed === 0 && s.changed === 0) {
    const msg = '<div class="diff-identical"><i class="ph ph-check-circle"></i>Files are identical</div>';
    leftPanel.querySelector('.diff-panel-content').innerHTML += msg;
  }

  /* Update status bar */
  document.getElementById('status-filepath').textContent =
    (tabs[activeTabId]?.filename || '') + ' \u2194 ' + data.right_filename;

  /* Init scroll sync + resize */
  initDiffScrollSync();
  initDiffResize();
}

function renderFrontmatterDiffHtml(fmLeft, fmRight) {
  const leftLines = fmLeft.split('\n');
  const rightLines = fmRight.split('\n');
  let html = '';

  /* Simple line-by-line comparison */
  const maxLen = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < maxLen; i++) {
    const l = leftLines[i] || '';
    const r = rightLines[i] || '';
    if (l === r) {
      html += escapeHtml(l) + '\n';
    } else {
      if (l) html += '<span class="diff-fm-del">\u2212 ' + escapeHtml(l) + '</span>\n';
      if (r) html += '<span class="diff-fm-add">+ ' + escapeHtml(r) + '</span>\n';
    }
  }
  return html;
}

function renderDiffPanel(panel, diffLines) {
  panel.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'diff-panel-content';

  /* Reconstruct raw markdown, tracking line types */
  const rawLines = [];
  const lineTypes = [];
  diffLines.forEach(entry => {
    rawLines.push(entry.line || '');
    lineTypes.push(entry.type);
  });

  /* For empty sides, skip rendering */
  const nonEmpty = lineTypes.filter(t => t !== 'empty');
  if (nonEmpty.length === 0) {
    const emptyBlock = document.createElement('div');
    emptyBlock.className = 'diff-block diff-empty';
    emptyBlock.style.minHeight = '100%';
    wrapper.appendChild(emptyBlock);
    panel.appendChild(wrapper);
    return;
  }

  /* Render full markdown */
  const fullMd = rawLines.join('');
  const html = marked.parse(fullMd, { gfm: true, breaks: false });

  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  /* Map rendered blocks to source line ranges and apply diff types */
  const children = Array.from(tmp.children);
  let lineIdx = 0;

  children.forEach(child => {
    const block = document.createElement('div');
    block.className = 'diff-block';

    /* Estimate how many raw lines this block spans */
    const blockLines = estimateBlockLineCount(rawLines, lineIdx, child);
    const blockTypes = lineTypes.slice(lineIdx, lineIdx + blockLines);
    lineIdx += blockLines;

    /* Determine dominant diff type for the block */
    const dtype = getDominantDiffType(blockTypes);
    if (dtype !== 'equal') {
      block.classList.add('diff-' + dtype);
    }

    block.appendChild(child);
    wrapper.appendChild(block);
  });

  /* Handle remaining unmatched lines (trailing content) */
  while (lineIdx < lineTypes.length) {
    const t = lineTypes[lineIdx];
    if (t === 'empty') {
      const pad = document.createElement('div');
      pad.className = 'diff-block diff-empty';
      wrapper.appendChild(pad);
    }
    lineIdx++;
  }

  /* Syntax highlighting */
  if (typeof hljs !== 'undefined') {
    wrapper.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
  }

  panel.appendChild(wrapper);
}

function estimateBlockLineCount(rawLines, startIdx, element) {
  let i = startIdx;

  /* Skip leading blank/empty lines */
  while (i < rawLines.length && rawLines[i].trim() === '') {
    i++;
  }

  if (i >= rawLines.length) return Math.max(i - startIdx, 1);

  /* Code fence block */
  if (rawLines[i].trim().startsWith('```')) {
    let count = i - startIdx;
    count++; i++;
    while (i < rawLines.length && !rawLines[i].trim().startsWith('```')) {
      count++; i++;
    }
    if (i < rawLines.length) count++; /* closing fence */
    return count + 1;
  }

  /* Heading — single content line */
  if (rawLines[i].trim().startsWith('#')) {
    return (i - startIdx) + 1;
  }

  /* HR */
  if (/^[-*_]{3,}\s*$/.test(rawLines[i].trim())) {
    return (i - startIdx) + 1;
  }

  /* Paragraph / list / blockquote — consume until blank line */
  let count = i - startIdx;
  while (i < rawLines.length && rawLines[i].trim() !== '') {
    count++; i++;
  }
  /* Include one trailing blank line if present */
  if (i < rawLines.length && rawLines[i].trim() === '') {
    count++;
  }

  return Math.max(count, 1);
}

function getDominantDiffType(types) {
  if (types.length === 0) return 'equal';
  if (types.every(t => t === 'empty')) return 'empty';
  const nonEqual = types.filter(t => t !== 'equal' && t !== 'empty');
  if (nonEqual.length === 0) return 'equal';
  if (nonEqual.includes('change')) return 'change';
  if (nonEqual.includes('insert')) return 'insert';
  if (nonEqual.includes('delete')) return 'delete';
  return 'equal';
}

/* Synchronized scrolling between diff panels */
function initDiffScrollSync() {
  const left = document.getElementById('diff-panel-left');
  const right = document.getElementById('diff-panel-right');
  if (!left || !right) return;
  let syncing = false;

  function syncScroll(source, target) {
    if (syncing || !diffState.active) return;
    syncing = true;
    const maxScroll = source.scrollHeight - source.clientHeight;
    const ratio = maxScroll > 0 ? source.scrollTop / maxScroll : 0;
    const targetMax = target.scrollHeight - target.clientHeight;
    target.scrollTop = ratio * targetMax;
    requestAnimationFrame(() => { syncing = false; });
  }

  /* Remove old listeners by replacing elements (simplest approach) */
  left.onscroll = () => syncScroll(left, right);
  right.onscroll = () => syncScroll(right, left);
}

/* Resizable center divider (reuses TOC resize pattern) */
let _diffResizeCtrl = null;

function initDiffResize() {
  const handle = document.getElementById('diff-resize-handle');
  if (!handle) return;

  /* Clean up previous listeners */
  if (_diffResizeCtrl) _diffResizeCtrl.abort();
  _diffResizeCtrl = new AbortController();
  const signal = _diffResizeCtrl.signal;
  let dragging = false;

  handle.onmousedown = function(e) {
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.classList.add('diff-resizing');
  };

  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    const panels = document.querySelector('.diff-panels');
    if (!panels) return;
    const rect = panels.getBoundingClientRect();
    let pct = ((e.clientX - rect.left) / rect.width) * 100;
    pct = Math.max(25, Math.min(75, pct));
    panels.style.setProperty('--diff-split', pct + '%');
  }, { signal });

  document.addEventListener('mouseup', function() {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.classList.remove('diff-resizing');
  }, { signal });
}

/* Close button */
document.getElementById('diff-close-btn').addEventListener('click', exitDiffMode);

/* Escape key for diff mode — defer to palette or preview overlay if open */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && diffState.active) {
    const backdrop = document.querySelector('.palette-backdrop');
    if (backdrop && backdrop.classList.contains('visible')) return;
    if (document.getElementById('var-preview-overlay')) return;
    exitDiffMode();
    e.preventDefault();
    e.stopPropagation();
  }
}, true);
