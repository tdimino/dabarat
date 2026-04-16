/* ── Utility ──────────────────────────────────────────── */
function slugify(text) {
  return text.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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
