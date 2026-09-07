/* ── Font Size ────────────────────────────────────────── */
let currentSize = parseInt(localStorage.getItem('dabarat-fontsize') || '15');

function applyFontSize() {
  document.documentElement.style.setProperty('--base-size', currentSize + 'px');
  const display = document.getElementById('font-size-display');
  if (display) display.textContent = currentSize;
  localStorage.setItem('dabarat-fontsize', currentSize);
}
applyFontSize();

function adjustFont(delta) {
  currentSize = Math.max(11, Math.min(22, currentSize + delta));
  applyFontSize();
}

/* ── TOC Font Size ───────────────────────────────────── */
let tocSize = parseInt(localStorage.getItem('dabarat-toc-fontsize') || '0');

function applyTocFontSize() {
  document.documentElement.style.setProperty('--toc-size-offset', tocSize + 'px');
  const display = document.getElementById('toc-font-size-display');
  if (display) display.textContent = tocSize === 0 ? 'A' : (tocSize > 0 ? '+' + tocSize : String(tocSize));
  localStorage.setItem('dabarat-toc-fontsize', tocSize);
}
applyTocFontSize();

function adjustTocFont(delta) {
  tocSize = Math.max(-4, Math.min(6, tocSize + delta));
  applyTocFontSize();
}

/* ── Theme ────────────────────────────────────────────── */
const THEME_ORDER = [
  'ink', 'vellum',
  'mocha', 'latte',
  'rose-pine', 'rose-pine-dawn',
  'tokyo-storm', 'tokyo-light',
];
const THEME_META = {
  'ink':            { family: 'scholar',    mode: 'dark',  label: 'Ink' },
  'vellum':         { family: 'scholar',    mode: 'light', label: 'Vellum' },
  'mocha':          { family: 'catppuccin',  mode: 'dark',  label: 'Catppuccin Mocha' },
  'latte':          { family: 'catppuccin',  mode: 'light', label: 'Catppuccin Latte' },
  'rose-pine':      { family: 'rose-pine',   mode: 'dark',  label: 'Rosé Pine' },
  'rose-pine-dawn': { family: 'rose-pine',   mode: 'light', label: 'Rosé Pine Dawn' },
  'tokyo-storm':    { family: 'tokyo-night',  mode: 'dark',  label: 'Tokyo Night Storm' },
  'tokyo-light':    { family: 'tokyo-night',  mode: 'light', label: 'Tokyo Night Light' },
};
const THEME_PAIRS = {
  'ink': 'vellum', 'vellum': 'ink',
  'mocha': 'latte', 'latte': 'mocha',
  'rose-pine': 'rose-pine-dawn', 'rose-pine-dawn': 'rose-pine',
  'tokyo-storm': 'tokyo-light', 'tokyo-light': 'tokyo-storm',
};

let currentTheme = (new URLSearchParams(window.location.search)).get('theme')
  || localStorage.getItem('dabarat-theme')
  || document.documentElement.getAttribute('data-theme')
  || 'mocha';
if (!THEME_META[currentTheme] && currentTheme !== '_custom') currentTheme = 'mocha';

function applyTheme(persist) {
  document.documentElement.setAttribute('data-theme', currentTheme);
  const toggle = document.getElementById('theme-toggle');
  const meta = THEME_META[currentTheme];
  if (toggle && meta) toggle.checked = (meta.mode === 'light');
  localStorage.setItem('dabarat-theme', currentTheme);
  if (persist !== false) {
    fetch('/api/config', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({theme: currentTheme})
    }).catch(() => {});
  }
}
applyTheme(false);

function toggleTheme(event) {
  const doToggle = () => {
    const pair = THEME_PAIRS[currentTheme];
    if (!pair) { localStorage.removeItem(CUSTOM_ACTIVE_KEY); currentTheme = 'mocha'; }
    else { currentTheme = pair; }
    applyTheme();
    applyOpacity();
  };

  /* View Transitions API — a short crossfade (the browser default, ~250ms).
     The 400ms circular reveal it replaced was a demo flourish (2026-09-06). */
  if (!_prefersReducedMotion && document.startViewTransition) {
    document.startViewTransition(doToggle);
  } else {
    doToggle();
  }
}

