/* ── Edit Mode ───────────────────────────────────────── */
let editState = {
  active: false,
  dirty: false,
  savedContent: '',
  baseContent: '',
  savedLines: [],
  tabId: null
};

function enterEditMode() {
  if (!activeTabId || !tabs[activeTabId]) return;
  editState.active = true;
  editState.dirty = false;
  editState.tabId = activeTabId;
  editState.savedContent = tabs[activeTabId].content;
  editState.baseContent = tabs[activeTabId].content;
  editState.savedLines = editState.baseContent.split('\n');

  document.body.classList.add('edit-mode');
  const contentEl = document.getElementById('content');
  const editView = document.getElementById('edit-view');
  const fmIndicator = document.getElementById('frontmatter-indicator');

  /* Crossfade: fade out content, fade in editor */
  if (window.Motion && !_prefersReducedMotion) {
    Motion.animate(contentEl, { opacity: 0 }, { duration: 0.15 }).finished.then(() => {
      contentEl.style.display = 'none';
      if (fmIndicator) fmIndicator.style.display = 'none';
      editView.style.display = 'flex';
      editView.style.opacity = '0';
      Motion.animate(editView, { opacity: [0, 1] }, { duration: 0.2 });
    }).catch(() => {
      contentEl.style.display = 'none';
      if (fmIndicator) fmIndicator.style.display = 'none';
      editView.style.display = 'flex';
    });
  } else {
    contentEl.style.display = 'none';
    if (fmIndicator) fmIndicator.style.display = 'none';
    editView.style.display = 'flex';
  }

  const textarea = document.getElementById('edit-textarea');
  textarea.value = editState.savedContent;
  textarea.focus();
  updateEditGutter();
  updateEditStatus('Saved');
}

function exitEditMode(force) {
  if (!force && editState.dirty) {
    if (!confirm('Discard unsaved changes?')) return;
  }
  editState.active = false;
  editState.dirty = false;
  document.body.classList.remove('edit-mode');
  const editView = document.getElementById('edit-view');
  const contentEl = document.getElementById('content');

  const doRestore = () => {
    editView.style.display = 'none';
    contentEl.style.display = '';
    lastRenderedMd = '';
    if (activeTabId && tabs[activeTabId]) {
      render(tabs[activeTabId].content);
    }
    if (window.Motion && !_prefersReducedMotion) {
      contentEl.style.opacity = '0';
      Motion.animate(contentEl, { opacity: [0, 1] }, { duration: 0.2 });
    }
  };

  if (window.Motion && !_prefersReducedMotion) {
    Motion.animate(editView, { opacity: 0 }, { duration: 0.15 }).finished.then(doRestore).catch(doRestore);
  } else {
    doRestore();
  }
}

let _saveInFlight = false;

async function saveEdit() {
  if (_saveInFlight) return;
  _saveInFlight = true;
  const tabId = editState.tabId;
  const textarea = document.getElementById('edit-textarea');
  const content = textarea.value;
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ tab: tabId, content: content })
    });
    const data = await res.json();
    if (data.ok && tabs[tabId]) {
      tabs[tabId].content = content;
      tabs[tabId].mtime = data.mtime;
      editState.savedContent = content;
      editState.baseContent = content;
      editState.savedLines = content.split('\n');
      editState.dirty = false;
      updateEditGutter();
      updateEditStatus('Saved');
    } else {
      updateEditStatus('Error: ' + (data.error || 'save failed'));
    }
  } catch (e) {
    updateEditStatus('Error: ' + e.message);
  } finally {
    _saveInFlight = false;
  }
}

function updateEditStatus(text) {
  const el = document.getElementById('edit-status');
  if (el) el.textContent = text;
  const btn = document.getElementById('edit-save-btn');
  if (btn) {
    btn.classList.toggle('dirty', editState.dirty);
  }
}

/* ── Canvas-Based Diff Gutter ───────────────────────── */
function updateEditGutter() {
  const textarea = document.getElementById('edit-textarea');
  if (!textarea) return;
  const current = textarea.value.split('\n');
  const opcodes = myersDiff(editState.savedLines, current);
  renderGutterCanvas(opcodes);
}

function renderGutterCanvas(opcodes) {
  const canvas = document.getElementById('edit-gutter-canvas');
  const textarea = document.getElementById('edit-textarea');
  if (!canvas || !textarea) return;

  const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 24;
  const totalLines = textarea.value.split('\n').length;
  const totalHeight = Math.max(totalLines * lineHeight, textarea.clientHeight);

  canvas.height = totalHeight;
  canvas.width = 4;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const style = getComputedStyle(document.documentElement);
  const COLORS = {
    insert:  style.getPropertyValue('--ctp-green').trim()  || '#a6e3a1',
    delete:  style.getPropertyValue('--ctp-red').trim()    || '#f38ba8',
    replace: style.getPropertyValue('--ctp-yellow').trim() || '#f9e2af'
  };

  for (const [tag, i1, i2, j1, j2] of opcodes) {
    if (tag === 'equal') continue;
    ctx.fillStyle = COLORS[tag] || COLORS.replace;
    const y = j1 * lineHeight;
    const h = Math.max((j2 - j1) * lineHeight, 2);
    ctx.fillRect(0, y, 4, h);
  }
}

