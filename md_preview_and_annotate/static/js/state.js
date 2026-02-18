/* ── State ────────────────────────────────────────────── */
const tabs = {};
let activeTabId = null;
const annotationsCache = {};
const lastAnnotationMtimes = {};
const tagsCache = {};
let annotateSelection = null;
let defaultAuthor = localStorage.getItem('mdpreview-author') || window.MDPREVIEW_CONFIG.defaultAuthor;

/* Track last-rendered markdown to avoid redundant DOM updates */
let lastRenderedMd = '';
let lastRenderedAnnotationsKey = '';
let currentFrontmatter = null;

/* Variable manifest panel state */
let activeGutterTab = 'notes';
let fillInMode = false;
let fillInValues = {};
