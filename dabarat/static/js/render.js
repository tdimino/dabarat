/* ── TOC ──────────────────────────────────────────────── */
let _tocBoundList = null;
let _tocJumpGeneration = 0;
let _tocActiveJump = null;
let _tocHashOwner = null;
let _tocRenderedTabId = null;
let _tocInitialHashReconciled = false;
let _tocCenterAfterSpy = false;

function _tocNormalDocumentActive() {
  return !homeScreenActive && !editState.active && !diffState.active;
}

function _tocHeading(targetId) {
  const content = document.getElementById('content');
  const target = document.getElementById(targetId);
  if (!content || !target || !target.matches('h1, h2, h3, h4')) return null;
  return target.closest('#content') === content ? target : null;
}

function getTocHeadingOffset() {
  const content = document.getElementById('content');
  if (!content) return 80;
  const value = parseFloat(getComputedStyle(content).getPropertyValue('--toc-heading-offset'));
  return Number.isFinite(value) ? value : 80;
}

function _tocDecodedHash() {
  if (!window.location.hash) return '';
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch (e) {
    return '';
  }
}

function _tocReplaceHash(targetId) {
  const url = new URL(window.location.href);
  url.hash = targetId;
  history.replaceState(history.state, '', url);
  _tocHashOwner = { targetId: targetId, tabId: activeTabId };
}

function _tocClearOwnedHash(owner) {
  const expected = owner || _tocHashOwner;
  if (!expected || !_tocHashOwner ||
      expected.targetId !== _tocHashOwner.targetId || expected.tabId !== _tocHashOwner.tabId) return;
  if (_tocDecodedHash() === expected.targetId) {
    const url = new URL(window.location.href);
    url.hash = '';
    history.replaceState(history.state, '', url);
  }
  _tocHashOwner = null;
}

function cancelTocJump(options) {
  const opts = options || {};
  const jump = _tocActiveJump;
  _tocJumpGeneration++;
  _tocActiveJump = null;
  _tocCenterAfterSpy = false;
  if (opts.clearHash) {
    const owner = Object.prototype.hasOwnProperty.call(opts, 'owner') ? opts.owner : (jump ? {
      targetId: jump.targetId,
      tabId: jump.tabId,
    } : _tocHashOwner);
    if (owner) _tocClearOwnedHash(owner);
  }
}

function centerTocLink(link, behavior) {
  const tocScroll = document.getElementById('toc-scroll');
  if (!tocScroll || !link || !tocScroll.contains(link)) return;
  const linkRect = link.getBoundingClientRect();
  const scrollRect = tocScroll.getBoundingClientRect();
  const linkCenter = tocScroll.scrollTop + (linkRect.top - scrollRect.top) + linkRect.height / 2;
  const requestedTop = linkCenter - tocScroll.clientHeight / 2;
  const maxTop = Math.max(0, tocScroll.scrollHeight - tocScroll.clientHeight);
  const top = Math.max(0, Math.min(requestedTop, maxTop));
  tocScroll.scrollTo({
    top: top,
    behavior: _prefersReducedMotion ? 'auto' : (behavior || 'smooth'),
  });
}

function _tocFinishJump(generation) {
  if (!_tocActiveJump || _tocActiveJump.generation !== generation) return;
  _tocActiveJump = null;
  _tocCenterAfterSpy = true;
  updateActiveHeading();
}

function _tocClampedTop(scroller, target) {
  const requestedTop = scroller.scrollTop + target.getBoundingClientRect().top - getTocHeadingOffset();
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  return Math.max(0, Math.min(requestedTop, maxTop));
}

