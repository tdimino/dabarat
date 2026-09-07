/* ── Annotations Toggle & Gutter Overlay ──────────────── */
function updateAnnotationsBadge(count) {
  const toggle = document.getElementById('annotations-toggle');
  const badge = document.getElementById('ann-count-badge');
  const gutterCount = document.getElementById('ann-gutter-count');
  if (!toggle || !badge) return;

  if (count > 0) {
    toggle.classList.add('has-annotations');
    badge.textContent = count;
  } else {
    toggle.classList.remove('has-annotations');
    badge.textContent = '0';
  }

  if (gutterCount) gutterCount.textContent = count > 0 ? count : '';
  syncGutterLayout();
}

/* Over 1400px the gutter is a native column beside the document; under
   that it is an overlay opened from the Notes float. Either way it can be
   dismissed: the header × (always painted) hides the native column and
   remembers the choice, and the Notes float returns to reopen it. Before
   this the wide layout had no close at all — the × only rendered in
   overlay mode and the float column sat on top of the gutter header. */
const GUTTER_HIDDEN_KEY = 'dabarat-gutter-hidden';
const _gutterNativeMq = window.matchMedia('(min-width: 1401px)');

function _gutterIsNativeWidth() { return _gutterNativeMq.matches; }

function _gutterHiddenPref() {
  try { return localStorage.getItem(GUTTER_HIDDEN_KEY) === '1'; } catch (e) { return false; }
}

/* body.gutter-visible mirrors whether the gutter is actually painted —
   native column, overlay, or neither (home/edit/diff hide it inline). The
   float column reads it to step left of the gutter; the Notes float hides
   itself (.gutter-native) while the native column is showing. */
function syncGutterLayout() {
  const gutter = document.getElementById('annotations-gutter');
  const shown = !!gutter && getComputedStyle(gutter).display !== 'none';
  document.body.classList.toggle('gutter-visible', shown);
  const toggle = document.getElementById('annotations-toggle');
  if (toggle) toggle.classList.toggle('gutter-native', shown && _gutterIsNativeWidth());
}

function setGutterHidden(hidden) {
  document.documentElement.classList.toggle('gutter-hidden', hidden);
  try { localStorage.setItem(GUTTER_HIDDEN_KEY, hidden ? '1' : '0'); } catch (e) { /* private mode */ }
  syncGutterLayout();
}

/* Notes float and the palette's "Toggle Annotations" */
function toggleGutter() {
  if (_gutterIsNativeWidth()) {
    setGutterHidden(!document.documentElement.classList.contains('gutter-hidden'));
    return;
  }
  const gutter = document.getElementById('annotations-gutter');
  if (gutter.classList.contains('overlay-open')) closeGutterOverlay();
  else openGutterOverlay();
}

/* Make sure the gutter is on screen in whichever form this width uses —
   the annotate carousel and "Show Variables" need its panels visible */
function revealGutter() {
  if (_gutterIsNativeWidth()) setGutterHidden(false);
  else openGutterOverlay();
}

/* Header ×: hides the native column (remembered) or closes the overlay */
function dismissGutter() {
  if (_gutterIsNativeWidth()) setGutterHidden(true);
  else closeGutterOverlay();
}

let _gutterDismissCtrl = null;

function openGutterOverlay() {
  /* The two right-side panels are mutually exclusive — keep gutterMode honest */
  if (typeof gutterMode !== 'undefined' && gutterMode === 'versions') closeVersionPanel();
  const gutter = document.getElementById('annotations-gutter');
  gutter.classList.add('overlay-open');

  /* Clean up any previous listener set */
  if (_gutterDismissCtrl) _gutterDismissCtrl.abort();
  _gutterDismissCtrl = new AbortController();
  const signal = _gutterDismissCtrl.signal;

  const ignoreSelectors = [
    '#annotations-gutter',
    '#annotations-toggle',
    '.annotation-carousel',
    '.annotation-highlight',
    '#annotate-carousel'
  ];

  let mousedownOutside = false;

  /* Dual-event pattern: mousedown+mouseup must BOTH be outside */
  document.addEventListener('mousedown', (e) => {
    mousedownOutside = !ignoreSelectors.some(sel => e.target.closest(sel));
  }, { signal });

  document.addEventListener('mouseup', (e) => {
    /* Selection guard: don't dismiss if user was selecting text */
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) return;

    const upOutside = !ignoreSelectors.some(sel => e.target.closest(sel));
    if (mousedownOutside && upOutside) {
      closeGutterOverlay();
    }
  }, { signal });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      /* Don't dismiss if palette or other modal is open */
      const backdrop = document.querySelector('.palette-backdrop');
      if (backdrop && backdrop.classList.contains('visible')) return;
      closeGutterOverlay();
    }
  }, { signal });
}

