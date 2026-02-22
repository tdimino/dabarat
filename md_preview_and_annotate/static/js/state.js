/* ── localStorage migration: mdpreview-* → dabarat-* ─── */
(function() {
  if (localStorage.getItem('dabarat-migrated')) return;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('mdpreview-')) {
      const nk = 'dabarat-' + k.slice(10);
      if (!localStorage.getItem(nk)) localStorage.setItem(nk, localStorage.getItem(k));
    }
  }
  localStorage.setItem('dabarat-migrated', '1');
})();

/* ── State ────────────────────────────────────────────── */
const tabs = {};
let activeTabId = null;
const annotationsCache = {};
const lastAnnotationMtimes = {};
const tagsCache = {};
let annotateSelection = null;
let defaultAuthor = localStorage.getItem('dabarat-author') || window.DABARAT_CONFIG.defaultAuthor;

/* Track last-rendered markdown to avoid redundant DOM updates */
let lastRenderedMd = '';
let lastRenderedAnnotationsKey = '';
let currentFrontmatter = null;

/* Emoji style: twitter | openmoji | noto | native */
let emojiStyle = localStorage.getItem('dabarat-emoji-style') || 'twitter';

/* Reduced-motion preference — checked once at load */
const _prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Variable manifest panel state */
let activeGutterTab = 'notes';
let fillInMode = false;
let fillInValues = {};

/* Workspace state */
let _activeWorkspace = null;     // Parsed workspace JSON ({ version, name, folders, files })
let _activeWorkspacePath = localStorage.getItem('dabarat-workspace-path') || null;
