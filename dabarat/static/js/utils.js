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