function closeGutterOverlay() {
  const gutter = document.getElementById('annotations-gutter');
  gutter.classList.remove('overlay-open');
  if (_gutterDismissCtrl) {
    _gutterDismissCtrl.abort();
    _gutterDismissCtrl = null;
  }
}

document.getElementById('annotations-toggle').onclick = toggleGutter;
document.getElementById('ann-gutter-close').onclick = dismissGutter;

/* Keep body.gutter-visible honest without touching every mode switch:
   home/edit/diff hide the gutter inline and the overlay is a class, so one
   attribute observer plus the width breakpoint covers every path */
(function () {
  const gutter = document.getElementById('annotations-gutter');
  if (!gutter) return;
  if (_gutterHiddenPref()) document.documentElement.classList.add('gutter-hidden');
  new MutationObserver(syncGutterLayout)
    .observe(gutter, { attributes: true, attributeFilter: ['style', 'class'] });
  /* Widening past the breakpoint with the overlay open would leave
     .overlay-open and its document dismiss listeners alive under the
     native column — close the overlay form first, then re-derive */
  _gutterNativeMq.addEventListener('change', () => {
    if (_gutterNativeMq.matches) closeGutterOverlay();
    syncGutterLayout();
  });
  syncGutterLayout();
})();

/* ── Annotations ──────────────────────────────────────── */

/* Separate highlight application from bubble rendering */

/**
 * Text-node index over a container: every text node with its offset into
 * the concatenated string. Built once per applyAnnotationHighlights and
 * shared by every annotation (the walk used to run once per annotation —
 * O(annotations × nodes) on every content change). The normalized form
 * is derived lazily and memoized on the index for the fuzzy fallback.
 */
function buildTextIndex(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let fullText = '';
  let n;
  while (n = walker.nextNode()) {
    nodes.push({ node: n, start: fullText.length, end: fullText.length + n.textContent.length });
    fullText += n.textContent;
  }
  return { nodes, fullText, norm: null, indexMap: null };
}

/* Binary search: the entry whose [start, end) covers pos. With
   inclusiveEnd a pos on a node boundary is ambiguous (it is one node's
   end and the next node's start), so callers decide single-node matches
   from the START entry's extent and only bisect the end for spans. */
function _indexEntryAt(index, pos, inclusiveEnd) {
  const nodes = index.nodes;
  let lo = 0, hi = nodes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const e = nodes[mid];
    if (pos < e.start) hi = mid - 1;
    else if (inclusiveEnd ? pos > e.end : pos >= e.end) lo = mid + 1;
    else return e;
  }
  return null;
}

/*
 * Normalized fallback: expand §↔Section, collapse whitespace,
 * lowercase — then map the match position back to the original
 * string using an index map built during normalization.
 *
 * indexMap[i] = the position in the original string that produced
 * normalized character i. This lets us map any normalized offset
 * back to its exact original position.
 */
function _buildNormalized(s) {
  let norm = '';
  const indexMap = []; /* indexMap[normIdx] → origIdx */
  const expansions = { '\u00a7': 'section' };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (expansions[ch]) {
      const exp = expansions[ch];
      for (let j = 0; j < exp.length; j++) {
        indexMap.push(i);
        norm += exp[j];
      }
    } else if (/\s/.test(ch)) {
      /* Collapse runs of whitespace to single space */
      if (norm.length === 0 || norm[norm.length - 1] !== ' ') {
        indexMap.push(i);
        norm += ' ';
      }
    } else {
      indexMap.push(i);
      norm += ch.toLowerCase();
    }
  }
  return { norm, indexMap };
}

/**
 * Find anchor text in the content element, even when it spans
 * multiple DOM nodes (e.g. across <strong>, <em>, line breaks).
 * Returns a Range or null. `index` is an optional prebuilt
 * buildTextIndex() result; callers resolving many anchors pass one.
 */