function cycleTheme() {
  const idx = THEME_ORDER.indexOf(currentTheme);
  if (idx === -1) localStorage.removeItem(CUSTOM_ACTIVE_KEY);
  currentTheme = THEME_ORDER[(Math.max(0, idx) + 1) % THEME_ORDER.length];
  applyTheme();
  applyOpacity();
}

function setTheme(name) {
  if (THEME_META[name]) {
    currentTheme = name;
    localStorage.removeItem(CUSTOM_ACTIVE_KEY);
    applyTheme();
    applyOpacity();
  }
}

function toggleToc() {
  document.body.classList.toggle('toc-collapsed');
  const collapsed = document.body.classList.contains('toc-collapsed');
  localStorage.setItem('dabarat-toc-collapsed', collapsed ? '1' : '');
  const restore = document.getElementById('toc-restore');
  if (restore) restore.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  if (collapsed) {
    const btn = restore;
    if (btn && window.Motion && !_prefersReducedMotion) {
      window.Motion.animate(btn,
        { opacity: [0, 1], scale: [0.5, 1], x: [-8, 0] },
        { duration: 0.35, easing: window.Motion.spring({ stiffness: 300, damping: 20 }) }
      );
    }
  }
}
(function _restoreTocCollapsed() {
  if (localStorage.getItem('dabarat-toc-collapsed') === '1') {
    document.body.classList.add('toc-collapsed');
  }
})();

/* ── Justify ─────────────────────────────────────────── */
function applyJustify(on) {
  document.body.classList.toggle('justify-mode', on);
  const btn = document.getElementById('justify-toggle');
  if (btn) btn.classList.toggle('active', on);
}

function toggleJustify() {
  const on = !document.body.classList.contains('justify-mode');
  applyJustify(on);
  localStorage.setItem('dabarat-justify', on ? '1' : '');
  fetch('/api/config', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({justify: on})
  }).catch(() => {});
}

(function _restoreJustify() {
  const stored = localStorage.getItem('dabarat-justify');
  const on = stored !== null
    ? stored === '1'
    : !!(window.DABARAT_CONFIG && window.DABARAT_CONFIG.justify);
  if (on) applyJustify(true);
})();

/* ── Opacity ─────────────────────────────────────────── */
const OPACITY_STEPS = [1.0, 0.95, 0.90, 0.85, 0.80, 0.70];
let opacityIndex = parseInt(localStorage.getItem('dabarat-opacity-idx') || '0');
if (opacityIndex < 0 || opacityIndex >= OPACITY_STEPS.length) opacityIndex = 0;

/* Palette values are read from the stylesheet, never hand-copied —
   theme-variables.css is the single source of truth (a copied table
   drifted for two themes before this). getComputedStyle forces a
   synchronous recalc, so reading right after data-theme changes is safe. */
function _themeVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(v) ? v : fallback;
}
function _themeSurfaceRgb() {
  return {
    base:   hexToRgb(_themeVar('--ctp-base',   '#1e1e2e')),
    mantle: hexToRgb(_themeVar('--ctp-mantle', '#181825')),
    crust:  hexToRgb(_themeVar('--ctp-crust',  '#11111b')),
  };
}

/* ── Background Image ────────────────────────────────── */
let bgImageData = localStorage.getItem('dabarat-bg-image') || '';
let bgImageSize = localStorage.getItem('dabarat-bg-size') || 'cover';
let bgImageBlur = parseInt(localStorage.getItem('dabarat-bg-blur') || '0');

function applyBgImage() {
  const root = document.documentElement;
  if (bgImageData) {
    root.style.setProperty('--bg-image-url', 'url(' + bgImageData + ')');
    document.body.classList.add('has-bg-image');
  } else {
    root.style.setProperty('--bg-image-url', 'none');
    document.body.classList.remove('has-bg-image');
  }
  root.style.setProperty('--bg-image-size', bgImageSize);
  root.style.setProperty('--bg-image-blur', bgImageBlur + 'px');
}