/* ── Myers Diff ─────────────────────────────────────── */
function myersDiff(oldLines, newLines) {
  /* Returns opcodes: [['equal',i1,i2,j1,j2], ['insert',...], ...] */
  const N = oldLines.length, M = newLines.length;

  /* Fast path: identical */
  if (N === M && oldLines.every((l, i) => l === newLines[i])) {
    return [['equal', 0, N, 0, M]];
  }

  const opcodes = [];
  const blocks = [];
  /* Sequential scan to find matching blocks */
  let oi = 0, ni = 0;
  while (oi < N && ni < M) {
    if (oldLines[oi] === newLines[ni]) {
      const startO = oi, startN = ni;
      while (oi < N && ni < M && oldLines[oi] === newLines[ni]) { oi++; ni++; }
      blocks.push([startO, startN, oi - startO]);
    } else {
      /* Find next match */
      let foundO = -1, foundN = -1;
      const searchLimit = Math.min(200, Math.max(N - oi, M - ni));
      for (let d = 1; d < searchLimit; d++) {
        if (oi + d < N && newLines[ni] !== undefined && oldLines[oi + d] === newLines[ni]) {
          foundO = oi + d; foundN = ni; break;
        }
        if (ni + d < M && oldLines[oi] !== undefined && oldLines[oi] === newLines[ni + d]) {
          foundO = oi; foundN = ni + d; break;
        }
        if (oi + d < N && ni + d < M && oldLines[oi + d] === newLines[ni + d]) {
          foundO = oi + d; foundN = ni + d; break;
        }
      }
      if (foundO >= 0) {
        oi = foundO; ni = foundN;
      } else {
        oi++; ni++;
      }
    }
  }

  /* Convert blocks to opcodes */
  let lastO = 0, lastN = 0;
  for (const [bO, bN, size] of blocks) {
    if (bO > lastO || bN > lastN) {
      if (bO > lastO && bN > lastN) {
        opcodes.push(['replace', lastO, bO, lastN, bN]);
      } else if (bO > lastO) {
        opcodes.push(['delete', lastO, bO, lastN, lastN]);
      } else {
        opcodes.push(['insert', lastO, lastO, lastN, bN]);
      }
    }
    if (size > 0) {
      opcodes.push(['equal', bO, bO + size, bN, bN + size]);
    }
    lastO = bO + size;
    lastN = bN + size;
  }
  if (lastO < N || lastN < M) {
    if (lastO < N && lastN < M) {
      opcodes.push(['replace', lastO, N, lastN, M]);
    } else if (lastO < N) {
      opcodes.push(['delete', lastO, N, lastN, lastN]);
    } else {
      opcodes.push(['insert', lastO, lastO, lastN, M]);
    }
  }

  return opcodes.length > 0 ? opcodes : [['equal', 0, N, 0, M]];
}

/* ── Debounce utility ───────────────────────────────── */
function _editDebounce(fn, ms) {
  let timer;
  return function() {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

const _editGutterDebounce = _editDebounce(updateEditGutter, 500);

/* ── Event Handlers (attached in init) ──────────────── */
function initEditor() {
  const textarea = document.getElementById('edit-textarea');
  const saveBtn = document.getElementById('edit-save-btn');
  const discardBtn = document.getElementById('edit-discard-btn');
  if (!textarea || !saveBtn) return;

  /* Tab/Shift+Tab handling with undo preservation */
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        /* Outdent: remove leading 2 spaces from current line */
        const start = textarea.selectionStart;
        const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
        const line = textarea.value.substring(lineStart, start);
        if (line.startsWith('  ')) {
          textarea.setSelectionRange(lineStart, lineStart + 2);
          document.execCommand('delete');
        }
      } else {
        document.execCommand('insertText', false, '  ');
      }
    }
    if (e.key === 'Enter') {
      /* Auto-indent: match leading whitespace of current line */
      const start = textarea.selectionStart;
      const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
      const line = textarea.value.substring(lineStart, start);
      const indent = line.match(/^(\s*)/)[1];
      /* Check for list continuation */
      const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s/);
      if (listMatch) {
        e.preventDefault();
        const prefix = listMatch[2].match(/^\d/) ? '1. ' : listMatch[2] + ' ';
        document.execCommand('insertText', false, '\n' + listMatch[1] + prefix);
      } else if (indent) {
        e.preventDefault();
        document.execCommand('insertText', false, '\n' + indent);
      }
    }
    /* Cmd+S save */
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveEdit();
    }
  });

  /* Track dirty state */
  textarea.addEventListener('input', () => {
    editState.dirty = textarea.value !== editState.savedContent;
    updateEditStatus(editState.dirty ? 'Modified' : 'Saved');
    _editGutterDebounce();
  });

  /* Scroll sync: gutter canvas follows textarea scroll */
  const editBody = textarea.closest('.edit-body');
  if (editBody) {
    editBody.addEventListener('scroll', () => {
      const canvas = document.getElementById('edit-gutter-canvas');
      if (canvas) canvas.style.marginTop = -editBody.scrollTop + 'px';
    });
  }

  /* Buttons */
  saveBtn.addEventListener('click', saveEdit);
  if (discardBtn) discardBtn.addEventListener('click', () => exitEditMode(false));

  /* Prevent accidental navigation */
  window.addEventListener('beforeunload', (e) => {
    if (editState.active && editState.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/* Cmd+E toggle edit mode */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
    /* Don't intercept if palette is open */
    const backdrop = document.querySelector('.palette-backdrop');
    if (backdrop && backdrop.classList.contains('visible')) return;
    e.preventDefault();
    if (editState.active) {
      exitEditMode(false);
    } else {
      enterEditMode();
    }
  }
});