function findTextRange(container, searchText, index) {
  if (!searchText) return null;
  index = index || buildTextIndex(container);
  const { nodes, fullText } = index;
  if (!nodes.length) return null;

  const makeRange = (startEntry, startOff, endEntry, endOff) => {
    const range = document.createRange();
    range.setStart(startEntry.node, startOff);
    range.setEnd(endEntry.node, endOff);
    return range;
  };

  /* Exact match. A match wholly inside one text node is preferred over
     an earlier one that straddles nodes (the old single-node fast path);
     the scan is capped so a pathological anchor can't spin. */
  let spanning = null;
  let from = 0;
  for (let tries = 0; tries < 64; tries++) {
    const matchIdx = fullText.indexOf(searchText, from);
    if (matchIdx < 0) break;
    const matchEnd = matchIdx + searchText.length;
    const startEntry = _indexEntryAt(index, matchIdx, false);
    if (startEntry) {
      if (matchEnd <= startEntry.end) {
        /* Wholly inside one text node (incl. a match that fills the
           node exactly — the boundary must not be read as spanning) */
        return makeRange(startEntry, matchIdx - startEntry.start,
                         startEntry, matchEnd - startEntry.start);
      }
      if (!spanning) {
        const endEntry = _indexEntryAt(index, matchEnd, true);
        if (endEntry) {
          spanning = makeRange(startEntry, matchIdx - startEntry.start,
                               endEntry, matchEnd - endEntry.start);
        }
      }
    }
    from = matchIdx + 1;
  }
  if (spanning) return spanning;

  /* Normalized fallback (memoized on the index) */
  if (index.norm === null) {
    const built = _buildNormalized(fullText);
    index.norm = built.norm;
    index.indexMap = built.indexMap;
  }
  const { norm: normSearch } = _buildNormalized(searchText);
  const normIdx = index.norm.indexOf(normSearch);
  if (normIdx < 0) return null;

  /* Map back to original fullText position, anchor to the end of that node */
  const origIdx = index.indexMap[normIdx] || 0;
  const entry = _indexEntryAt(index, origIdx, false);
  if (!entry) return null;
  const localIdx = Math.max(0, origIdx - entry.start);
  const len = entry.node.textContent.length;
  return makeRange(entry, Math.min(localIdx, len), entry, len);
}

function applyAnnotationHighlights() {
  /* Remove existing highlights */
  document.querySelectorAll('mark.annotation-highlight').forEach(m => {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });

  const content = document.getElementById('content');
  const anns = (annotationsCache[activeTabId] || [])
    .filter(ann => ann.anchor && ann.anchor.text && !ann.resolved);
  if (!content || !anns.length) return;

  /* Resolve every anchor against one index BEFORE wrapping anything:
     surroundContents splits text nodes, which would invalidate the
     index — but Ranges are live and track those splits, so ranges
     computed up front stay correct through the wrapping pass */
  const index = buildTextIndex(content);
  const resolved = [];
  anns.forEach(ann => {
    const range = findTextRange(content, ann.anchor.text, index);
    if (range) resolved.push({ ann, range });
  });

  /* Wrap from the END of the document backwards. surroundContents
     deletes the wrapped text from its node (replaceData), and the live-
     range rule collapses any other boundary inside (start, end] to
     start — a nested or exactly-adjacent LATER range would lose its
     highlight. Going last-to-first, each wrap only touches text after
     every range still waiting. */
  resolved.sort((a, b) => b.range.compareBoundaryPoints(Range.START_TO_START, a.range));
  let freshIndex = null;   /* rebuilt lazily after a wrap, only if needed */
  resolved.forEach(({ ann, range }) => {
    /* Two annotations on the SAME text (duplicate anchors, or a nested
       one sharing the start) can't be ordered apart: the first wrap
       collapses the other. Re-resolve it against the mutated DOM — it
       lands inside the new mark as a nested highlight, as before. */
    if (range.collapsed) {
      freshIndex = freshIndex || buildTextIndex(content);
      range = findTextRange(content, ann.anchor.text, freshIndex);
      if (!range || range.collapsed) return;
    }
    freshIndex = null;
    try {
      const mark = document.createElement('mark');
      mark.className = 'annotation-highlight';
      mark.dataset.annotationId = ann.id;
      mark.dataset.type = ann.type || 'comment';
      /* If range spans one node, surroundContents works */
      if (range.startContainer === range.endContainer) {
        range.surroundContents(mark);
      } else {
        /* Multi-node: wrap just the start node's portion so we have
           something clickable/scrollable anchored in the right place */
        const startLen = range.startContainer.textContent.length;
        const partialRange = document.createRange();
        partialRange.setStart(range.startContainer, range.startOffset);
        partialRange.setEnd(range.startContainer, startLen);
        partialRange.surroundContents(mark);
      }
    } catch(e) { /* skip if DOM structure prevents wrapping */ }
  });

  /* Click highlights → scroll to bubble */
  document.querySelectorAll('mark.annotation-highlight').forEach(mark => {
    mark.onclick = () => {
      const id = mark.dataset.annotationId;
      const bubble = document.querySelector('.ann-bubble[data-annotation-id="' + id + '"]');
      if (bubble) {
        bubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
        bubble.classList.add('focused');
        setTimeout(() => bubble.classList.remove('focused'), 1500);
      }
    };
  });
}