function navigateToTocHeading(targetId, options) {
  const opts = options || {};
  if (!_tocNormalDocumentActive()) return false;
  const target = _tocHeading(targetId);
  if (!target) return false;

  const scroller = document.scrollingElement || document.documentElement;
  const top = _tocClampedTop(scroller, target);

  /* A polling re-render restarting a retained jump that is already within
     tolerance must not re-issue the scroll: with a file changing every poll
     cycle, each restart would reset the timeout and lurch the viewport. */
  if (opts.restarted && Math.abs(scroller.scrollTop - top) <= 2) {
    _tocFinishJump(_tocActiveJump ? _tocActiveJump.generation : _tocJumpGeneration);
    return true;
  }

  const generation = ++_tocJumpGeneration;
  const jump = {
    generation: generation,
    targetId: targetId,
    tabId: activeTabId,
    target: target,
    top: top,
    startedAt: performance.now(),
    corrected: false,
  };
  _tocActiveJump = jump;

  if (opts.syncHash !== false) _tocReplaceHash(targetId);

  window.scrollTo({
    top: top,
    behavior: _prefersReducedMotion ? 'auto' : 'smooth',
  });

  function monitor() {
    if (!_tocActiveJump || _tocActiveJump.generation !== generation) return;
    if (activeTabId !== jump.tabId || _tocRenderedTabId !== jump.tabId) {
      cancelTocJump({ clearHash: true, owner: { targetId: jump.targetId, tabId: jump.tabId } });
      return;
    }
    if (!_tocNormalDocumentActive()) {
      cancelTocJump({ clearHash: false });
      return;
    }
    if (!jump.target.isConnected || _tocHeading(jump.targetId) !== jump.target) {
      cancelTocJump({ clearHash: true, owner: { targetId: jump.targetId, tabId: jump.tabId } });
      return;
    }
    const settled = Math.abs(scroller.scrollTop - jump.top) <= 2;
    const timedOut = performance.now() - jump.startedAt >= 2000;
    if (settled && !jump.corrected) {
      /* Images or fonts loading above the target may have moved it while the
         scroll was in flight. Re-measure once; re-issue if it drifted. */
      const currentTop = _tocClampedTop(scroller, jump.target);
      if (Math.abs(currentTop - jump.top) > 2) {
        jump.corrected = true;
        jump.top = currentTop;
        jump.startedAt = performance.now();
        window.scrollTo({
          top: currentTop,
          behavior: _prefersReducedMotion ? 'auto' : 'smooth',
        });
        requestAnimationFrame(monitor);
        return;
      }
    }
    if (settled || timedOut) {
      _tocFinishJump(generation);
      return;
    }
    requestAnimationFrame(monitor);
  }
  requestAnimationFrame(monitor);
  return true;
}

function handleTocClick(event) {
  const list = event.currentTarget;
  const target = event.target instanceof Element ? event.target : null;
  const link = target ? target.closest('a[data-target]') : null;
  if (!link || !list.contains(link) || link.closest('#toc-list') !== list) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
      (event.button !== undefined && event.button !== 0)) return;
  event.preventDefault();
  if (!_tocNormalDocumentActive()) return;
  navigateToTocHeading(link.dataset.target, { syncHash: true });
}

function buildToc(headings) {
  const toc = document.getElementById('toc-list');
  if (!toc) return;
  toc.innerHTML = '';
  headings.forEach((h, i) => {
    const level = h.tagName.toLowerCase();
    const text = h.textContent;
    const li = document.createElement('li');
    li.style.animationDelay = (i * 0.02) + 's';
    const a = document.createElement('a');
    a.href = '#' + h.id;
    a.textContent = text;
    a.className = 'toc-' + level;
    a.dataset.target = h.id;
    li.appendChild(a);
    toc.appendChild(li);
  });
  if (_tocBoundList !== toc) {
    toc.addEventListener('click', handleTocClick);
    _tocBoundList = toc;
  }
}

/* Scroll spy — throttled with rAF */
let scrollSpyPending = false;
function updateActiveHeading() {
  if (scrollSpyPending) return;
  scrollSpyPending = true;
  requestAnimationFrame(() => {
    scrollSpyPending = false;
    const forceCenter = _tocCenterAfterSpy;
    _tocCenterAfterSpy = false;
    if (!_tocNormalDocumentActive()) return;
    const headings = document.querySelectorAll('#content h1, #content h2, #content h3, #content h4');
    const links = document.querySelectorAll('#toc-list a[data-target]');
    let current = '';
    const offset = getTocHeadingOffset();

    headings.forEach(h => {
      const rect = h.getBoundingClientRect();
      /* +2px epsilon: a completed jump can land the heading a fraction of
         a pixel below the offset, which must still count as active. */
      if (rect.top <= offset + 2) current = h.id;
    });

    /* At document bottom the last heading may sit below the offset line
       forever (not enough content under it) — treat it as active anyway. */
    const scroller = document.scrollingElement || document.documentElement;
    if (headings.length &&
        scroller.scrollTop >= Math.max(0, scroller.scrollHeight - scroller.clientHeight) - 2) {
      current = headings[headings.length - 1].id;
    }

    links.forEach(a => {
      a.classList.toggle('active', a.dataset.target === current);
    });

    const activeLink = document.querySelector('#toc-list a.active');
    if (activeLink && !_tocActiveJump) {
      const sc = document.getElementById('toc-scroll');
      const lr = activeLink.getBoundingClientRect();
      const sr = sc.getBoundingClientRect();
      if (forceCenter || lr.top < sr.top + 20 || lr.bottom > sr.bottom - 40) {
        centerTocLink(activeLink, 'smooth');
      }
    }
  });
}
window.addEventListener('scroll', updateActiveHeading, { passive: true });

/* ── Marked extensions ────────────────────────────────── */
if (typeof markedFootnote === 'function') {
  marked.use(markedFootnote());
}