function setBgImage(dataUrl) {
  bgImageData = dataUrl || '';
  localStorage.setItem('dabarat-bg-image', bgImageData);
  applyBgImage();
  /* Auto-reduce surface opacity so the image is visible immediately */
  if (bgImageData && opacityIndex === 0) {
    opacityIndex = 3;  /* step 3 = 85% opaque surfaces, 25% image opacity */
  }
  applyOpacity();
}

function clearBgImage() {
  bgImageData = '';
  localStorage.removeItem('dabarat-bg-image');
  applyBgImage();
  applyOpacity();
}

function setBgImageSize(size) {
  bgImageSize = size;
  localStorage.setItem('dabarat-bg-size', bgImageSize);
  applyBgImage();
}

function setBgImageBlur(px) {
  bgImageBlur = Math.max(0, Math.min(30, px));
  localStorage.setItem('dabarat-bg-blur', bgImageBlur);
  applyBgImage();
}

applyBgImage();

/* Background image opacity steps — always visible when image is set */
const BG_IMAGE_OPACITY = [0.12, 0.15, 0.20, 0.25, 0.30, 0.40];

function applyOpacity() {
  const alpha = OPACITY_STEPS[opacityIndex];
  const theme = currentTheme || 'mocha';
  const colors = _themeSurfaceRgb();
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  const isExportLight = document.documentElement.dataset.export === '1'
    && THEME_META[theme] && THEME_META[theme].mode === 'light';
  /* Print/export: light themes flatten to white, except Vellum, whose
     parchment base is the point ("NOT pure white") */
  const exportBg = theme === 'vellum' ? rgba(colors.base, 1) : '#fff';   /* print contract */
  document.documentElement.style.setProperty('--body-bg',
    isExportLight ? exportBg : rgba(colors.base, alpha));
  document.documentElement.style.setProperty('--toc-bg', rgba(colors.mantle, alpha));
  document.documentElement.style.setProperty('--crust-bg', rgba(colors.crust, alpha));

  /* Background image opacity keyed to same opacity step */
  document.documentElement.style.setProperty(
    '--bg-image-opacity',
    bgImageData ? BG_IMAGE_OPACITY[opacityIndex] : 0
  );

  localStorage.setItem('dabarat-opacity-idx', opacityIndex);
}

function toggleOpacity() {
  opacityIndex = (opacityIndex + 1) % OPACITY_STEPS.length;
  applyOpacity();
}
applyOpacity();

/* Cmd+U keybinding */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
    e.preventDefault();
    toggleOpacity();
  }
});

/* Cmd+\ toggle sidebar */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
    e.preventDefault();
    toggleToc();
  }
});

/* Auto-collapse TOC at narrow viewport — JS-driven for smooth transition */
(function _watchTocBreakpoint() {
  const mq = window.matchMedia('(max-width: 900px)');
  let wasNarrow = mq.matches;
  /* The stylesheet only pushes #toc off-canvas via body.toc-collapsed now
     (so it can reopen as an overlay), so a narrow first paint must start
     collapsed — the listener below only fires on change */
  if (wasNarrow) document.body.classList.add('toc-collapsed');
  mq.addEventListener('change', (e) => {
    if (e.matches && !wasNarrow) {
      if (!document.body.classList.contains('toc-collapsed')) {
        document.body.classList.add('toc-collapsed');
      }
    } else if (!e.matches && wasNarrow) {
      if (localStorage.getItem('dabarat-toc-collapsed') !== '1') {
        document.body.classList.remove('toc-collapsed');
      }
    }
    wasNarrow = e.matches;
  });
})();

/* ── Emoji Style ─────────────────────────────────────── */
const EMOJI_STYLES = ['twitter', 'openmoji', 'noto', 'native'];
const EMOJI_CDNS = {
  openmoji: (icon) => 'https://cdn.jsdelivr.net/npm/openmoji@15.1/color/svg/' + icon.toUpperCase() + '.svg',
  noto: (icon) => 'https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@main/svg/emoji_u' + icon.replace(/-/g, '_') + '.svg',
};

