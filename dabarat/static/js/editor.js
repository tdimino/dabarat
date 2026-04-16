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
  document.body.classList.remove('edit-mode', 'edit-dirty');
  const editView = document.getElementById('edit-view');
  const contentEl = document.getElementById('content');

  /* Clear mirror */
  const mirror = document.getElementById('edit-mirror');
  if (mirror) mirror.innerHTML = '';

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
      document.body.classList.remove('edit-dirty');
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
  renderMirror(opcodes, editState.savedLines, current);
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

/* ── Mirror Overlay Rendering ───────────────────────── */
function renderMirror(opcodes, oldLines, newLines) {
  const mirror = document.getElementById('edit-mirror');
  if (!mirror) return;

  /*
   * The mirror must have exactly the same number of \n-delimited lines
   * as the textarea for the overlay to align. Only 'equal', 'insert',
   * and 'replace' opcodes produce lines in the current (new) content.
   * 'delete' opcodes have j1===j2 (zero new lines) — the gutter canvas
   * already shows red marks for these; the mirror skips them entirely.
   */
  const parts = [];

  for (const [tag, i1, i2, j1, j2] of opcodes) {
    if (tag === 'equal') {
      for (let j = j1; j < j2; j++) {
        parts.push(escapeHtml(newLines[j]));
      }
    } else if (tag === 'insert') {
      for (let j = j1; j < j2; j++) {
        parts.push('<span class="hl-line-add">' + escapeHtml(newLines[j]) + '</span>');
      }
    } else if (tag === 'delete') {
      /* No new lines exist for this range — nothing to render in the mirror.
         The 4px gutter canvas already shows a red bar for deleted lines. */
    } else if (tag === 'replace') {
      const oldChunk = oldLines.slice(i1, i2);
      const newChunk = newLines.slice(j1, j2);
      const wordResult = _renderReplacedLines(oldChunk, newChunk);
      parts.push(wordResult);
    }
  }

  mirror.innerHTML = parts.join('\n');
}

function _renderReplacedLines(oldChunk, newChunk) {
  const lineParts = [];

  for (let i = 0; i < newChunk.length; i++) {
    const newLine = newChunk[i];
    const oldLine = i < oldChunk.length ? oldChunk[i] : '';

    if (oldLine === newLine) {
      lineParts.push(escapeHtml(newLine));
    } else if (oldLine === '') {
      lineParts.push('<span class="hl-line-add">' + escapeHtml(newLine) + '</span>');
    } else {
      lineParts.push(_renderWordDiffLine(oldLine, newLine));
    }
  }

  /* Extra old lines (more old than new) are pure deletions.
     They have no corresponding textarea line, so we skip them
     to keep the mirror line count aligned. The gutter shows red. */

  return lineParts.join('\n');
}

