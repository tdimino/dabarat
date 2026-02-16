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

  /* Seed recents from open tabs once they're loaded (app.js init is async) */
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
  },

  /* ── DOM Construction ──────────────────────────────── */
  _buildDOM() {
    const backdrop = document.createElement('div');
    backdrop.className = 'palette-backdrop';
    backdrop.addEventListener('click', (e) => {
      /* Only close if clicking the backdrop itself, not children */
      if (e.target === backdrop) this.close();
    });

    const container = document.createElement('div');
    container.className = 'palette-container';

    const input = document.createElement('input');
    input.className = 'palette-input';
    input.type = 'text';
    input.placeholder = 'Type a command\u2026';
    input.addEventListener('input', () => {
      this.selectedIndex = 0;
      this._filter(input.value);
    });

    const list = document.createElement('div');
    list.className = 'palette-list';

    container.appendChild(input);
    container.appendChild(list);
    backdrop.appendChild(container);
    document.body.appendChild(backdrop);

    this.els = { backdrop, container, input, list };
  },

  /* ── Open / Close ──────────────────────────────────── */
  open() {
    this.isOpen = true;
    this._refreshCommands();
    this.els.input.value = '';
    this.selectedIndex = 0;
    this._filter('');
    this.els.backdrop.classList.add('visible');
    this.els.input.focus();
  },

  close() {
    this.isOpen = false;
    this.els.backdrop.classList.remove('visible');
  },

  /* ── Build Full Command List ───────────────────────── */
  _refreshCommands() {
    const cmds = [...this._registered];

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

    /* Recent files */
    this.getRecents().forEach(r => {
      cmds.push({ id: 'recent:' + r.path, label: r.name, sublabel: r.path, category: 'Recent Files', icon: 'ph-clock-counter-clockwise', action: () => this._addFile(r.path) });
    });

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
    const oldIdx = this.selectedIndex;
    this.selectedIndex = Math.max(0, Math.min(this.filtered.length - 1, this.selectedIndex + delta));
    if (oldIdx === this.selectedIndex) return;
    const items = this.els.list.querySelectorAll('.palette-item');
    if (items[oldIdx]) items[oldIdx].classList.remove('selected');
    if (items[this.selectedIndex]) {
      items[this.selectedIndex].classList.add('selected');
      items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  },

  /* ── Execute ───────────────────────────────────────── */
  _execute() {
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

      if (e.key === 'Escape') { this.close(); e.preventDefault(); }
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
    /* Clean up if user cancels the dialog */
    window.addEventListener('focus', function cleanup() {
      window.removeEventListener('focus', cleanup);
      setTimeout(() => { if (document.body.contains(input)) input.remove(); }, 300);
    });
    input.click();
  },

  /* ── Hint Badge ────────────────────────────────────── */
  HINT_SHOW_MS: 5 * 60 * 1000,   /* visible for 5 minutes */
  HINT_IDLE_MS: 2 * 60 * 1000,   /* reappear after 2 min idle */
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

    /* Show immediately */
    requestAnimationFrame(() => hint.classList.add('visible'));
    this._lastActivity = Date.now();

    /* Hide after 5 minutes */
    this._hintTimer = setTimeout(() => this._hideHint(), this.HINT_SHOW_MS);

    /* Track activity to detect idle */
    const onActivity = () => {
      this._lastActivity = Date.now();
    };
    document.addEventListener('mousemove', onActivity, { passive: true });
    document.addEventListener('keydown', onActivity, { passive: true });
    document.addEventListener('click', onActivity, { passive: true });

    /* Check for idle every 30s — reshow hint if idle for 2 min */
    this._idleTimer = setInterval(() => {
      const idle = Date.now() - this._lastActivity;
      if (idle >= this.HINT_IDLE_MS && !this.els.hint.classList.contains('visible')) {
        this.els.hint.classList.add('visible');
        /* Hide again after 5 min */
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