function renderAnnotations() {
  const list = document.getElementById('annotations-list');
  if (!list) return;

  const anns = annotationsCache[activeTabId] || [];

  /* Build a cache key to avoid redundant re-renders */
  const cacheKey = activeTabId + ':' + JSON.stringify(anns.map(a => a.id + a.resolved));
  if (cacheKey === lastRenderedAnnotationsKey) return;
  lastRenderedAnnotationsKey = cacheKey;

  list.innerHTML = '';

  updateAnnotationsBadge(anns.length);

  if (anns.length === 0) {
    list.innerHTML = '<div class="ann-hint">Select text to annotate</div>';
    applyAnnotationHighlights();
    return;
  }

  anns.forEach(ann => {
    const found = !!document.querySelector('mark[data-annotation-id="' + ann.id + '"]');

    /* Create bubble card */
    const bubble = document.createElement('div');
    const annType = ann.type || 'comment';
    bubble.className = 'ann-bubble'
      + (ann.resolved ? ' resolved' : '')
      + (!found && !ann.resolved && ann.anchor && ann.anchor.text ? ' orphaned' : '');
    bubble.dataset.annotationId = ann.id;
    bubble.dataset.type = annType;

    const authorType = (ann.author && ann.author.type === 'ai') ? 'ai' : 'human';
    const authorIcon = authorType === 'ai'
      ? '<i class="ph ph-robot" style="font-size:10px"></i> ' : '';
    const typeIcons = {
      comment: 'ph-chat-dots', question: 'ph-question',
      suggestion: 'ph-lightbulb', important: 'ph-flag',
      bookmark: 'ph-bookmark-simple'
    };
    const typeIcon = '<i class="ph ' + (typeIcons[annType] || 'ph-chat-dots') + ' ann-type-icon ' + annType + '"></i>';
    const timeStr = ann.created
      ? new Date(ann.created).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        })
      : '';

    const bodyText = ann.resolved
      ? '<s>' + escapeHtml(ann.body) + '</s>'
      : escapeHtml(ann.body);
    const anchorSnippet = (ann.anchor && ann.anchor.text)
      ? '<div class="ann-anchor-text">&ldquo;'
        + escapeHtml(ann.anchor.text.substring(0, 60))
        + (ann.anchor.text.length > 60 ? '&hellip;' : '')
        + '&rdquo;</div>'
      : '';

    /* Build replies HTML */
    let repliesHtml = '';
    if (ann.replies && ann.replies.length > 0) {
      repliesHtml = '<div class="ann-replies">';
      ann.replies.forEach(r => {
        const rType = (r.author && r.author.type === 'ai') ? 'ai' : 'human';
        const rIcon = rType === 'ai' ? '<i class="ph ph-robot" style="font-size:9px"></i> ' : '';
        const rTime = r.created
          ? new Date(r.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : '';
        repliesHtml += '<div class="ann-reply">'
          + '<span class="ann-reply-author ' + rType + '">' + rIcon + escapeHtml(r.author ? r.author.name : 'Unknown') + '</span>'
          + '<span class="ann-reply-time">' + rTime + '</span>'
          + '<div class="ann-reply-body">' + escapeHtml(r.body) + '</div>'
          + '</div>';
      });
      repliesHtml += '</div>';
    }

    bubble.innerHTML =
      '<div class="ann-author ' + authorType + '">'
        + typeIcon + authorIcon + escapeHtml(ann.author ? ann.author.name : 'Unknown')
        + '<span class="ann-time">' + timeStr + '</span>'
        + '<span class="ann-actions">'
          + '<button class="ann-resolve-btn" data-ann-id="' + ann.id + '" title="'
          + (ann.resolved ? 'Unresolve' : 'Resolve') + '">'
          + '<i class="ph ' + (ann.resolved ? 'ph-arrow-counter-clockwise' : 'ph-check') + '"></i>'
          + '</button>'
          + '<button class="ann-delete-btn" data-ann-id="' + ann.id + '" title="Delete">'
          + '<i class="ph ph-trash"></i>'
          + '</button>'
        + '</span>'
      + '</div>'
      + '<div class="ann-body">' + bodyText + '</div>'
      + repliesHtml
      + '<button class="ann-reply-toggle" data-ann-id="' + ann.id + '"><i class="ph ph-arrow-bend-up-left"></i> Reply</button>'
      + anchorSnippet;

    /* Click bubble → scroll to highlight */
    bubble.onclick = (e) => {
      if (e.target.closest('.ann-resolve-btn, .ann-delete-btn, .ann-reply-toggle, .ann-reply-form, .ann-replies')) return;
      const mark = document.querySelector('mark[data-annotation-id="' + ann.id + '"]');
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mark.classList.add('pulse');
        setTimeout(() => mark.classList.remove('pulse'), 600);
      }
    };

    list.appendChild(bubble);
  });

  /* Resolve button handlers */
  list.querySelectorAll('.ann-resolve-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      resolveAnnotation(btn.dataset.annId);
    };
  });

  /* Delete button handlers */
  list.querySelectorAll('.ann-delete-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      deleteAnnotation(btn.dataset.annId);
    };
  });

  /* Reply toggle handlers */
  list.querySelectorAll('.ann-reply-toggle').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const annId = btn.dataset.annId;
      /* Remove any existing reply forms */
      list.querySelectorAll('.ann-reply-form').forEach(f => f.remove());
      /* Insert reply form after the toggle button */
      const form = document.createElement('div');
      form.className = 'ann-reply-form';
      form.innerHTML = '<input class="ann-reply-input" placeholder="Reply..." data-ann-id="' + annId + '">'
        + '<button class="ann-reply-send" data-ann-id="' + annId + '"><i class="ph ph-arrow-right"></i></button>';
      btn.parentNode.insertBefore(form, btn.nextSibling);
      const input = form.querySelector('.ann-reply-input');
      input.focus();
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          submitReply(annId, input.value.trim());
        } else if (ev.key === 'Escape') {
          form.remove();
        }
      });
      form.querySelector('.ann-reply-send').onclick = (ev) => {
        ev.stopPropagation();
        submitReply(annId, input.value.trim());
      };
    };
  });

  /* Stagger-animate annotation bubbles */
  if (window.Motion && !_prefersReducedMotion) {
    const bubbles = list.querySelectorAll('.ann-bubble');
    if (bubbles.length) {
      Motion.animate(bubbles,
        { opacity: [0, 1], x: [8, 0] },
        { delay: Motion.stagger(0.03), duration: 0.2 }
      );
    }
  }

  /* Apply highlights after bubbles are rendered */
  applyAnnotationHighlights();
}

