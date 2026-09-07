/* ── Utility ──────────────────────────────────────────── */
function slugify(text) {
  return text.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
}

function escapeHtml(s) {
  /* Explicit table, not the textContent/innerHTML trick — that never escapes
     quotes, so values landing in attributes stay injectable via hostile
     filenames like `x" onfocus="...` */
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Rendered-markdown sanitizer ──
   marked runs with raw HTML enabled (authored <details>, <p align>, inline
   SVG badges are all wanted), so every parse result goes through here
   before it touches the DOM: a hostile .md must not run script on the
   origin that owns /api/save and /api/shutdown. DOMPurify (pinned + SRI
   in template.py) does the work; if its CDN is unreachable the DOM-based
   fallback below strips the scriptable parts rather than failing open.
   Kept: id/class (TOC + footnotes), data- and aria- attributes (marked-footnote),
   <input type=checkbox> (task lists), style attributes, target=_blank,
   data: URLs on images, file:/obsidian:/vscode: links. Dropped:
   <script>/<iframe>/<object>/<embed>/<style>/<form>, on* handlers,
   javascript: URLs. */
const _PURIFY_OPTS = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  FORBID_TAGS: ['style', 'form'],
  ADD_ATTR: ['target'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|file|obsidian|vscode|vscode-insiders|cursor):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};
let _sanitizerWarned = false;

function sanitizeHtml(html) {
  if (window.DOMPurify && typeof DOMPurify.sanitize === 'function') {
    return DOMPurify.sanitize(html, _PURIFY_OPTS);
  }
  if (!_sanitizerWarned) {
    _sanitizerWarned = true;
    console.warn('DOMPurify did not load — rendering through the built-in fallback sanitizer');
  }
  return _fallbackSanitize(html);
}

/* Parses into an inert <template> (no script execution, no fetches),
   removes the scriptable elements and attributes, and serialises back.
   Deliberately conservative: it exists for the offline case only.
   Dropped wholesale: the script carriers, the SVG SMIL animators (an
   <animate attributeName="href" values="javascript:…"> smuggles a URL
   past the attribute pass), and the mXSS carriers whose contents parse
   differently on the way back (<template> content is never walked by
   querySelectorAll; noscript/xmp/plaintext/math switch parser modes). */
const _FALLBACK_DROP = 'script, iframe, object, embed, style, form, link, meta, base, frame, frameset, applet, '
  + 'animate, set, animateMotion, animateTransform, animateColor, '
  + 'math, noscript, noembed, noframes, xmp, plaintext, template';
const _FALLBACK_URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'srcdoc', 'poster', 'data'];
function _fallbackStrip(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll(_FALLBACK_DROP).forEach(n => n.remove());
  tpl.content.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(a => {
      const name = a.name.toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc') { el.removeAttribute(a.name); return; }
      if (_FALLBACK_URL_ATTRS.includes(name)) {
        const v = a.value.replace(/[\s\u0000-\u001f]/g, '').toLowerCase();
        const dataImage = name === 'src' && el.tagName === 'IMG' && v.startsWith('data:image/');
        if (/^(javascript|vbscript|data):/.test(v) && !dataImage) el.removeAttribute(a.name);
      }
    });
  });
  return tpl.innerHTML;
}
/* Serialise-then-reparse is the mXSS shape: the live DOM re-parses a
   string the sanitizer only saw as a tree. The output is trusted once a
   second pass changes nothing; markup that never settles is shown as text. */
function _fallbackSanitize(html) {
  let out = _fallbackStrip(html);
  for (let i = 0; i < 2; i++) {
    const again = _fallbackStrip(out);
    if (again === out) return out;
    out = again;
  }
  return '<pre>' + escapeHtml(html) + '</pre>';
}

/* Shared relative time formatter */
const _sharedRtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto', style: 'short' });

