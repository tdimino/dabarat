/* ══════════════════════════════════════════════════════════
   Command Palette — Cmd+K / Ctrl+K
   Modular, self-contained, Catppuccin-themed
   ══════════════════════════════════════════════════════════ */

const CommandPalette = {

  /* ── State ──────────────────────────────────────────── */
  isOpen: false,
  selectedIndex: 0,
  commands: [],
  filtered: [],
  els: {},
  _pendingOpen: false,
  _tagMode: false,

  /* ── Tanit SVG (simplified Sign of Tanit) ───────────── */
  TANIT_SVG: '<svg viewBox="0 0 24 26" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="3.5"/><line x1="3" y1="11" x2="21" y2="11"/><path d="M7 11 L12 24 L17 11" fill="none"/></svg>',

  /* ── Tag Color Map ──────────────────────────────────── */
  TAG_COLORS: {
    draft:     { bg: 'rgba(249,226,175,0.20)', fg: '#f9e2af' },
    reviewed:  { bg: 'rgba(166,227,161,0.20)', fg: '#a6e3a1' },
    final:     { bg: 'rgba(137,180,250,0.20)', fg: '#89b4fa' },
    important: { bg: 'rgba(250,179,135,0.20)', fg: '#fab387' },
    archived:  { bg: 'rgba(108,112,134,0.20)', fg: '#6c7086' },
    research:  { bg: 'rgba(203,166,247,0.20)', fg: '#cba6f7' },
    personal:  { bg: 'rgba(245,194,231,0.20)', fg: '#f5c2e7' },
    _default:  { bg: 'rgba(148,226,213,0.20)', fg: '#94e2d5' },
  },
  PREDEFINED_TAGS: ['draft', 'reviewed', 'final', 'important', 'archived', 'research', 'personal'],

  _tagColor(tag) {
    return this.TAG_COLORS[tag] || this.TAG_COLORS._default;
  },

  /* ── Command Registry ──────────────────────────────── */
  _registered: [],

  register(category, cmds) {
    cmds.forEach(c => { c.category = category; });
    this._registered.push(...cmds);
  },

  /* ── Recent Files ──────────────────────────────────── */
  RECENTS_KEY: 'mdpreview-recent-files',
  MAX_RECENTS: 5,

  getRecents() {
    try { return JSON.parse(localStorage.getItem(this.RECENTS_KEY) || '[]'); }
    catch { return []; }
  },

  saveRecent(filepath, filename) {
    try {
      const recents = this.getRecents().filter(r => r.path !== filepath);
      recents.unshift({ path: filepath, name: filename });
      localStorage.setItem(this.RECENTS_KEY, JSON.stringify(recents.slice(0, this.MAX_RECENTS)));
    } catch (e) { /* localStorage full or disabled */ }
  },

  /* ── Init ──────────────────────────────────────────── */
  init() {
    this._registerDefaults();
    this._buildDOM();
    this._bindKeys();
    this._initHint();
    this._deferSeedRecents();
  },

  _deferSeedRecents() {
    const attempt = () => {
      if (typeof tabs !== 'undefined' && Object.keys(tabs).length > 0) {
        Object.values(tabs).forEach(t => {
          if (t.filepath && t.filename) this.saveRecent(t.filepath, t.filename);
        });
      } else {
        setTimeout(attempt, 500);
      }
    };
    setTimeout(attempt, 300);
  },

  _registerDefaults() {
    this.register('File', [
      { id: 'open-file', label: 'Open File\u2026', icon: 'ph-folder-open', action: () => this._openFilePicker() },
    ]);
    this.register('View', [
      { id: 'toggle-theme', label: 'Toggle Theme', icon: 'ph-moon', action: () => toggleTheme() },
      { id: 'toggle-toc', label: 'Toggle Sidebar', icon: 'ph-sidebar', action: () => toggleToc() },
      { id: 'font-up', label: 'Increase Font', icon: 'ph-text-aa', action: () => adjustFont(1) },
      { id: 'font-down', label: 'Decrease Font', icon: 'ph-text-aa', action: () => adjustFont(-1) },
      { id: 'toggle-ann', label: 'Toggle Annotations', icon: 'ph-chat-circle-dots', action: () => {
        const g = document.getElementById('annotations-gutter');
        g.classList.contains('overlay-open') ? closeGutterOverlay() : openGutterOverlay();
      }},
    ]);
    this.register('Tags', [
      { id: 'add-tag', label: 'Add Tag\u2026', icon: 'ph-tag', action: () => this._enterTagMode() },
    ]);
  },

  /* ── DOM Construction ──────────────────────────────── */
  _buildDOM() {
    const backdrop = document.createElement('div');
    backdrop.className = 'palette-backdrop';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    const container = document.createElement('div');
    container.className = 'palette-container';

    const input = document.createElement('input');
    input.className = 'palette-input';
    input.type = 'text';
    input.placeholder = 'Type a command\u2026';
    input.addEventListener('input', () => {
      const val = input.value;
      if (val.startsWith('#') && !this._tagMode) {
        this._enterTagMode();
        input.value = val.slice(1);
      }
      if (this._tagMode) {
        this._renderTagSuggestions(input.value);
      } else {
        this.selectedIndex = 0;
        this._filter(val);
      }
    });

    /* Header (Tanit + file metadata) */
    const header = this._buildHeader();

    const list = document.createElement('div');
    list.className = 'palette-list';

    container.appendChild(input);
    container.appendChild(header);
    container.appendChild(list);
    backdrop.appendChild(container);
    document.body.appendChild(backdrop);

    this.els = { backdrop, container, input, list, header };
  },

  /* ── File Metadata Header ───────────────────────────── */
  _buildHeader() {
    const header = document.createElement('div');
    header.className = 'palette-header';

    const info = document.createElement('div');
    info.className = 'palette-file-info';

    const name = document.createElement('div');
    name.className = 'palette-file-name';
    info.appendChild(name);

    const path = document.createElement('div');
    path.className = 'palette-file-path';
    info.appendChild(path);

    const stats = document.createElement('div');
    stats.className = 'palette-file-stats';
    info.appendChild(stats);

    header.appendChild(info);
    return header;
  },

  _refreshHeader() {
    const header = this.els.header;
    if (!header) return;
    const nameEl = header.querySelector('.palette-file-name');
    const pathEl = header.querySelector('.palette-file-path');
    const statsEl = header.querySelector('.palette-file-stats');

    if (typeof activeTabId === 'undefined' || !activeTabId || typeof tabs === 'undefined' || !tabs[activeTabId]) {
      nameEl.textContent = 'No file open';
      pathEl.textContent = '';
      statsEl.innerHTML = '';
      return;
    }

    const tab = tabs[activeTabId];
    nameEl.textContent = tab.filename || 'Untitled';
    pathEl.textContent = tab.filepath || '';

    /* Build stats */
    const parts = [];

    /* Word count + read time */
    if (tab.content) {
      const text = tab.content.replace(/[#*_`~\[\]()>|\\-]/g, ' ').trim();
      const words = text.split(/\s+/).filter(w => w.length > 0).length;
      const mins = Math.max(1, Math.ceil(words / 250));
      parts.push(words.toLocaleString() + ' words');
      parts.push(mins + ' min read');
    }

    /* Annotation count */
    if (typeof annotationsCache !== 'undefined' && annotationsCache[activeTabId]) {
      const anns = annotationsCache[activeTabId];
      if (anns.length > 0) {
        parts.push(anns.length + ' note' + (anns.length !== 1 ? 's' : ''));
      }
    }

    /* Stats text */
    statsEl.innerHTML = '';
    parts.forEach((p, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'stat-sep';
        sep.textContent = '\u00b7';
        statsEl.appendChild(sep);
      }
      const span = document.createElement('span');
      span.textContent = p;
      statsEl.appendChild(span);
    });

    /* Tag pills */
    const fileTags = (typeof tagsCache !== 'undefined' && tagsCache[activeTabId]) || [];
    fileTags.forEach(tag => {
      const pill = this._createTagPill(tag, true);
      statsEl.appendChild(pill);
    });

    /* Add tag button */
    const addBtn = document.createElement('span');
    addBtn.className = 'tag-pill-add';
    addBtn.textContent = '+ tag';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._enterTagMode();
    });
    statsEl.appendChild(addBtn);
  },

  _createTagPill(tag, removable) {
    const c = this._tagColor(tag);
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.style.background = c.bg;
    pill.style.color = c.fg;
    pill.textContent = '#' + tag;
    if (removable) {
      const x = document.createElement('span');
      x.className = 'tag-remove';
      x.textContent = '\u00d7';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof removeTag === 'function') removeTag(activeTabId, tag);
        this._refreshHeader();
      });
      pill.appendChild(x);
    }
    return pill;
  },

  /* ── Tag Mode ───────────────────────────────────────── */
  _enterTagMode() {
    this._tagMode = true;
    this.els.input.value = '';
    this.els.input.placeholder = 'Type a tag name\u2026';
    this.selectedIndex = 0;
    this._renderTagSuggestions('');
    this.els.input.focus();
  },

  _exitTagMode() {
    this._tagMode = false;
    this.els.input.placeholder = 'Type a command\u2026';
    this.selectedIndex = 0;
  },

  _renderTagSuggestions(query) {
    const list = this.els.list;
    list.innerHTML = '';
    const q = query.toLowerCase().trim();
    const currentTags = (typeof tagsCache !== 'undefined' && typeof activeTabId !== 'undefined' && tagsCache[activeTabId]) || [];

    /* Build full tag list: predefined + any existing custom tags on this file */
    const allKnown = [...this.PREDEFINED_TAGS];
    currentTags.forEach(t => { if (!allKnown.includes(t)) allKnown.push(t); });

    let suggestions = allKnown.filter(t => !q || t.includes(q));
    /* If user typed something new, offer it at the top */
    const isCustom = q && !allKnown.includes(q);
    if (isCustom && !suggestions.includes(q)) {
      suggestions.unshift(q);
    }

    if (suggestions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'palette-empty';
      empty.textContent = 'No matching tags';
      list.appendChild(empty);
      return;
    }

    const groupHeader = document.createElement('div');
    groupHeader.className = 'palette-group';
    groupHeader.textContent = 'Tags';
    list.appendChild(groupHeader);

    this.filtered = suggestions.map((tag, i) => ({ tag, idx: i }));

    suggestions.forEach((tag, i) => {
      const item = document.createElement('div');
      item.className = 'palette-tag-item' + (i === this.selectedIndex ? ' selected' : '');
      item.dataset.idx = i;

      const dot = document.createElement('span');
      dot.className = 'tag-dot';
      const c = this._tagColor(tag);
      dot.style.background = c.fg;
      item.appendChild(dot);

      const label = document.createElement('span');
      label.className = 'palette-label';
      label.textContent = '#' + tag;
      item.appendChild(label);

      /* "Create" hint for custom tags */
      if (isCustom && tag === q) {
        const hint = document.createElement('span');
        hint.className = 'palette-sublabel';
        hint.textContent = 'create';
        item.appendChild(hint);
      }

      /* Checkmark if already applied */
      if (currentTags.includes(tag)) {
        const check = document.createElement('span');
        check.className = 'tag-check';
        check.innerHTML = '<i class="ph ph-check"></i>';
        item.appendChild(check);
      }

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this._applyTag(tag);
      });
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = i;
        list.querySelectorAll('.palette-tag-item.selected').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      });

      list.appendChild(item);
    });
  },

  async _applyTag(tag) {
    if (typeof addTag === 'function' && typeof activeTabId !== 'undefined') {
      await addTag(activeTabId, tag);
    }
    this._exitTagMode();
    this._refreshHeader();
    this.close();
  },

  /* ── Open / Close ──────────────────────────────────── */
  open() {
    this.isOpen = true;
    this._tagMode = false;
    this._refreshCommands();
    this._refreshHeader();
    this.els.input.value = '';
    this.els.input.placeholder = 'Type a command\u2026';
    this.selectedIndex = 0;
    this._filter('');
    this.els.backdrop.classList.add('visible');
    this.els.input.focus();
  },

  close() {
    this.isOpen = false;
    this._tagMode = false;
    this.els.backdrop.classList.remove('visible');
  },

  /* ── Build Full Command List ───────────────────────── */
  _refreshCommands() {
    const cmds = [];

    /* File commands first */
    cmds.push(...this._registered.filter(c => c.category === 'File'));

    /* Recent files right after File */
    this.getRecents().forEach(r => {
      cmds.push({ id: 'recent:' + r.path, label: r.name, sublabel: r.path, category: 'Recent Files', icon: 'ph-clock-counter-clockwise', action: () => this._addFile(r.path) });
    });

    /* Remaining registered (View, Tags, etc.) */
    cmds.push(...this._registered.filter(c => c.category !== 'File'));

    /* Dynamic: tab switching */
    if (typeof tabs !== 'undefined') {
      Object.keys(tabs).forEach(id => {
        const t = tabs[id];
        if (id !== activeTabId) {
          cmds.push({ id: 'tab:' + id, label: t.filename, category: 'Tabs', icon: 'ph-file-text', action: () => switchTab(id) });
        }
      });

      /* Dynamic: close tab (only if >1 tab) */
      if (Object.keys(tabs).length > 1) {
        cmds.push({ id: 'close-tab', label: 'Close Current Tab', category: 'Tabs', icon: 'ph-x', action: () => closeTab(activeTabId) });
      }
    }

    this.commands = cmds;
  },

  /* ── Filter ────────────────────────────────────────── */
  _filter(query) {
    if (!query) {
      this.filtered = this.commands;
    } else {
      const q = query.toLowerCase();
      this.filtered = this.commands.filter(c =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.sublabel && c.sublabel.toLowerCase().includes(q))
      );
    }
    this._render();
  },

  /* ── Render ────────────────────────────────────────── */
  _render() {
    const list = this.els.list;
    list.innerHTML = '';

    if (this.filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'palette-empty';
      empty.textContent = 'No results';
      list.appendChild(empty);
      return;
    }

    /* Group by category */
    const groups = new Map();
    this.filtered.forEach(c => {
      if (!groups.has(c.category)) groups.set(c.category, []);
      groups.get(c.category).push(c);
    });

    let flatIdx = 0;
    groups.forEach((cmds, cat) => {
      const header = document.createElement('div');
      header.className = 'palette-group';
      header.textContent = cat;
      list.appendChild(header);

      cmds.forEach(cmd => {
        const item = document.createElement('div');
        item.className = 'palette-item' + (flatIdx === this.selectedIndex ? ' selected' : '');
        item.dataset.idx = flatIdx;

        const icon = document.createElement('i');
        icon.className = 'ph ' + (cmd.icon || 'ph-terminal');
        item.appendChild(icon);

        const label = document.createElement('span');
        label.className = 'palette-label';
        label.textContent = cmd.label;
        item.appendChild(label);

        if (cmd.sublabel) {
          const sub = document.createElement('span');
          sub.className = 'palette-sublabel';
          sub.textContent = cmd.sublabel;
          item.appendChild(sub);
        }

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectedIndex = parseInt(item.dataset.idx);
          this._execute();
        });
        item.addEventListener('mouseenter', () => {
          this.selectedIndex = parseInt(item.dataset.idx);
          list.querySelectorAll('.palette-item.selected').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
        });

        list.appendChild(item);
        flatIdx++;
      });
    });
  },

  /* ── Navigate ──────────────────────────────────────── */
  _navigate(delta) {
    const selector = this._tagMode ? '.palette-tag-item' : '.palette-item';
    const items = this.els.list.querySelectorAll(selector);
    const max = items.length - 1;
    if (max < 0) return;

    const oldIdx = this.selectedIndex;
    this.selectedIndex = Math.max(0, Math.min(max, this.selectedIndex + delta));
    if (oldIdx === this.selectedIndex) return;

    if (items[oldIdx]) items[oldIdx].classList.remove('selected');
    if (items[this.selectedIndex]) {
      items[this.selectedIndex].classList.add('selected');
      items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  },

  /* ── Execute ───────────────────────────────────────── */
  _execute() {
    if (this._tagMode) {
      /* In tag mode, execute means apply the selected tag */
      const items = this.els.list.querySelectorAll('.palette-tag-item');
      if (items[this.selectedIndex]) {
        const tag = this.filtered[this.selectedIndex]?.tag;
        if (tag) this._applyTag(tag);
      }
      return;
    }
    const cmd = this.filtered[this.selectedIndex];
    if (cmd) {
      this.close();
      cmd.action();
    }
  },

  /* ── Keyboard ──────────────────────────────────────── */
  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.isOpen ? this.close() : this.open();
        return;
      }
      if (!this.isOpen) return;

      if (e.key === 'Escape') {
        if (this._tagMode) {
          this._exitTagMode();
          this.els.input.value = '';
          this._filter('');
          e.preventDefault();
        } else {
          this.close();
          e.preventDefault();
        }
      }
      else if (e.key === 'ArrowDown') { e.preventDefault(); this._navigate(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this._navigate(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this._execute(); }
    });
  },

  /* ── Open a file by path (shared by picker + recents) ── */
  async _addFile(filepath) {
    if (this._pendingOpen) return;
    this._pendingOpen = true;
    try {
      const res = await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filepath: filepath }),
      });
      const data = await res.json();
      if (data.error) { console.warn('palette:', data.error); return; }
      if (!tabs[data.id]) {
        tabs[data.id] = { filepath: data.filepath, filename: data.filename, content: '', mtime: 0, scrollY: 0 };
        fetchTabContent(data.id);
      }
      this.saveRecent(data.filepath, data.filename);
      switchTab(data.id);
      renderTabBar();
    } catch (err) {
      console.error('palette: add file failed:', err);
    } finally {
      this._pendingOpen = false;
    }
  },

  /* ── File Picker ───────────────────────────────────── */
  _openFilePicker() {
    if (this._pendingOpen) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.mdown,.mkd,.txt';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files[0];
      input.remove();
      if (file) this._addFile(file.name);
    };
    window.addEventListener('focus', function cleanup() {
      window.removeEventListener('focus', cleanup);
      setTimeout(() => { if (document.body.contains(input)) input.remove(); }, 300);
    });
    input.click();
  },

  /* ── Hint Badge ────────────────────────────────────── */
  HINT_SHOW_MS: 5 * 60 * 1000,
  HINT_IDLE_MS: 2 * 60 * 1000,
  _hintTimer: null,
  _idleTimer: null,
  _lastActivity: 0,

  _initHint() {
    const hint = document.createElement('div');
    hint.className = 'palette-hint';
    const isMac = navigator.platform.indexOf('Mac') !== -1;
    hint.innerHTML = '<kbd>' + (isMac ? '\u2318' : 'Ctrl') + '</kbd><kbd>K</kbd>';
    hint.onclick = () => this.open();
    document.body.appendChild(hint);
    this.els.hint = hint;

    requestAnimationFrame(() => hint.classList.add('visible'));
    this._lastActivity = Date.now();

    this._hintTimer = setTimeout(() => this._hideHint(), this.HINT_SHOW_MS);

    const onActivity = () => { this._lastActivity = Date.now(); };
    document.addEventListener('mousemove', onActivity, { passive: true });
    document.addEventListener('keydown', onActivity, { passive: true });
    document.addEventListener('click', onActivity, { passive: true });

    this._idleTimer = setInterval(() => {
      const idle = Date.now() - this._lastActivity;
      if (idle >= this.HINT_IDLE_MS && !this.els.hint.classList.contains('visible')) {
        this.els.hint.classList.add('visible');
        clearTimeout(this._hintTimer);
        this._hintTimer = setTimeout(() => this._hideHint(), this.HINT_SHOW_MS);
      }
    }, 30000);
  },

  _hideHint() {
    if (this.els.hint) this.els.hint.classList.remove('visible');
  },
};

/* Auto-init after app.js has loaded */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CommandPalette.init());
} else {
  CommandPalette.init();
}
