/* ── Font Size ────────────────────────────────────────── */
let currentSize = parseInt(localStorage.getItem('mdpreview-fontsize') || '15');

function applyFontSize() {
  document.documentElement.style.setProperty('--base-size', currentSize + 'px');
  const display = document.getElementById('font-size-display');
  if (display) display.textContent = currentSize;
  localStorage.setItem('mdpreview-fontsize', currentSize);
}
applyFontSize();

function adjustFont(delta) {
  currentSize = Math.max(11, Math.min(22, currentSize + delta));
  applyFontSize();
}

/* ── TOC Font Size ───────────────────────────────────── */
let tocSize = parseInt(localStorage.getItem('mdpreview-toc-fontsize') || '0');

function applyTocFontSize() {
  document.documentElement.style.setProperty('--toc-size-offset', tocSize + 'px');
  const display = document.getElementById('toc-font-size-display');
  if (display) display.textContent = tocSize === 0 ? 'A' : (tocSize > 0 ? '+' + tocSize : String(tocSize));
  localStorage.setItem('mdpreview-toc-fontsize', tocSize);
}
applyTocFontSize();

function adjustTocFont(delta) {
  tocSize = Math.max(-4, Math.min(6, tocSize + delta));
  applyTocFontSize();
}

/* ── Theme ────────────────────────────────────────────── */
let currentTheme = localStorage.getItem('mdpreview-theme') || 'mocha';
function applyTheme() {
  document.documentElement.setAttribute('data-theme', currentTheme);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.checked = (currentTheme === 'latte');
  localStorage.setItem('mdpreview-theme', currentTheme);
}
applyTheme();

function toggleTheme() {
  currentTheme = currentTheme === 'mocha' ? 'latte' : 'mocha';
  applyTheme();
  applyOpacity();
}

function toggleToc() {
  document.body.classList.toggle('toc-collapsed');
}

/* ── Opacity ─────────────────────────────────────────── */
const OPACITY_STEPS = [1.0, 0.95, 0.90, 0.85, 0.80, 0.70];
let opacityIndex = parseInt(localStorage.getItem('mdpreview-opacity-idx') || '0');
if (opacityIndex < 0 || opacityIndex >= OPACITY_STEPS.length) opacityIndex = 0;

const SURFACE_COLORS = {
  mocha:  { base: [30,30,46],   mantle: [24,24,37],   crust: [17,17,27] },
  latte:  { base: [239,241,245], mantle: [230,233,239], crust: [220,224,232] }
};

function applyOpacity() {
  const alpha = OPACITY_STEPS[opacityIndex];
  const theme = currentTheme || 'mocha';
  const colors = SURFACE_COLORS[theme];
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  document.documentElement.style.setProperty('--body-bg', rgba(colors.base, alpha));
  document.documentElement.style.setProperty('--toc-bg', rgba(colors.mantle, alpha));
  document.documentElement.style.setProperty('--crust-bg', rgba(colors.crust, alpha));
  localStorage.setItem('mdpreview-opacity-idx', opacityIndex);
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

/* ── TOC Resize ──────────────────────────────────────── */
(function initTocResize() {
  const MIN_W = 180, MAX_W = 500;
  const saved = parseInt(localStorage.getItem('mdpreview-toc-width'));
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
    if (w) localStorage.setItem('mdpreview-toc-width', w);
  });
})();