function applyEmojiStyle(container) {
  if (emojiStyle === 'native' || typeof twemoji === 'undefined') return;
  const cb = EMOJI_CDNS[emojiStyle];
  if (cb) {
    twemoji.parse(container, { callback: cb });
  } else {
    twemoji.parse(container, { folder: 'svg', ext: '.svg' });
  }
}

function setEmojiStyle(style) {
  if (EMOJI_STYLES.indexOf(style) === -1) return;
  emojiStyle = style;
  localStorage.setItem('dabarat-emoji-style', emojiStyle);
  lastRenderedMd = '';
  if (activeTabId && tabs[activeTabId]) render(tabBody(tabs[activeTabId]) || '');
}

function cycleEmojiStyle() {
  const idx = EMOJI_STYLES.indexOf(emojiStyle);
  setEmojiStyle(EMOJI_STYLES[(idx + 1) % EMOJI_STYLES.length]);
}

/* ── TOC Resize ──────────────────────────────────────── */
(function initTocResize() {
  const MIN_W = 180, MAX_W = 500;
  const saved = parseInt(localStorage.getItem('dabarat-toc-width'));
  if (saved && saved >= MIN_W && saved <= MAX_W) {
    document.documentElement.style.setProperty('--toc-width', saved + 'px');
  }

  const handle = document.getElementById('toc-resize-handle');
  if (!handle) return;

  let dragging = false;
  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    dragging = true;
    handle.classList.add('dragging');
    document.body.classList.add('toc-resizing');
    /* Disable TOC slide transition while dragging */
    document.getElementById('toc').style.transition = 'none';
    document.getElementById('main-area').style.transition = 'none';
    handle.style.transition = 'background 0.15s';
  });

  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    let w = Math.max(MIN_W, Math.min(MAX_W, e.clientX));
    document.documentElement.style.setProperty('--toc-width', w + 'px');
  });

  document.addEventListener('mouseup', function() {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.classList.remove('toc-resizing');
    /* Restore transitions */
    document.getElementById('toc').style.transition = '';
    document.getElementById('main-area').style.transition = '';
    handle.style.transition = '';
    /* Persist */
    const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--toc-width'));
    if (w) localStorage.setItem('dabarat-toc-width', w);
  });
})();

/* ── Color Utilities ────────────────────────────────── */
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}

function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(c => Math.round(Math.max(0,Math.min(255,c))).toString(16).padStart(2,'0')).join('');
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [Math.round(hue2rgb(p, q, h + 1/3) * 255),
          Math.round(hue2rgb(p, q, h) * 255),
          Math.round(hue2rgb(p, q, h - 1/3) * 255)];
}

function luminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(rgb1, rgb2) {
  const l1 = luminance(...rgb1), l2 = luminance(...rgb2);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function lighten(hex, delta) {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  return rgbToHex(...hslToRgb(h, s, Math.max(0, Math.min(1, l + delta))));
}

function darken(hex, delta) { return lighten(hex, -delta); }

function ensureAccessible(textHex, bgHex, minRatio) {
  minRatio = minRatio || 4.5;
  const bgRgb = hexToRgb(bgHex);
  let [h, s, l] = rgbToHsl(...hexToRgb(textHex));
  const bgLight = rgbToHsl(...bgRgb)[2];
  const dir = bgLight > 0.5 ? -0.02 : 0.02;
  for (let i = 0; i < 50; i++) {
    const rgb = hslToRgb(h, s, l);
    if (contrastRatio(rgb, bgRgb) >= minRatio) return rgbToHex(...rgb);
    const nextL = Math.max(0, Math.min(1, l + dir));
    if (nextL === l) break;
    l = nextL;
  }
  return bgLight > 0.5 ? '#000000' : '#ffffff';
}

/* ── Mood-Based Theme Generation ───────────────────── */
const MOOD_SEEDS = {
  'warm earth':  { hue: [20, 45],   sat: [0.30, 0.50], light: [0.15, 0.85] },
  'ocean':       { hue: [190, 230], sat: [0.40, 0.70], light: [0.12, 0.80] },
  'forest':      { hue: [100, 160], sat: [0.30, 0.60], light: [0.10, 0.75] },
  'sunset':      { hue: [0, 40],    sat: [0.50, 0.80], light: [0.15, 0.80] },
  'midnight':    { hue: [220, 270], sat: [0.30, 0.50], light: [0.05, 0.75] },
  'pastel':      { hue: [280, 360], sat: [0.30, 0.50], light: [0.20, 0.90] },
  'lavender':    { hue: [260, 290], sat: [0.30, 0.60], light: [0.12, 0.82] },
  'cherry':      { hue: [340, 370], sat: [0.50, 0.80], light: [0.10, 0.80] },
  'golden':      { hue: [35, 55],   sat: [0.50, 0.70], light: [0.12, 0.85] },
  'arctic':      { hue: [190, 210], sat: [0.15, 0.35], light: [0.10, 0.90] },
  'autumn':      { hue: [15, 45],   sat: [0.40, 0.70], light: [0.12, 0.78] },
  'neon':        { hue: [280, 340], sat: [0.70, 0.90], light: [0.08, 0.75] },
  'coffee':      { hue: [20, 35],   sat: [0.20, 0.40], light: [0.10, 0.75] },
  'moss':        { hue: [80, 140],  sat: [0.20, 0.45], light: [0.08, 0.72] },
  'rose':        { hue: [330, 360], sat: [0.30, 0.60], light: [0.12, 0.82] },
};

function _matchMood(input) {
  const lower = input.toLowerCase();
  let best = null, bestLen = 0;
  for (const key of Object.keys(MOOD_SEEDS)) {
    if (lower.includes(key) && key.length > bestLen) {
      best = key;
      bestLen = key.length;
    }
  }
  return best;
}

function _hueAt(range, t) {
  return range[0] + (range[1] - range[0]) * t;
}

function _addRgbCompanions(vars) {
  const result = {};
  for (const [k, v] of Object.entries(vars)) {
    result[k] = v;
    if (v.startsWith('#')) {
      const rgb = hexToRgb(v);
      result[k + '-rgb'] = rgb.join(',');
    }
  }
  return result;
}

function _buildThemeVars(base, text, subtext0, subtext1, accents, isDark) {
  const surface0 = isDark ? lighten(base, 0.04) : darken(base, 0.03);
  const surface1 = isDark ? lighten(base, 0.08) : darken(base, 0.06);
  const surface2 = isDark ? lighten(base, 0.12) : darken(base, 0.09);
  const overlay0 = isDark ? lighten(base, 0.20) : darken(base, 0.18);
  const overlay1 = isDark ? lighten(base, 0.28) : darken(base, 0.25);
  const overlay2 = isDark ? lighten(base, 0.36) : darken(base, 0.32);
  const mantle = isDark ? darken(base, 0.02) : lighten(base, 0.02);
  const crust = isDark ? darken(base, 0.04) : lighten(base, 0.04);

  const [blue, mauve, red, peach, yellow, green, teal, pink] = accents.concat(
    Array(8).fill(accents[0] || '#888888')
  ).slice(0, 8);

  const vars = {
    '--ctp-base': base, '--ctp-mantle': mantle, '--ctp-crust': crust,
    '--ctp-surface0': surface0, '--ctp-surface1': surface1, '--ctp-surface2': surface2,
    '--ctp-overlay0': overlay0, '--ctp-overlay1': overlay1, '--ctp-overlay2': overlay2,
    '--ctp-text': ensureAccessible(text, base), '--ctp-subtext0': subtext0, '--ctp-subtext1': subtext1,
    '--ctp-blue': ensureAccessible(blue, base, 3), '--ctp-mauve': ensureAccessible(mauve, base, 3),
    '--ctp-red': ensureAccessible(red, base, 3), '--ctp-peach': ensureAccessible(peach, base, 3),
    '--ctp-yellow': ensureAccessible(yellow, base, 3), '--ctp-green': ensureAccessible(green, base, 3),
    '--ctp-teal': ensureAccessible(teal, base, 3), '--ctp-pink': ensureAccessible(pink, base, 3),
    '--ctp-rosewater': pink, '--ctp-flamingo': red, '--ctp-maroon': darken(red, 0.08),
    '--ctp-sky': teal, '--ctp-sapphire': blue, '--ctp-lavender': mauve,
    '--toc-active-bg': isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    '--row-hover-bg': isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    /* Surface-role tokens the stylesheet consumes on cards, menus and
       hover states — without these a generated light theme inherited
       Mocha's surface0 card and surface1 hover from :root */
    '--card-bg': isDark ? surface0 : lighten(base, 0.03),
    '--card-border': `rgba(${hexToRgb(surface1).join(',')}, ${isDark ? 0.5 : 0.8})`,
    '--interactive-hover-bg': isDark ? surface1 : crust,
    '--interactive-muted-bg': isDark
      ? `rgba(${hexToRgb(surface1).join(',')}, 0.85)` : 'rgba(0,0,0,0.06)',
  };
  return _addRgbCompanions(vars);
}

function paletteFromDescription(description) {
  const mood = _matchMood(description);
  if (!mood) return null;

  const seed = MOOD_SEEDS[mood];
  const lower = description.toLowerCase();
  const isDark = /dark|night|midnight|deep|shadow|noir/.test(lower) ||
    (!/light|bright|day|dawn|pastel|soft/.test(lower) && seed.light[0] < 0.15);

  const baseL = isDark ? seed.light[0] + 0.02 : seed.light[1] - 0.03;
  const baseH = _hueAt(seed.hue, 0.5);
  const baseS = seed.sat[0] * 0.6;
  const base = rgbToHex(...hslToRgb(baseH, baseS, baseL));

  const textL = isDark ? 0.88 : 0.18;
  const text = rgbToHex(...hslToRgb(baseH, baseS * 0.3, textL));
  const sub0 = rgbToHex(...hslToRgb(baseH, baseS * 0.25, isDark ? 0.55 : 0.50));
  const sub1 = rgbToHex(...hslToRgb(baseH, baseS * 0.20, isDark ? 0.65 : 0.40));

  const accents = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 8;
    const h = _hueAt(seed.hue, t) + (i * 37) % 360;
    const s = seed.sat[0] + (seed.sat[1] - seed.sat[0]) * ((i % 3) / 2);
    const l = isDark ? 0.65 + (i % 3) * 0.05 : 0.40 + (i % 3) * 0.05;
    accents.push(rgbToHex(...hslToRgb(h % 360, s, l)));
  }

  return _buildThemeVars(base, text, sub0, sub1, accents, isDark);
}