/* ── Render ───────────────────────────────────────────── */
/* Render markdown for a tab: the stripped body when frontmatter exists,
   the raw content otherwise. tab.content always holds the raw file. */
function tabBody(tab) {
  return tab.body !== undefined ? tab.body : tab.content;
}

let lastRenderKey = '';

function render(md) {
  /* Skip if content AND frontmatter are unchanged — a frontmatter-only
     edit must still refresh the indicator bar and semantic styles.
     lastRenderedMd stays pure markdown (variables.js parses it); the
     composite skip-key lives separately. Setting lastRenderedMd = ''
     still forces a repaint. */
  const renderKey = md + '\x00' + (currentFrontmatter ? JSON.stringify(currentFrontmatter) : '');
  if (md === lastRenderedMd && renderKey === lastRenderKey) return;
  lastRenderedMd = md;
  lastRenderKey = renderKey;

  const renderTabId = activeTabId;
  const tabChanged = _tocRenderedTabId !== null && _tocRenderedTabId !== renderTabId;
  const retainedJumpTarget = !tabChanged && _tocActiveJump && _tocActiveJump.tabId === renderTabId
    ? _tocActiveJump.targetId : null;
  if (tabChanged) {
    const previousTabId = _tocRenderedTabId;
    cancelTocJump({
      clearHash: true,
      owner: _tocHashOwner && _tocHashOwner.tabId === previousTabId ? _tocHashOwner : null,
    });
  }
  _tocRenderedTabId = renderTabId;

  const html = marked.parse(md, { gfm: true, breaks: false });
  const content = document.getElementById('content');
  content.innerHTML = html;

  /* Assign IDs and construct the TOC from the same pre-emoji live headings. */
  const headings = Array.from(content.querySelectorAll('h1, h2, h3, h4'));
  headings.forEach((h, i) => {
    h.id = slugify(h.textContent) + '-' + i;
  });
  buildToc(headings);
  applyEmojiStyle(content);

  /* Wrap tables in scroll containers for horizontal overflow */
  content.querySelectorAll('table').forEach(table => {
    if (table.parentElement.classList.contains('table-scroll')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  /* Syntax highlighting */
  if (typeof hljs !== 'undefined') {
    content.querySelectorAll('pre code').forEach(el => {
      hljs.highlightElement(el);
    });
  }

  /* Show file mtime as the "last updated" date+time */
  const mtime = activeTabId && tabs[activeTabId] ? tabs[activeTabId].mtime : 0;
  if (mtime) {
    const d = new Date(mtime * 1000);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    document.getElementById('last-updated').textContent = dateStr + ' ' + timeStr;
  } else {
    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
  }

  updateWordCount(md);

  /* Render frontmatter indicator bar (click to open popup) */
  renderFrontmatterIndicator(currentFrontmatter);

  /* Semantic styles — frontmatter-driven custom coloring */
  applySemanticStyles(currentFrontmatter);

  /* Variable highlighting — must run BEFORE annotation highlights
     to avoid corrupting annotation text range offsets */
  applyVariableHighlights(currentFrontmatter);

  /* Re-apply annotation highlights after content change */
  applyAnnotationHighlights();

  /* Attach lightbox to content images */
  if (typeof attachLightboxToContent === 'function') attachLightboxToContent();

  /* Refresh variables panel if it's the active gutter tab */
  if (activeGutterTab === 'variables') renderVariables();

  updateActiveHeading();

  /* Reconcile navigation only after all render-time wrappers are in place. */
  if (_tocNormalDocumentActive()) {
    if (retainedJumpTarget) {
      if (!navigateToTocHeading(retainedJumpTarget, { syncHash: false, restarted: true })) {
        cancelTocJump({ clearHash: true });
      }
    } else if (!tabChanged && _tocHashOwner && _tocHashOwner.tabId === renderTabId &&
               !_tocHeading(_tocHashOwner.targetId)) {
      _tocClearOwnedHash(_tocHashOwner);
    }

    if (!_tocInitialHashReconciled) {
      _tocInitialHashReconciled = true;
      const initialTarget = _tocDecodedHash();
      if (initialTarget && _tocHeading(initialTarget)) {
        navigateToTocHeading(initialTarget, { syncHash: true });
      }
    }
  }
}

/* ── Word Count ───────────────────────────────────────── */
function updateWordCount(md) {
  const text = md.replace(/[#*_`~\[\]()>|\\-]/g, ' ').trim();
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const mins = Math.max(1, Math.ceil(words / 250));
  const el = document.getElementById('word-count');
  if (el) el.textContent = words.toLocaleString() + ' words \u00b7 ' + mins + ' min read';
}
