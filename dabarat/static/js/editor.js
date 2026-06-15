/* ── Edit Mode (Tiptap WYSIWYG) ──────────────────────── */
let editState = {
  active: false,
  dirty: false,
  savedContent: '',
  tabId: null
};

let _tiptapEditor = null;
let _stashedFrontmatter = '';

function _stripFrontmatter(md) {
  const match = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (match) {
    _stashedFrontmatter = match[0];
    return md.slice(match[0].length);
  }
  _stashedFrontmatter = '';
  return md;
}

function _prependFrontmatter(md) {
  return _stashedFrontmatter ? _stashedFrontmatter + md : md;
}

/* ── Shared setup for entering any edit mode ──────────── */
function _prepareEditMode() {
  if (diffState.active) exitDiffMode();
  if (document.body.classList.contains('home-active')) hideHomeScreen();

  editState.active = true;
  editState.dirty = false;
  editState.tabId = activeTabId;
  editState.savedContent = tabs[activeTabId].content;

  document.body.classList.add('edit-mode');

  const gutter = document.getElementById('annotations-gutter');
  const annToggle = document.getElementById('annotations-toggle');
  const carousel = document.getElementById('annotate-carousel');
  if (gutter) gutter.style.display = 'none';
  if (annToggle) annToggle.style.display = 'none';
  if (carousel) carousel.style.display = 'none';
  document.getElementById('main-area').style.marginRight = '0';
}

/* ── WYSIWYG Mode (Tiptap) ──────────────────────────── */
function enterWysiwygMode() {
  if (!activeTabId || !tabs[activeTabId]) return;
  if (editState.active) return;

  _prepareEditMode();

  const contentEl = document.getElementById('content');
  const editView = document.getElementById('edit-view');
  const fmIndicator = document.getElementById('frontmatter-indicator');

  const showEditor = () => {
    contentEl.style.display = 'none';
    if (fmIndicator) fmIndicator.style.display = 'none';
    editView.style.display = 'flex';

    const body = _stripFrontmatter(editState.savedContent);
    const mount = document.getElementById('tiptap-editor');

    try {
      _tiptapEditor = new window.Tiptap.Editor({
        element: mount,
        extensions: [
          window.Tiptap.StarterKit.configure({ codeBlock: { HTMLAttributes: { class: 'hljs' } } }),
          window.Tiptap.Markdown.configure({ html: false, transformPastedText: true, transformCopiedText: true }),
          window.Tiptap.TaskList,
          window.Tiptap.TaskItem.configure({ nested: true }),
          window.Tiptap.Table.configure({ resizable: false }),
          window.Tiptap.TableRow,
          window.Tiptap.TableCell,
          window.Tiptap.TableHeader,
          window.Tiptap.Placeholder.configure({ placeholder: 'Start writing...' }),
        ],
        content: body,
        autofocus: 'end',
        onUpdate: () => {
          editState.dirty = true;
          document.body.classList.add('edit-dirty');
          updateEditStatus('Modified');
          _updateToolbarState();
        },
        onSelectionUpdate: () => {
          _updateToolbarState();
        },
      });
    } catch (e) {
      console.error('Tiptap init failed, falling back to textarea:', e);
      _tiptapEditor = null;
      mount.innerHTML = '';
      const textarea = document.createElement('textarea');
      textarea.id = 'edit-textarea-fallback';
      textarea.spellcheck = true;
      textarea.placeholder = 'Start writing... (Tiptap failed — raw markdown mode)';
      textarea.value = editState.savedContent;
      textarea.style.cssText = 'width:100%;height:100%;background:transparent;color:var(--ctp-text);border:none;outline:none;resize:none;padding:2rem 2.5rem;font-family:"Victor Mono",monospace;font-size:13px;line-height:1.7;tab-size:2;white-space:pre-wrap;word-wrap:break-word;';
      mount.appendChild(textarea);
      textarea.focus();
      textarea.addEventListener('input', () => {
        editState.dirty = true;
        document.body.classList.add('edit-dirty');
        updateEditStatus('Modified');
      });
      return;
    }

    _updateToolbarState();
    updateEditStatus('Saved');

    if (window.Motion && !_prefersReducedMotion) {
      editView.style.opacity = '0';
      Motion.animate(editView, { opacity: [0, 1] }, { duration: 0.2 });
    }
  };

  if (window.Motion && !_prefersReducedMotion) {
    Motion.animate(contentEl, { opacity: 0 }, { duration: 0.15 }).finished.then(showEditor).catch(showEditor);
  } else {
    showEditor();
  }
}

/* ── Textarea Fallback (legacy) ─────────────────────── */
function enterTextareaMode() {
  if (!activeTabId || !tabs[activeTabId]) return;
  if (editState.active) return;

  _prepareEditMode();

  const contentEl = document.getElementById('content');
  const editView = document.getElementById('edit-view');
  const fmIndicator = document.getElementById('frontmatter-indicator');

  contentEl.style.display = 'none';
  if (fmIndicator) fmIndicator.style.display = 'none';
  editView.style.display = 'flex';

  const mount = document.getElementById('tiptap-editor');
  mount.innerHTML = '';
  const textarea = document.createElement('textarea');
  textarea.id = 'edit-textarea-fallback';
  textarea.spellcheck = true;
  textarea.placeholder = 'Start writing... (Tiptap unavailable — raw markdown mode)';
  textarea.value = editState.savedContent;
  textarea.style.cssText = 'width:100%;height:100%;background:transparent;color:var(--ctp-text);border:none;outline:none;resize:none;padding:2rem 2.5rem;font-family:"Victor Mono",monospace;font-size:13px;line-height:1.7;tab-size:2;white-space:pre-wrap;word-wrap:break-word;';
  mount.appendChild(textarea);
  textarea.focus();

  textarea.addEventListener('input', () => {
    editState.dirty = true;
    document.body.classList.add('edit-dirty');
    updateEditStatus('Modified');
  });
  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      saveEdit();
    }
  });

  updateEditStatus('Saved');
}