/* ── Image-to-Palette ──────────────────────────────── */
/* Vibrant.js is only needed by the image-theme command, so it loads the
   first time that runs instead of on every page */
const VIBRANT_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/vibrant.js/1.0.0/Vibrant.min.js';
let _vibrantLoading = null;
function loadVibrant() {
  if (typeof Vibrant !== 'undefined') return Promise.resolve();
  if (_vibrantLoading) return _vibrantLoading;
  _vibrantLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = VIBRANT_SRC;
    script.onload = () => resolve();
    script.onerror = () => { _vibrantLoading = null; reject(new Error('Vibrant.js failed to load')); };
    document.head.appendChild(script);
  });
  return _vibrantLoading;
}

async function _extractImagePalette(file) {
  await loadVibrant();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function() {
      const img = new Image();
      img.onload = function() {
        try {
          const vibrant = new Vibrant(img, 64);
          const swatches = vibrant.swatches();
          resolve(swatches);
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function _mapSwatchesToTheme(sw) {
  /* Missing swatches fall back to the active theme's palette, not a
     frozen copy of Mocha */
  const get = (name) => sw[name] ? sw[name].getHex() : null;
  const darkVib = get('DarkVibrant') || _themeVar('--ctp-base', '#1e1e2e');
  const lightVib = get('LightVibrant') || _themeVar('--ctp-text', '#cdd6f4');
  const vibrant = get('Vibrant') || _themeVar('--ctp-blue', '#89b4fa');
  const muted = get('Muted') || _themeVar('--ctp-mauve', '#cba6f7');
  const darkMuted = get('DarkMuted') || _themeVar('--ctp-surface0', '#313244');
  const lightMuted = get('LightMuted') || _themeVar('--ctp-subtext1', '#bac2de');

  const avgLum = (luminance(...hexToRgb(vibrant)) + luminance(...hexToRgb(muted))) / 2;
  const isDark = avgLum < 0.35;

  const base = isDark ? darkVib : lightVib;
  const text = isDark ? lightVib : darkVib;
  const sub0 = isDark ? lightMuted : darkMuted;
  const sub1 = isDark ? lighten(lightMuted, 0.08) : darken(darkMuted, 0.08);

  const [h] = rgbToHsl(...hexToRgb(vibrant));
  const accents = [vibrant, muted];
  for (let i = 2; i < 8; i++) {
    const hue = (h + i * 45) % 360;
    const s = 0.55 + (i % 3) * 0.1;
    const l = isDark ? 0.65 : 0.42;
    accents.push(rgbToHex(...hslToRgb(hue, s, l)));
  }

  return _buildThemeVars(base, text, sub0, sub1, accents, isDark);
}

async function imageToTheme(file) {
  const swatches = await _extractImagePalette(file);
  return _mapSwatchesToTheme(swatches);
}

/* ── Custom Theme Persistence ──────────────────────── */
const CUSTOM_THEMES_KEY = 'dabarat-custom-themes';
const CUSTOM_ACTIVE_KEY = 'dabarat-custom-active';

function getCustomThemes() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || '[]'); }
  catch { return []; }
}

function getActiveThemeLabel() {
  if (currentTheme === '_custom') {
    const activeId = localStorage.getItem(CUSTOM_ACTIVE_KEY);
    const match = getCustomThemes().find(c => c.id === activeId);
    return match ? match.name : 'Custom';
  }
  return THEME_META[currentTheme] ? THEME_META[currentTheme].label : currentTheme;
}

function saveCustomTheme(name, variables, source) {
  const themes = getCustomThemes();
  const id = 'custom-' + Date.now();
  themes.push({ id, name, variables, source: source || 'text', created: Date.now() });
  if (themes.length > 20) {
    const activeId = localStorage.getItem(CUSTOM_ACTIVE_KEY);
    const idx = themes.findIndex(t => t.id !== activeId);
    if (idx !== -1) themes.splice(idx, 1); else themes.shift();
  }
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
  return id;
}

function deleteCustomTheme(id) {
  const themes = getCustomThemes().filter(t => t.id !== id);
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes));
  const active = localStorage.getItem(CUSTOM_ACTIVE_KEY);
  if (active === id) {
    localStorage.removeItem(CUSTOM_ACTIVE_KEY);
    currentTheme = 'mocha';
    applyTheme();
    applyOpacity();
  }
}