async function resolveAnnotation(annId) {
  try {
    await fetch('/api/resolve', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({tab: activeTabId, id: annId})
    });
    lastAnnotationMtimes[activeTabId] = -1;
    lastRenderedAnnotationsKey = '';
  } catch(e) {}
}

async function deleteAnnotation(annId) {
  try {
    await fetch('/api/delete-annotation', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({tab: activeTabId, id: annId})
    });
    lastAnnotationMtimes[activeTabId] = -1;
    lastRenderedAnnotationsKey = '';
  } catch(e) {}
}

async function submitReply(annId, body) {
  if (!body) return;
  const author = document.getElementById('ann-author-input').value.trim() || defaultAuthor;
  const authorType = ['claude', 'ai', 'assistant'].includes(author.toLowerCase()) ? 'ai' : 'human';
  try {
    await fetch('/api/reply', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        tab: activeTabId,
        id: annId,
        author: { name: author, type: authorType },
        body: body
      })
    });
    lastAnnotationMtimes[activeTabId] = -1;
    lastRenderedAnnotationsKey = '';
  } catch(e) {}
}

/* ── Text Selection → Annotate Carousel ──────────────── */
document.addEventListener('mouseup', (e) => {
  const carousel = document.getElementById('annotate-carousel');

  /* If click was inside the carousel itself, don't dismiss */
  if (carousel.contains(e.target)) return;

  const sel = window.getSelection();

  if (!sel || sel.isCollapsed || !sel.toString().trim()) {
    if (window.Motion && !_prefersReducedMotion && carousel.classList.contains('visible')) {
      Motion.animate(carousel, { opacity: 0, scale: 0.95 }, { duration: 0.1, easing: 'ease-out' })
        .finished.then(() => carousel.classList.remove('visible')).catch(() => {});
    } else {
      setTimeout(() => { carousel.classList.remove('visible'); }, 200);
    }
    return;
  }

  const content = document.getElementById('content');
  if (!content.contains(sel.anchorNode)) {
    carousel.classList.remove('visible');
    return;
  }

  const text = sel.toString().trim();
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  /* Find nearest heading above selection */
  let heading = '';
  let el = sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : sel.anchorNode;
  while (el && el !== content) {
    let prev = el.previousElementSibling;
    while (prev) {
      if (/^H[1-4]$/i.test(prev.tagName)) {
        heading = prev.id || '';
        break;
      }
      prev = prev.previousElementSibling;
    }
    if (heading) break;
    el = el.parentElement;
  }

  annotateSelection = { text: text, heading: heading };

  /* Position carousel centered above selection */
  const carouselWidth = 170; /* approx width of 5 buttons */
  carousel.style.left = (rect.left + rect.width / 2 - carouselWidth / 2 + window.scrollX) + 'px';
  carousel.style.top = (rect.top + window.scrollY - 44) + 'px';
  carousel.classList.add('visible');

  /* Spring entrance for carousel */
  if (window.Motion && !_prefersReducedMotion) {
    Motion.animate(carousel,
      { scale: [0.8, 1], opacity: [0, 1] },
      { easing: Motion.spring({ stiffness: 400, damping: 25 }) }
    );
  }
});

