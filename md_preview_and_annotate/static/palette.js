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
  _diffPickerMode: false,
  _settingsMode: false,
  _hasStaggered: false,
  _rafPending: {},

  /* ── Tanit SVG (simplified Sign of Tanit) ───────────── */
  TANIT_SVG: '<svg viewBox="0 0 24 26" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="3.5"/><line x1="3" y1="11" x2="21" y2="11"/><path d="M7 11 L12 24 L17 11" fill="none"/></svg>',

  /* ── Theme Preview Colors (5 per preset) ─────────── */
  THEME_PREVIEW: {
    'mocha':          ['#1e1e2e', '#cdd6f4', '#89b4fa', '#cba6f7', '#f38ba8'],
    'latte':          ['#eff1f5', '#4c4f69', '#1e66f5', '#8839ef', '#d20f39'],
    'rose-pine':      ['#191724', '#e0def4', '#31748f', '#c4a7e7', '#eb6f92'],
    'rose-pine-dawn': ['#faf4ed', '#575279', '#56949f', '#907aa9', '#b4637a'],
    'tokyo-storm':    ['#24283b', '#c0caf5', '#7aa2f7', '#bb9af7', '#f7768e'],
    'tokyo-light':    ['#e6e7ed', '#343b58', '#2959aa', '#7847bd', '#8c4351'],
  },

  /* ── Tag Color Map ──────────────────────────────────── */
  TAG_COLORS: {
    draft:     { bg: 'rgba(var(--ctp-yellow-rgb), 0.20)', fg: 'var(--ctp-yellow)' },
    reviewed:  { bg: 'rgba(var(--ctp-green-rgb), 0.20)', fg: 'var(--ctp-green)' },
    final:     { bg: 'rgba(var(--ctp-blue-rgb), 0.20)', fg: 'var(--ctp-blue)' },
    important: { bg: 'rgba(var(--ctp-peach-rgb), 0.20)', fg: 'var(--ctp-peach)' },
    archived:  { bg: 'rgba(var(--ctp-overlay0-rgb), 0.20)', fg: 'var(--ctp-overlay0)' },
    research:  { bg: 'rgba(var(--ctp-mauve-rgb), 0.20)', fg: 'var(--ctp-mauve)' },
    personal:  { bg: 'rgba(var(--ctp-pink-rgb), 0.20)', fg: 'var(--ctp-pink)' },
    'prompt:system':    { bg: 'rgba(var(--ctp-blue-rgb), 0.20)', fg: 'var(--ctp-blue)' },
    'prompt:user':      { bg: 'rgba(var(--ctp-green-rgb), 0.20)', fg: 'var(--ctp-green)' },
    'prompt:assistant': { bg: 'rgba(var(--ctp-mauve-rgb), 0.20)', fg: 'var(--ctp-mauve)' },
    'prompt:chain':     { bg: 'rgba(var(--ctp-peach-rgb), 0.20)', fg: 'var(--ctp-peach)' },
    'prompt:cognitive':  { bg: 'rgba(var(--ctp-pink-rgb), 0.20)', fg: 'var(--ctp-pink)' },
    'prompt:tested':    { bg: 'rgba(var(--ctp-teal-rgb), 0.20)', fg: 'var(--ctp-teal)' },
    _default:  { bg: 'rgba(var(--ctp-teal-rgb), 0.20)', fg: 'var(--ctp-teal)' },
  },
  PREDEFINED_TAGS: ['draft', 'reviewed', 'final', 'important', 'archived', 'research', 'personal',
    'prompt:system', 'prompt:user', 'prompt:assistant', 'prompt:chain', 'prompt:cognitive', 'prompt:tested'],

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
  RECENTS_KEY: 'dabarat-recent-files',
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
    let retries = 0;
    const attempt = () => {
      if (typeof tabs !== 'undefined' && Object.keys(tabs).length > 0) {
        Object.values(tabs).forEach(t => {
          if (t.filepath && t.filename) this.saveRecent(t.filepath, t.filename);
        });
      } else if (retries < 10) {
        retries++;
        setTimeout(attempt, 500);
      }
    };
    setTimeout(attempt, 300);
  },

  _registerDefaults() {
    this.register('File', [
      { id: 'open-file', label: 'Open File\u2026', icon: 'ph-folder-open', action: () => this._openFilePicker() },
      { id: 'compare-with', label: 'Compare with\u2026', icon: 'ph-git-diff', action: () => this._openDiffPicker() },
    ]);
    this.register('View', [
      { id: 'toggle-theme', label: 'Toggle Dark/Light', icon: 'ph-moon', action: () => toggleTheme() },
      { id: 'cycle-theme', label: 'Next Theme', icon: 'ph-palette', action: () => cycleTheme() },
      { id: 'toggle-toc', label: 'Toggle Sidebar', icon: 'ph-sidebar', action: () => toggleToc() },
      { id: 'font-up', label: 'Increase Font', icon: 'ph-text-aa', action: () => adjustFont(1) },
      { id: 'font-down', label: 'Decrease Font', icon: 'ph-text-aa', action: () => adjustFont(-1) },
      { id: 'toggle-ann', label: 'Toggle Annotations', icon: 'ph-chat-circle-dots', action: () => {
        const g = document.getElementById('annotations-gutter');
        g.classList.contains('overlay-open') ? closeGutterOverlay() : openGutterOverlay();
      }},
      { id: 'show-variables', label: 'Show Variables', icon: 'ph-brackets-curly', action: () => {
        if (typeof diffState !== 'undefined' && diffState.active) return;
        if (window.innerWidth <= 1400) openGutterOverlay();
        switchGutterTab('variables');
      }},
      { id: 'toggle-twemoji', label: 'Cycle Emoji Style', icon: 'ph-smiley', action: () => cycleEmojiStyle() },
    ]);
    this.register('View', [
      { id: 'show-frontmatter', label: 'Show Frontmatter', icon: 'ph-file-code',
        hidden: () => typeof currentFrontmatter === 'undefined' || !currentFrontmatter || Object.keys(currentFrontmatter).length === 0,
        action: () => { if (typeof showFrontmatterPopup === 'function') showFrontmatterPopup(); }
      },
      { id: 'settings', label: 'Settings', icon: 'ph-gear-six', keepOpen: true, action: () => this._enterSettingsMode() },
    ]);
    this.register('Tags', [
      { id: 'add-tag', label: 'Add Tag\u2026', icon: 'ph-tag', action: () => this._enterTagMode() },
    ]);
    this.register('Workspace', [
      { id: 'new-workspace', label: 'New Workspace\u2026', icon: 'ph-plus-circle', action: () => { if (typeof createWorkspace === 'function') createWorkspace(); } },
      { id: 'open-workspace', label: 'Open Workspace\u2026', icon: 'ph-folder-open', action: () => { if (typeof openWorkspace === 'function') openWorkspace(); } },
      { id: 'add-folder-ws', label: 'Add Folder to Workspace', icon: 'ph-folder-plus',
        hidden: () => typeof _activeWorkspace === 'undefined' || !_activeWorkspace,
        action: () => { if (typeof addFolderToWorkspace === 'function') addFolderToWorkspace(); } },
      { id: 'add-file-ws', label: 'Add File to Workspace', icon: 'ph-file-plus',
        hidden: () => typeof _activeWorkspace === 'undefined' || !_activeWorkspace,
        action: () => { if (typeof addFileToWorkspace === 'function') addFileToWorkspace(); } },
      { id: 'close-workspace', label: 'Close Workspace', icon: 'ph-x-circle',
        hidden: () => typeof _activeWorkspace === 'undefined' || !_activeWorkspace,
        action: () => { if (typeof closeWorkspace === 'function') closeWorkspace(); } },
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

    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', 'Command palette');

    const input = document.createElement('input');
    input.className = 'palette-input';
    input.type = 'text';
    input.placeholder = 'Type a command\u2026';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.addEventListener('input', () => {
      const val = input.value;
      if (val.startsWith('#') && !this._tagMode && !this._settingsMode) {
        this._enterTagMode();
        input.value = val.slice(1);
      }
      if (this._settingsMode) {
        this._renderSettingsPanel(input.value);
      } else if (this._tagMode) {
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
    list.setAttribute('role', 'listbox');

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

  /* ── Settings Mode ─────────────────────────────────── */
  SETTINGS_SCHEMA: [
    { category: 'Appearance', items: [
      { key: 'theme', label: 'Theme', type: 'theme-picker' },
      { key: 'fontsize', label: 'Body Font Size', type: 'slider', min: 11, max: 22, step: 1, unit: 'px',
        get: () => currentSize,
        set: (v) => { currentSize = Math.max(11, Math.min(22, parseInt(v))); applyFontSize(); }
      },
      { key: 'tocfontsize', label: 'TOC Font Size', type: 'slider', min: -4, max: 6, step: 1, unit: '',
        format: (v) => (parseInt(v) > 0 ? '+' : '') + v,
        get: () => tocSize,
        set: (v) => { tocSize = Math.max(-4, Math.min(6, parseInt(v))); applyTocFontSize(); }
      },
      { key: 'opacity', label: 'Window Opacity', type: 'slider', min: 0, max: 5, step: 1, unit: '',
        format: (v) => ['100%', '95%', '90%', '85%', '80%', '70%'][v] || v,
        get: () => opacityIndex,
        set: (v) => { opacityIndex = Math.max(0, Math.min(5, parseInt(v))); applyOpacity(); }
      },
      { key: 'emoji', label: 'Emoji Style', type: 'toggle', options: ['twitter', 'openmoji', 'noto', 'native'],
        icons: ['ph-twitter-logo', 'ph-smiley-sticker', 'ph-google-logo', 'ph-device-mobile'],
        get: () => emojiStyle,
        set: (v) => setEmojiStyle(v)
      },
    ]},
    { category: 'Layout', items: [
      { key: 'tocwidth', label: 'TOC Width', type: 'slider', min: 180, max: 500, step: 10, unit: 'px',
        get: () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--toc-width')) || 250,
        set: (v) => {
          v = Math.max(180, Math.min(500, parseInt(v)));
          document.documentElement.style.setProperty('--toc-width', v + 'px');
          localStorage.setItem('dabarat-toc-width', v);
        }
      },
    ]},
    { category: 'Annotations', items: [
      { key: 'author', label: 'Default Author', type: 'text',
        get: () => defaultAuthor,
        set: (v) => { defaultAuthor = v.trim().slice(0, 50) || 'Anonymous'; localStorage.setItem('dabarat-author', defaultAuthor); }
      },
    ]},
  ],

  _enterSettingsMode() {
    this._settingsMode = true;
    this.els.input.value = '';
    this.els.input.placeholder = 'Search settings\u2026';
    this._renderSettingsPanel('');
    this.els.input.focus();
  },

  _exitSettingsMode() {
    this._settingsMode = false;
    this.els.input.placeholder = 'Type a command\u2026';
    this.els.input.value = '';
    this.selectedIndex = 0;
  },

  _renderSettingsPanel(query) {
    const list = this.els.list;
    list.innerHTML = '';
    const q = (query || '').toLowerCase().trim();

    /* Back arrow */
    const back = document.createElement('div');
    back.className = 'settings-back';
    back.innerHTML = '<i class="ph ph-arrow-left"></i><span>Back to commands</span>';
    back.addEventListener('click', () => {
      this._exitSettingsMode();
      this._filter('');
    });
    list.appendChild(back);

    this.SETTINGS_SCHEMA.forEach(group => {
      const filtered = group.items.filter(item =>
        !q || item.label.toLowerCase().includes(q) || item.key.includes(q) || group.category.toLowerCase().includes(q)
      );
      if (filtered.length === 0) return;

      const header = document.createElement('div');
      header.className = 'settings-category';
      header.textContent = group.category;
      list.appendChild(header);

      filtered.forEach(item => {
        if (item.type === 'theme-picker') {
          list.appendChild(this._buildThemePicker());
          return;
        }
        const row = document.createElement('div');
        row.className = 'settings-row';

        const label = document.createElement('span');
        label.className = 'settings-label';
        label.textContent = item.label;
        row.appendChild(label);

        const control = this._buildControl(item);
        row.appendChild(control);

        list.appendChild(row);
      });
    });
  },

  _buildControl(item) {
    const wrap = document.createElement('div');
    wrap.className = 'settings-control';

    if (item.type === 'toggle') {
      const group = document.createElement('div');
      group.className = 'settings-toggle-group';
      item.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'settings-toggle-btn' + (item.get() === opt ? ' active' : '');
        const text = (typeof THEME_META !== 'undefined' && THEME_META[opt]) ? THEME_META[opt].label : opt.charAt(0).toUpperCase() + opt.slice(1);
        if (item.icons && item.icons[i]) {
          btn.innerHTML = '<i class="ph ' + item.icons[i] + '"></i> ' + text;
        } else {
          btn.textContent = text;
        }
        btn.addEventListener('click', () => {
          item.set(opt);
          group.querySelectorAll('.settings-toggle-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
        group.appendChild(btn);
      });
      wrap.appendChild(group);
    }
    else if (item.type === 'slider') {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'settings-slider';
      slider.min = item.min;
      slider.max = item.max;
      slider.step = item.step;
      slider.value = item.get();

      const val = document.createElement('span');
      val.className = 'settings-value';
      const formatVal = (v) => item.format ? item.format(v) : v + (item.unit || '');
      val.textContent = formatVal(slider.value);

      const updateTrack = () => {
        const pct = ((slider.value - item.min) / (item.max - item.min)) * 100;
        slider.style.setProperty('--range-pct', pct + '%');
      };
      updateTrack();

      slider.addEventListener('input', () => {
        const key = item.key;
        val.textContent = formatVal(slider.value);
        updateTrack();
        if (this._rafPending[key]) return;
        this._rafPending[key] = true;
        requestAnimationFrame(() => {
          item.set(slider.value);
          this._rafPending[key] = false;
        });
      });

      wrap.appendChild(slider);
      wrap.appendChild(val);
    }
    else if (item.type === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'settings-text';
      input.value = item.get();
      input.addEventListener('change', () => {
        item.set(input.value);
      });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
      });
      wrap.appendChild(input);
    }

    return wrap;
  },

  /* ── Theme Picker ──────────────────────────────────── */
  _buildThemePicker() {
    const wrap = document.createElement('div');
    wrap.className = 'theme-picker';

    /* Tabs */
    const tabBar = document.createElement('div');
    tabBar.className = 'theme-picker-tabs';
    const tabNames = ['Presets', 'Generate', 'Image'];
    const tabIcons = ['ph-palette', 'ph-sparkle', 'ph-image'];
    const panels = [];

    tabNames.forEach((name, i) => {
      const btn = document.createElement('button');
      btn.className = 'tp-tab' + (i === 0 ? ' active' : '');
      btn.innerHTML = '<i class="ph ' + tabIcons[i] + '"></i>' + name;
      btn.addEventListener('click', () => {
        tabBar.querySelectorAll('.tp-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        panels.forEach((p, j) => { p.style.display = j === i ? '' : 'none'; });
      });
      tabBar.appendChild(btn);
    });
    wrap.appendChild(tabBar);

    /* ── Presets Panel ── */
    const presetsPanel = document.createElement('div');
    presetsPanel.className = 'tp-panel';
    const grid = document.createElement('div');
    grid.className = 'tp-preset-grid';

    THEME_ORDER.forEach(theme => {
      const card = document.createElement('div');
      card.className = 'tp-preset-card' + (currentTheme === theme ? ' active' : '');
      card.addEventListener('click', () => {
        if (typeof setTheme === 'function') setTheme(theme);
        grid.querySelectorAll('.tp-preset-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        /* Also deactivate custom cards */
        const customSection = wrap.querySelector('.tp-custom-section');
        if (customSection) customSection.querySelectorAll('.tp-custom-card').forEach(c => c.classList.remove('active'));
      });

      const dots = document.createElement('div');
      dots.className = 'tp-dots';
      (this.THEME_PREVIEW[theme] || []).forEach(color => {
        const dot = document.createElement('span');
        dot.style.background = color;
        dots.appendChild(dot);
      });
      card.appendChild(dots);

      const label = document.createElement('div');
      label.className = 'tp-label';
      label.textContent = THEME_META[theme] ? THEME_META[theme].label : theme;
      card.appendChild(label);

      grid.appendChild(card);
    });
    presetsPanel.appendChild(grid);

    /* Custom themes section */
    const customThemes = typeof getCustomThemes === 'function' ? getCustomThemes() : [];
    if (customThemes.length > 0) {
      const customHeader = document.createElement('div');
      customHeader.className = 'tp-section-label';
      customHeader.textContent = 'Custom Themes';
      presetsPanel.appendChild(customHeader);

      const customGrid = document.createElement('div');
      customGrid.className = 'tp-preset-grid tp-custom-section';
      customThemes.forEach(ct => {
        const card = document.createElement('div');
        card.className = 'tp-custom-card' + (currentTheme === '_custom' && localStorage.getItem('dabarat-custom-active') === ct.id ? ' active' : '');
        card.addEventListener('click', () => {
          if (typeof applyCustomTheme === 'function') applyCustomTheme(ct.variables, ct.id);
          grid.querySelectorAll('.tp-preset-card').forEach(c => c.classList.remove('active'));
          customGrid.querySelectorAll('.tp-custom-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
        });

        const dots = document.createElement('div');
        dots.className = 'tp-dots';
        const preview = [ct.variables['--ctp-base'], ct.variables['--ctp-text'], ct.variables['--ctp-blue'], ct.variables['--ctp-mauve'], ct.variables['--ctp-red']];
        preview.forEach(color => {
          if (!color) return;
          const dot = document.createElement('span');
          dot.style.background = color;
          dots.appendChild(dot);
        });
        card.appendChild(dots);

        const label = document.createElement('div');
        label.className = 'tp-label';
        label.textContent = ct.name;
        card.appendChild(label);

        const del = document.createElement('button');
        del.className = 'tp-delete';
        del.innerHTML = '<i class="ph ph-x"></i>';
        del.title = 'Delete';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof deleteCustomTheme === 'function') deleteCustomTheme(ct.id);
          card.remove();
          if (currentTheme === 'mocha') {
            const first = grid.querySelector('.tp-preset-card');
            if (first) first.classList.add('active');
          }
        });
        card.appendChild(del);

        customGrid.appendChild(card);
      });
      presetsPanel.appendChild(customGrid);
    }
    panels.push(presetsPanel);
    wrap.appendChild(presetsPanel);

    /* ── Generate Panel ── */
    const genPanel = document.createElement('div');
    genPanel.className = 'tp-panel';
    genPanel.style.display = 'none';

    const form = document.createElement('div');
    form.className = 'tp-gen-form';
    const genBtn = document.createElement('button');
    const input = document.createElement('input');
    input.className = 'tp-gen-input';
    input.type = 'text';
    input.placeholder = 'e.g. dark ocean, warm earth, neon cherry\u2026';
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') genBtn.click(); });
    form.appendChild(input);
    genBtn.className = 'tp-gen-btn';
    genBtn.innerHTML = '<i class="ph ph-sparkle"></i>';
    genBtn.title = 'Generate';
    form.appendChild(genBtn);
    genPanel.appendChild(form);

    const genPreview = document.createElement('div');
    genPreview.className = 'tp-preview-area';
    genPanel.appendChild(genPreview);

    genBtn.addEventListener('click', () => {
      const desc = input.value.trim();
      if (!desc) return;
      genPreview.innerHTML = '';
      const vars = typeof paletteFromDescription === 'function' ? paletteFromDescription(desc) : null;
      if (!vars) {
        const err = document.createElement('div');
        err.className = 'tp-error';
        err.textContent = 'No mood matched. Try: ocean, forest, sunset, midnight, lavender, cherry, golden, arctic, autumn, neon, coffee, moss, rose, warm earth, pastel';
        genPreview.appendChild(err);
        return;
      }
      /* Show swatch preview */
      const swatchRow = document.createElement('div');
      swatchRow.className = 'tp-swatch-row';
      ['--ctp-base', '--ctp-text', '--ctp-blue', '--ctp-mauve', '--ctp-red', '--ctp-green', '--ctp-yellow', '--ctp-peach'].forEach(k => {
        if (!vars[k]) return;
        const sw = document.createElement('span');
        sw.className = 'tp-swatch';
        sw.style.background = vars[k];
        sw.title = k.replace('--ctp-', '');
        swatchRow.appendChild(sw);
      });
      genPreview.appendChild(swatchRow);

      /* Apply + Save buttons */
      const actions = document.createElement('div');
      actions.className = 'tp-gen-actions';
      const applyBtn = document.createElement('button');
      applyBtn.className = 'tp-apply-btn';
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', () => {
        if (typeof applyCustomTheme === 'function') applyCustomTheme(vars);
      });
      actions.appendChild(applyBtn);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'tp-save-btn';
      saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Save';
      saveBtn.addEventListener('click', () => {
        if (typeof saveCustomTheme === 'function' && typeof applyCustomTheme === 'function') {
          const id = saveCustomTheme(desc, vars, 'text');
          applyCustomTheme(vars, id);
          saveBtn.innerHTML = '<i class="ph ph-check"></i> Saved!';
          saveBtn.disabled = true;
        }
      });
      actions.appendChild(saveBtn);
      genPreview.appendChild(actions);
    });
    panels.push(genPanel);
    wrap.appendChild(genPanel);

    /* ── Image Panel ── */
    const imgPanel = document.createElement('div');
    imgPanel.className = 'tp-panel';
    imgPanel.style.display = 'none';

    const dropzone = document.createElement('div');
    dropzone.className = 'tp-dropzone';
    dropzone.innerHTML = '<i class="ph ph-image" style="font-size:24px;opacity:0.5"></i><span>Drop an image or click to browse</span>';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    imgPanel.appendChild(fileInput);

    if (typeof Vibrant === 'undefined') {
      const notice = document.createElement('div');
      notice.className = 'tp-error';
      notice.textContent = 'Image palette extraction unavailable (Vibrant.js not loaded)';
      imgPanel.insertBefore(notice, dropzone);
    }
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', (e) => { if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove('dragover'); });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) this._processImageTheme(file, imgPanel, wrap);
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) this._processImageTheme(file, imgPanel, wrap);
    });
    imgPanel.appendChild(dropzone);

    const imgPreview = document.createElement('div');
    imgPreview.className = 'tp-preview-area';
    imgPanel.appendChild(imgPreview);

    panels.push(imgPanel);
    wrap.appendChild(imgPanel);

    return wrap;
  },

  async _processImageTheme(file, panel, wrap) {
    const preview = panel.querySelector('.tp-preview-area');
    preview.innerHTML = '<div class="tp-loading"><i class="ph ph-spinner"></i> Extracting palette\u2026</div>';
    try {
      const vars = typeof imageToTheme === 'function' ? await imageToTheme(file) : null;
      if (!vars) throw new Error('Failed to extract colors');
      preview.innerHTML = '';

      const swatchRow = document.createElement('div');
      swatchRow.className = 'tp-swatch-row';
      ['--ctp-base', '--ctp-text', '--ctp-blue', '--ctp-mauve', '--ctp-red', '--ctp-green', '--ctp-yellow', '--ctp-peach'].forEach(k => {
        if (!vars[k]) return;
        const sw = document.createElement('span');
        sw.className = 'tp-swatch';
        sw.style.background = vars[k];
        sw.title = k.replace('--ctp-', '');
        swatchRow.appendChild(sw);
      });
      preview.appendChild(swatchRow);

      const actions = document.createElement('div');
      actions.className = 'tp-gen-actions';
      const applyBtn = document.createElement('button');
      applyBtn.className = 'tp-apply-btn';
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', () => {
        if (typeof applyCustomTheme === 'function') applyCustomTheme(vars);
      });
      actions.appendChild(applyBtn);

      const saveBtn = document.createElement('button');
      saveBtn.className = 'tp-save-btn';
      saveBtn.innerHTML = '<i class="ph ph-floppy-disk"></i> Save';
      saveBtn.addEventListener('click', () => {
        if (typeof saveCustomTheme === 'function' && typeof applyCustomTheme === 'function') {
          const name = file.name.replace(/\.[^.]+$/, '');
          const id = saveCustomTheme(name, vars, 'image');
          applyCustomTheme(vars, id);
          saveBtn.innerHTML = '<i class="ph ph-check"></i> Saved!';
          saveBtn.disabled = true;
        }
      });
      actions.appendChild(saveBtn);
      preview.appendChild(actions);
    } catch (err) {
      preview.innerHTML = '<div class="tp-error">' + (err.message || 'Failed to extract palette') + '</div>';
    }
  },

  /* ── Open / Close ──────────────────────────────────── */
  open() {
    this.isOpen = true;
    this._tagMode = false;
    this._settingsMode = false;
    this._refreshCommands();
    this._refreshHeader();
    this.els.input.value = '';
    this.els.input.placeholder = 'Type a command\u2026';
    this.selectedIndex = 0;
    this._filter('');
    this.els.backdrop.classList.add('visible');
    this.els.input.focus();

    /* First-open stagger — never re-stagger on filter keystrokes (Raycast principle) */
    if (window.Motion && !_prefersReducedMotion && !this._hasStaggered) {
      this._hasStaggered = true;
      const items = this.els.list.querySelectorAll('.palette-item');
      if (items.length) {
        Motion.animate(items,
          { opacity: [0, 1], y: [6, 0] },
          { delay: Motion.stagger(0.025), duration: 0.18 }
        );
      }
    }
  },

  close() {
    this.isOpen = false;
    this._tagMode = false;
    this._settingsMode = false;
    this.els.backdrop.classList.remove('visible');
  },

  /* ── Build Full Command List ───────────────────────── */
  _refreshCommands() {
    const cmds = [];

    /* File commands first */
    cmds.push(...this._registered.filter(c => c.category === 'File' && (!c.hidden || !c.hidden())));

    /* Recent files right after File */
    this.getRecents().forEach(r => {
      cmds.push({ id: 'recent:' + r.path, label: r.name, sublabel: r.path, category: 'Recent Files', icon: 'ph-clock-counter-clockwise', action: () => this._addFile(r.path) });
    });

    /* Remaining registered (View, Tags, etc.) */
    cmds.push(...this._registered.filter(c => c.category !== 'File' && (!c.hidden || !c.hidden())));

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

    /* Dynamic: Exit Compare (only when diff mode is active) */
    if (typeof diffState !== 'undefined' && diffState.active) {
      cmds.push({ id: 'exit-compare', label: 'Exit Compare', category: 'File', icon: 'ph-x-circle',
        action: () => exitDiffMode() });
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
      if (!cmd.keepOpen) this.close();
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

      /* In settings mode, let controls handle their own events */
      if (this._settingsMode && e.target !== this.els.input && e.key !== 'Escape') return;

      if (e.key === 'Escape') {
        if (this._settingsMode) {
          this._exitSettingsMode();
          this._filter('');
          e.preventDefault();
        } else if (this._tagMode) {
          this._exitTagMode();
          this.els.input.value = '';
          this._filter('');
          e.preventDefault();
        } else {
          this.close();
          e.preventDefault();
        }
      }
      else if (e.key === 'ArrowDown' && !this._settingsMode) { e.preventDefault(); this._navigate(1); }
      else if (e.key === 'ArrowUp' && !this._settingsMode) { e.preventDefault(); this._navigate(-1); }
      else if (e.key === 'Enter' && !this._settingsMode) { e.preventDefault(); this._execute(); }
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

  /* ── Diff File Picker ──────────────────────────────── */
  _openDiffPicker() {
    if (typeof diffState !== 'undefined' && diffState.active) {
      /* Already in diff mode — exit instead */
      this.close();
      exitDiffMode();
      return;
    }
    this.close();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.mdown,.mkd,.txt';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files[0];
      input.remove();
      if (file && typeof enterDiffMode === 'function') {
        enterDiffMode(file.name);
      }
    };
    window.addEventListener('focus', function cleanup() {
      window.removeEventListener('focus', cleanup);
      setTimeout(() => { if (document.body.contains(input)) input.remove(); }, 300);
    });
    input.click();
  },

  /* ── Hint Badge (show once, then disappear) ────────── */
  HINT_SHOW_MS: 8000,

  _initHint() {
    const hint = document.createElement('div');
    hint.className = 'palette-hint';
    const isMac = navigator.platform.indexOf('Mac') !== -1;
    hint.innerHTML = '<kbd>' + (isMac ? '\u2318' : 'Ctrl') + '</kbd><kbd>K</kbd>';
    hint.onclick = () => this.open();
    document.body.appendChild(hint);
    this.els.hint = hint;

    requestAnimationFrame(() => hint.classList.add('visible'));
    setTimeout(() => {
      if (this.els.hint) this.els.hint.classList.remove('visible');
    }, this.HINT_SHOW_MS);
  },
};

/* Auto-init after app.js has loaded */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CommandPalette.init());
} else {
  CommandPalette.init();
}