function applyCustomTheme(variables, themeId) {
  let style = document.getElementById('custom-theme-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'custom-theme-style';
    document.head.appendChild(style);
  }
  const rules = Object.entries(variables)
    .filter(([k]) => /^--[\w-]+$/.test(k))
    .map(([k, v]) => `  ${k}: ${String(v).replace(/[{}<>]/g, '')};`)
    .join('\n');
  /* color-scheme drives native scrollbars/form controls; :root says dark,
     so a generated light theme needs its own declaration */
  let scheme = 'dark';
  try {
    if (variables['--ctp-base'] && luminance(...hexToRgb(variables['--ctp-base'])) > 0.5) scheme = 'light';
  } catch (e) { /* malformed base — keep dark */ }
  style.textContent = `[data-theme="_custom"] {\n${rules}\n  color-scheme: ${scheme};\n}`;

  currentTheme = '_custom';
  document.documentElement.setAttribute('data-theme', '_custom');
  localStorage.setItem('dabarat-theme', '_custom');
  if (themeId) localStorage.setItem(CUSTOM_ACTIVE_KEY, themeId);

  applyOpacity();   /* reads the freshly injected surfaces from computed style */
}

/* Restore custom theme on startup */
(function _restoreCustom() {
  if (currentTheme !== '_custom') return;
  const activeId = localStorage.getItem(CUSTOM_ACTIVE_KEY);
  if (activeId) {
    const t = getCustomThemes().find(x => x.id === activeId);
    if (t) { applyCustomTheme(t.variables, t.id); return; }
  }
  currentTheme = 'mocha';
  applyTheme(false);
})();