/* Carousel button click → set type and open form */
document.querySelectorAll('.carousel-btn').forEach(btn => {
  btn.onclick = (e) => {
    e.stopPropagation();
    if (!annotateSelection) return;
    selectedAnnotationType = btn.dataset.type;

    /* Overlay on narrow screens, un-hide the native column on wide ones —
       the form lives in the gutter either way */
    revealGutter();

    showAnnotationForm();
    document.getElementById('annotate-carousel').classList.remove('visible');
  };
});

let selectedAnnotationType = 'comment';

function showAnnotationForm() {
  const form = document.getElementById('annotation-form');
  form.style.display = 'block';
  document.getElementById('ann-author-input').value = defaultAuthor;
  document.getElementById('ann-body-input').value = '';
  /* Pre-select the type chosen from the carousel (or default to comment) */
  form.querySelectorAll('.ann-type-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.type === selectedAnnotationType);
  });
  document.getElementById('ann-body-input').focus();
}

/* Type picker click handlers */
document.querySelectorAll('.ann-type-btn').forEach(btn => {
  btn.onclick = () => {
    selectedAnnotationType = btn.dataset.type;
    document.querySelectorAll('.ann-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  };
});

document.getElementById('ann-submit-btn').onclick = async () => {
  const author = document.getElementById('ann-author-input').value.trim();
  const body = document.getElementById('ann-body-input').value.trim();

  if (!body || !annotateSelection) return;

  const authorType = ['claude', 'ai', 'assistant'].includes(author.toLowerCase()) ? 'ai' : 'human';

  try {
    await fetch('/api/annotate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        tab: activeTabId,
        anchor: { text: annotateSelection.text, heading: annotateSelection.heading, offset: 0 },
        author: { name: author, type: authorType },
        body: body,
        type: selectedAnnotationType
      })
    });
  } catch(e) {
    console.error('Failed to annotate:', e);
  }

  document.getElementById('annotation-form').style.display = 'none';
  annotateSelection = null;
  window.getSelection().removeAllRanges();
  lastAnnotationMtimes[activeTabId] = -1;
  lastRenderedAnnotationsKey = '';
};

document.getElementById('ann-cancel-btn').onclick = () => {
  document.getElementById('annotation-form').style.display = 'none';
  annotateSelection = null;
};

/* Keyboard shortcuts in annotation form */
document.getElementById('ann-body-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    document.getElementById('ann-submit-btn').click();
  } else if (e.key === 'Escape') {
    document.getElementById('ann-cancel-btn').click();
  }
});