/* ── Enter / Exit ───────────────────────────────────── */
function enterEditMode() {
  if (editState.active) return;
  if (window.Tiptap) {
    enterWysiwygMode();
  } else {
    enterTextareaMode();
  }
}

function exitEditMode(force) {
  if (!force && editState.dirty) {
    if (!confirm('Discard unsaved changes?')) return;
  }

  if (_tiptapEditor) {
    _tiptapEditor.destroy();
    _tiptapEditor = null;
  }
  _stashedFrontmatter = '';

  const mount = document.getElementById('tiptap-editor');
  if (mount) mount.innerHTML = '';

  editState.active = false;
  editState.dirty = false;
  document.body.classList.remove('edit-mode', 'edit-dirty');
  const editView = document.getElementById('edit-view');
  const contentEl = document.getElementById('content');

  const gutter = document.getElementById('annotations-gutter');
  const annToggle = document.getElementById('annotations-toggle');
  const carousel = document.getElementById('annotate-carousel');
  if (gutter) gutter.style.display = '';
  if (annToggle) annToggle.style.display = '';
  if (carousel) carousel.style.display = '';
  document.getElementById('main-area').style.marginRight = '';

  const doRestore = () => {
    editView.style.display = 'none';
    contentEl.style.display = '';
    const fmIndicator = document.getElementById('frontmatter-indicator');
    if (fmIndicator) fmIndicator.style.display = '';
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

/* ── Save ────────────────────────────────────────────── */
let _saveInFlight = false;

async function saveEdit() {
  if (_saveInFlight) return;
  _saveInFlight = true;
  const tabId = editState.tabId;

  try {
    let content;
    if (_tiptapEditor) {
      const md = _tiptapEditor.storage.markdown.getMarkdown();
      content = _prependFrontmatter(md);
    } else {
      const textarea = document.getElementById('edit-textarea-fallback');
      content = textarea ? textarea.value : '';
    }

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
      editState.dirty = false;
      document.body.classList.remove('edit-dirty');
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
  if (btn) btn.classList.toggle('dirty', editState.dirty);
}

/* ── Toolbar Commands ────────────────────────────────── */
const _CMD_MAP = {
  bold:           e => e.chain().focus().toggleBold().run(),
  italic:         e => e.chain().focus().toggleItalic().run(),
  strike:         e => e.chain().focus().toggleStrike().run(),
  heading:        e => e.chain().focus().toggleHeading({ level: 2 }).run(),
  bulletList:     e => e.chain().focus().toggleBulletList().run(),
  orderedList:    e => e.chain().focus().toggleOrderedList().run(),
  taskList:       e => e.chain().focus().toggleTaskList().run(),
  code:           e => e.chain().focus().toggleCode().run(),
  codeBlock:      e => e.chain().focus().toggleCodeBlock().run(),
  blockquote:     e => e.chain().focus().toggleBlockquote().run(),
  horizontalRule: e => e.chain().focus().setHorizontalRule().run(),
};

function _updateToolbarState() {
  if (!_tiptapEditor) return;
  document.querySelectorAll('.edit-fmt-btn').forEach(btn => {
    const cmd = btn.dataset.cmd;
    if (!cmd) return;
    let active = false;
    if (cmd === 'bold') active = _tiptapEditor.isActive('bold');
    else if (cmd === 'italic') active = _tiptapEditor.isActive('italic');
    else if (cmd === 'strike') active = _tiptapEditor.isActive('strike');
    else if (cmd === 'heading') active = _tiptapEditor.isActive('heading');
    else if (cmd === 'bulletList') active = _tiptapEditor.isActive('bulletList');
    else if (cmd === 'orderedList') active = _tiptapEditor.isActive('orderedList');
    else if (cmd === 'taskList') active = _tiptapEditor.isActive('taskList');
    else if (cmd === 'code') active = _tiptapEditor.isActive('code');
    else if (cmd === 'codeBlock') active = _tiptapEditor.isActive('codeBlock');
    else if (cmd === 'blockquote') active = _tiptapEditor.isActive('blockquote');
    btn.classList.toggle('active', active);
  });
}

/* ── Event Handlers (attached in init) ──────────────── */
function initEditor() {
  const saveBtn = document.getElementById('edit-save-btn');
  const discardBtn = document.getElementById('edit-discard-btn');

  if (saveBtn) saveBtn.addEventListener('click', saveEdit);
  if (discardBtn) discardBtn.addEventListener('click', () => exitEditMode(false));

  document.querySelector('.edit-toolbar').addEventListener('click', (e) => {
    const btn = e.target.closest('.edit-fmt-btn');
    if (!btn || !_tiptapEditor) return;
    const cmd = btn.dataset.cmd;
    const handler = _CMD_MAP[cmd];
    if (handler) handler(_tiptapEditor);
  });

  window.addEventListener('beforeunload', (e) => {
    if (editState.active && editState.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/* Cmd+Shift+E toggle edit mode */
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

/* Cmd+S save while editing */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's' && editState.active) {
    e.preventDefault();
    saveEdit();
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