function formatTimeAgoShared(isoTimestamp) {
  const diffMs = new Date(isoTimestamp) - new Date();
  const units = [
    ['day', 86400000], ['hour', 3600000], ['minute', 60000], ['second', 1000]
  ];
  for (const [name, ms] of units) {
    if (Math.abs(diffMs) >= ms) return _sharedRtf.format(Math.round(diffMs / ms), name);
  }
  return 'now';
}

/* ── Dialog focus primitive ───────────────────────────── */
/* One place for "focus goes in on open and comes back on close". Modal
   dialogs also keep Tab inside. Returns {close} — call it from the
   dialog's own close path (this never removes the element). The
   frontmatter popup pioneered this pattern and keeps its own copy (its
   Tab trap is interleaved with scroll locking), as does the instance
   menu (anchored, non-modal, hand-rolled in showInstanceMenu); the
   palette and lightbox use this helper. */
function openDialog(el, opts) {
  opts = opts || {};
  const opener = opts.returnTo || document.activeElement;
  const focusables = () => Array.from(el.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
    .filter(n => n.offsetParent !== null || n === document.activeElement);
  let target = null;
  if (typeof opts.initialFocus === 'string') target = el.querySelector(opts.initialFocus);
  else if (opts.initialFocus) target = opts.initialFocus;
  if (!target) target = focusables()[0] || el;
  if (target === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  requestAnimationFrame(() => { if (target && target.isConnected) target.focus(); });

  let trap = null;
  if (opts.modal) {
    el.setAttribute('aria-modal', 'true');
    trap = (e) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) { e.preventDefault(); el.focus(); return; }
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', trap, true);
  }
  let closed = false;
  return {
    close(opts2) {
      if (closed) return;
      closed = true;
      if (trap) document.removeEventListener('keydown', trap, true);
      const skip = opts2 && opts2.skipFocusReturn;
      if (!skip && opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
    },
  };
}

/* Roving tabindex over a flat list: one item sits in the tab order,
   ArrowUp/Down (plus Left/Right with opts.grid) move focus with wrap,
   Home/End jump, Enter/Space activate via click(). Items get opts.role
   (default 'option', pass null to leave their native role) and the
   container opts.containerRole (default 'listbox', null to skip).
   Safe to call again after a re-render: the listeners are bound once per
   container, a later call only re-seeds the tab stop. Keys are ignored
   while focus sits on a control inside an item (its own Enter wins). */
function rovingList(container, itemSelector, opts) {
  if (!container) return;
  opts = opts || {};
  const items = () => Array.from(container.querySelectorAll(itemSelector));
  const seed = () => {
    const list = items();
    const current = list.find(el => el.getAttribute('tabindex') === '0') || list[0];
    list.forEach(el => {
      if (opts.role !== null) el.setAttribute('role', opts.role || 'option');
      el.setAttribute('tabindex', el === current ? '0' : '-1');
    });
  };
  if (opts.containerRole !== null) container.setAttribute('role', opts.containerRole || 'listbox');
  seed();
  if (container._rovingBound) return;
  container._rovingBound = true;
  container.addEventListener('focusin', (e) => {
    const el = e.target.closest(itemSelector);
    if (!el || !container.contains(el) || e.target !== el) return;
    items().forEach(x => x.setAttribute('tabindex', x === el ? '0' : '-1'));
  });
  container.addEventListener('keydown', (e) => {
    const cur = document.activeElement;
    if (!cur || !cur.matches(itemSelector)) return;
    const list = items();
    const idx = list.indexOf(cur);
    if (idx < 0) return;
    const fwd = e.key === 'ArrowDown' || (opts.grid && e.key === 'ArrowRight');
    const back = e.key === 'ArrowUp' || (opts.grid && e.key === 'ArrowLeft');
    let next = null;
    if (fwd) next = list[(idx + 1) % list.length];
    else if (back) next = list[(idx - 1 + list.length) % list.length];
    else if (e.key === 'Home') next = list[0];
    else if (e.key === 'End') next = list[list.length - 1];
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cur.click(); return; }
    if (next) { e.preventDefault(); next.focus(); }
  });
}
