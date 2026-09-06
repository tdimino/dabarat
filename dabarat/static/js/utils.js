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
   frontmatter popup pioneered this pattern; palette, lightbox and the
   instance menu share it now. */
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
