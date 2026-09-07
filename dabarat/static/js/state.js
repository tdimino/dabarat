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

/* Reduced-motion preference — live: the CSS blanket already follows the
   OS toggle, and the Motion One guards (`window.Motion && !_prefersReducedMotion`)
   read this variable at call time, so it must follow too */
let _prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Inactive tabs start with only a changeKey (init.js) — content arrives on
   first activation. `loaded` is the truth; content truthiness is kept as a
   fallback for paths that assign content directly (save, restore), and a
   legitimately empty file is loaded once fetched. Every "render if we have
   the document" fall-through must use this, never `t.content` alone. */
function _tabLoaded(t) {
  return !!(t && (t.loaded || t.content));
}
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
  _prefersReducedMotion = e.matches;
});

/* Variable manifest panel state */
let activeGutterTab = 'notes';
let fillInMode = false;
let fillInValues = {};

/* Workspace state */
let _activeWorkspace = null;     // Parsed workspace JSON ({ version, name, folders, files })
let _activeWorkspacePath = localStorage.getItem('dabarat-workspace-path') || null;
