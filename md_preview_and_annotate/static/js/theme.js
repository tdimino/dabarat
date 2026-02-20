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
  'mocha', 'latte',
  'rose-pine', 'rose-pine-dawn',
  'tokyo-storm', 'tokyo-light',
];
const THEME_META = {
  'mocha':          { family: 'catppuccin',  mode: 'dark',  label: 'Catppuccin Mocha' },
  'latte':          { family: 'catppuccin',  mode: 'light', label: 'Catppuccin Latte' },
  'rose-pine':      { family: 'rose-pine',   mode: 'dark',  label: 'Rosé Pine' },
  'rose-pine-dawn': { family: 'rose-pine',   mode: 'light', label: 'Rosé Pine Dawn' },
  'tokyo-storm':    { family: 'tokyo-night',  mode: 'dark',  label: 'Tokyo Night Storm' },
  'tokyo-light':    { family: 'tokyo-night',  mode: 'light', label: 'Tokyo Night Light' },
};
const THEME_PAIRS = {
  'mocha': 'latte', 'latte': 'mocha',
  'rose-pine': 'rose-pine-dawn', 'rose-pine-dawn': 'rose-pine',
  'tokyo-storm': 'tokyo-light', 'tokyo-light': 'tokyo-storm',
};

let currentTheme = localStorage.getItem('dabarat-theme') || 'mocha';
if (!THEME_META[currentTheme] && currentTheme !== '_custom') currentTheme = 'mocha';

function applyTheme() {
  document.documentElement.setAttribute('data-theme', currentTheme);
  const toggle = document.getElementById('theme-toggle');
  const meta = THEME_META[currentTheme];
  if (toggle && meta) toggle.checked = (meta.mode === 'light');
  localStorage.setItem('dabarat-theme', currentTheme);
}
applyTheme();

function toggleTheme() {
  const pair = THEME_PAIRS[currentTheme];
  if (!pair) { localStorage.removeItem(CUSTOM_ACTIVE_KEY); currentTheme = 'mocha'; }
  else { currentTheme = pair; }
  applyTheme();
  applyOpacity();
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
}

/* ── Opacity ─────────────────────────────────────────── */
const OPACITY_STEPS = [1.0, 0.95, 0.90, 0.85, 0.80, 0.70];
let opacityIndex = parseInt(localStorage.getItem('dabarat-opacity-idx') || '0');
if (opacityIndex < 0 || opacityIndex >= OPACITY_STEPS.length) opacityIndex = 0;

const SURFACE_COLORS = {
  'mocha':          { base: [30,30,46],    mantle: [24,24,37],    crust: [17,17,27]   },
  'latte':          { base: [239,241,245], mantle: [230,233,239], crust: [220,224,232] },
  'rose-pine':      { base: [25,23,36],    mantle: [21,19,32],    crust: [17,15,28]   },
  'rose-pine-dawn': { base: [255,250,243], mantle: [250,244,237], crust: [242,233,225] },
  'tokyo-storm':    { base: [36,40,59],    mantle: [31,35,53],    crust: [27,30,46]   },
  'tokyo-light':    { base: [230,231,237], mantle: [220,222,227], crust: [203,205,212] },
};

function applyOpacity() {
  const alpha = OPACITY_STEPS[opacityIndex];
  const theme = currentTheme || 'mocha';
  const colors = SURFACE_COLORS[theme] || SURFACE_COLORS['mocha'];
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  document.documentElement.style.setProperty('--body-bg', rgba(colors.base, alpha));
  document.documentElement.style.setProperty('--toc-bg', rgba(colors.mantle, alpha));
  document.documentElement.style.setProperty('--crust-bg', rgba(colors.crust, alpha));
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
  if (activeTabId && tabs[activeTabId]) render(tabs[activeTabId].content || '');
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
function _extractImagePalette(file) {
  return new Promise((resolve, reject) => {
    if (typeof Vibrant === 'undefined') {
      reject(new Error('Vibrant.js not loaded'));
      return;
    }
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
  const get = (name) => sw[name] ? sw[name].getHex() : null;
  const darkVib = get('DarkVibrant') || '#1e1e2e';
  const lightVib = get('LightVibrant') || '#cdd6f4';
  const vibrant = get('Vibrant') || '#89b4fa';
  const muted = get('Muted') || '#cba6f7';
  const darkMuted = get('DarkMuted') || '#313244';
  const lightMuted = get('LightMuted') || '#bac2de';

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
  style.textContent = `[data-theme="_custom"] {\n${rules}\n}`;

  currentTheme = '_custom';
  document.documentElement.setAttribute('data-theme', '_custom');
  localStorage.setItem('dabarat-theme', '_custom');
  if (themeId) localStorage.setItem(CUSTOM_ACTIVE_KEY, themeId);

  /* Update SURFACE_COLORS for opacity calculations */
  const base = variables['--ctp-base'] ? hexToRgb(variables['--ctp-base']) : [30,30,46];
  const mantle = variables['--ctp-mantle'] ? hexToRgb(variables['--ctp-mantle']) : [24,24,37];
  const crust = variables['--ctp-crust'] ? hexToRgb(variables['--ctp-crust']) : [17,17,27];
  SURFACE_COLORS['_custom'] = { base, mantle, crust };
  applyOpacity();
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
  applyTheme();
})();