function _renderWordDiffLine(oldLine, newLine) {
  const oldWords = _splitWords(oldLine);
  const newWords = _splitWords(newLine);
  const ops = wordDiff(oldWords, newWords);
  const html = [];

  /*
   * The mirror must contain exactly the same characters as the textarea.
   * Only render NEW words (which exist in the textarea), colored by change type.
   * Old/deleted words are NOT rendered inline — they appear as ghost text
   * via absolutely-positioned ::after pseudo-elements (zero layout impact).
   */
  for (const [tag, oi1, oi2, ni1, ni2] of ops) {
    if (tag === 'equal') {
      for (let k = ni1; k < ni2; k++) html.push(escapeHtml(newWords[k]));
    } else if (tag === 'insert') {
      for (let k = ni1; k < ni2; k++) html.push('<span class="hl-add">' + escapeHtml(newWords[k]) + '</span>');
    } else if (tag === 'delete') {
      /* Ghost text: the deleted words appear as red strikethrough annotation
         above the deletion point via CSS ::after + data-del attribute.
         The span itself is zero-width — no mirror desync. */
      const delText = oldWords.slice(oi1, oi2).map(function(w) { return w.trim(); }).join(' ');
      const attrSafe = escapeHtml(delText).replace(/"/g, '&quot;');
      html.push('<span class="hl-del-mark" data-del="' + attrSafe + '"></span>');
    } else if (tag === 'replace') {
      /* Char-level diff: pair old/new words, diff characters within each pair.
         Unchanged chars → normal, inserted chars → green, replaced chars → amber. */
      const numOld = oi2 - oi1, numNew = ni2 - ni1;
      const pairs = Math.min(numOld, numNew);
      for (let k = 0; k < pairs; k++) {
        html.push(_charDiffRender(oldWords[oi1 + k], newWords[ni1 + k]));
      }
      /* Remaining new words beyond old range — pure insertions */
      for (let k = pairs; k < numNew; k++) {
        html.push('<span class="hl-add">' + escapeHtml(newWords[ni1 + k]) + '</span>');
      }
      /* Remaining old words beyond new range — ghost deletion marker */
      if (numOld > pairs) {
        const delText = oldWords.slice(oi1 + pairs, oi2).map(function(w) { return w.trim(); }).join(' ');
        const attrSafe = escapeHtml(delText).replace(/"/g, '&quot;');
        html.push('<span class="hl-del-mark" data-del="' + attrSafe + '"></span>');
      }
    }
  }

  return html.join('');
}

/* ── Char-Level Diff Rendering (within a single word token) ── */
function _charDiffRender(oldToken, newToken) {
  if (oldToken === '') return escapeHtml(newToken);
  if (newToken === '') return '';

  /* Separate leading whitespace (must match textarea exactly) */
  const newWS = newToken.match(/^(\s*)/)[1];
  const oldWS = oldToken.match(/^(\s*)/)[1];
  const oldWord = oldToken.substring(oldWS.length);
  const newWord = newToken.substring(newWS.length);

  let result = escapeHtml(newWS);

  if (oldWord === newWord) return result + escapeHtml(newWord);

  /* Reuse wordDiff on character arrays — works identically on single chars */
  const ops = wordDiff(oldWord.split(''), newWord.split(''));
  for (const [ctag, , , cj1, cj2] of ops) {
    const chars = newWord.substring(cj1, cj2);
    if (ctag === 'equal') {
      result += escapeHtml(chars);
    } else if (ctag === 'insert') {
      result += '<span class="hl-add">' + escapeHtml(chars) + '</span>';
    } else if (ctag === 'replace') {
      result += '<span class="hl-mod">' + escapeHtml(chars) + '</span>';
    }
    /* delete: old chars gone from textarea — skip */
  }
  return result;
}

/* ── Word Splitting ─────────────────────────────────── */
function _splitWords(line) {
  /* Attach leading whitespace to each word so tokens are unique
     and the greedy diff doesn't sync on ambiguous bare whitespace.
     "hello world  foo" → ["hello", " world", "  foo"] */
  const tokens = [];
  const re = /(\s*\S+)/g;
  let m, lastEnd = 0;
  while ((m = re.exec(line)) !== null) {
    tokens.push(m[0]);
    lastEnd = m.index + m[0].length;
  }
  /* Trailing whitespace: attach to last token or keep as sole token */
  if (lastEnd < line.length) {
    if (tokens.length > 0) tokens[tokens.length - 1] += line.substring(lastEnd);
    else tokens.push(line.substring(lastEnd));
  }
  if (tokens.length === 0 && line.length > 0) tokens.push(line);
  return tokens;
}

/* ── Word-Level Diff ────────────────────────────────── */
function wordDiff(oldWords, newWords) {
  const N = oldWords.length, M = newWords.length;

  if (N === 0 && M === 0) return [['equal', 0, 0, 0, 0]];
  if (N === 0) return [['insert', 0, 0, 0, M]];
  if (M === 0) return [['delete', 0, N, 0, 0]];

  if (N === M && oldWords.every((w, i) => w === newWords[i])) {
    return [['equal', 0, N, 0, M]];
  }

  /* Greedy sequential matching with lookahead (same approach as myersDiff) */
  const blocks = [];
  let oi = 0, ni = 0;
  while (oi < N && ni < M) {
    if (oldWords[oi] === newWords[ni]) {
      const startO = oi, startN = ni;
      while (oi < N && ni < M && oldWords[oi] === newWords[ni]) { oi++; ni++; }
      blocks.push([startO, startN, oi - startO]);
    } else {
      let foundO = -1, foundN = -1;
      const searchLimit = Math.min(50, Math.max(N - oi, M - ni));
      for (let d = 1; d < searchLimit; d++) {
        if (oi + d < N && newWords[ni] !== undefined && oldWords[oi + d] === newWords[ni]) {
          foundO = oi + d; foundN = ni; break;
        }
        if (ni + d < M && oldWords[oi] !== undefined && oldWords[oi] === newWords[ni + d]) {
          foundO = oi; foundN = ni + d; break;
        }
        if (oi + d < N && ni + d < M && oldWords[oi + d] === newWords[ni + d]) {
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

  const opcodes = [];
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

/* ── Myers Diff (line-level) ────────────────────────── */
function myersDiff(oldLines, newLines) {
  const N = oldLines.length, M = newLines.length;

  if (N === M && oldLines.every((l, i) => l === newLines[i])) {
    return [['equal', 0, N, 0, M]];
  }

  const opcodes = [];
  const blocks = [];
  let oi = 0, ni = 0;
  while (oi < N && ni < M) {
    if (oldLines[oi] === newLines[ni]) {
      const startO = oi, startN = ni;
      while (oi < N && ni < M && oldLines[oi] === newLines[ni]) { oi++; ni++; }
      blocks.push([startO, startN, oi - startO]);
    } else {
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
      const start = textarea.selectionStart;
      const lineStart = textarea.value.lastIndexOf('\n', start - 1) + 1;
      const line = textarea.value.substring(lineStart, start);
      const indent = line.match(/^(\s*)/)[1];
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
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveEdit();
    }
  });

  /* Track dirty state */
  textarea.addEventListener('input', () => {
    editState.dirty = textarea.value !== editState.savedContent;
    document.body.classList.toggle('edit-dirty', editState.dirty);
    updateEditStatus(editState.dirty ? 'Modified' : 'Saved');
    _editGutterDebounce();
  });

  /* Scroll sync: gutter canvas + mirror follow .edit-body scroll (GPU-composited) */
  const editBody = textarea.closest('.edit-body');
  let _scrollRAF = null;
  if (editBody) {
    editBody.addEventListener('scroll', () => {
      if (_scrollRAF) cancelAnimationFrame(_scrollRAF);
      _scrollRAF = requestAnimationFrame(() => {
        const canvas = document.getElementById('edit-gutter-canvas');
        const mirror = document.getElementById('edit-mirror');
        const offset = `translateY(${-editBody.scrollTop}px)`;
        if (canvas) canvas.style.transform = offset;
        if (mirror) mirror.style.transform = offset;
        _scrollRAF = null;
      });
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

/* Cmd+Shift+E toggle edit mode (Cmd+E is stolen by Chrome --app mode) */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'e') {
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

/* Cmd+P print */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
    e.preventDefault();
    if (editState.active) exitEditMode(true);
    requestAnimationFrame(() => window.print());
  }
});
