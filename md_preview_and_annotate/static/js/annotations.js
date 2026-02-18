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

  /* On wide screens where gutter is natively visible, hide toggle */
  const gutter = document.getElementById('annotations-gutter');
  const isNativelyVisible = gutter && window.innerWidth > 1400;
  if (isNativelyVisible) {
    toggle.classList.add('gutter-native');
  } else {
    toggle.classList.remove('gutter-native');
  }
}

let _gutterDismissCtrl = null;

function openGutterOverlay() {
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

document.getElementById('annotations-toggle').onclick = () => {
  const gutter = document.getElementById('annotations-gutter');
  if (gutter.classList.contains('overlay-open')) {
    closeGutterOverlay();
  } else {
    openGutterOverlay();
  }
};

document.getElementById('ann-gutter-close').onclick = () => {
  closeGutterOverlay();
};

/* ── Annotations ──────────────────────────────────────── */

/* Separate highlight application from bubble rendering */

/**
 * Find anchor text in the content element, even when it spans
 * multiple DOM nodes (e.g. across <strong>, <em>, line breaks).
 * Returns a Range or null.
 */
function findTextRange(container, searchText) {
  if (!searchText) return null;

  /* First pass: try single-node match (fast path) */
  const walker1 = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node1;
  while (node1 = walker1.nextNode()) {
    const idx = node1.textContent.indexOf(searchText);
    if (idx >= 0) {
      const range = document.createRange();
      range.setStart(node1, idx);
      range.setEnd(node1, idx + searchText.length);
      return range;
    }
  }

  /* Second pass: concatenate text nodes and find across boundaries */
  const walker2 = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let fullText = '';
  let n;
  while (n = walker2.nextNode()) {
    nodes.push({ node: n, start: fullText.length });
    fullText += n.textContent;
  }

  const matchIdx = fullText.indexOf(searchText);
  if (matchIdx < 0) {
    /*
     * Normalized fallback: expand §↔Section, collapse whitespace,
     * lowercase — then map the match position back to the original
     * string using an index map built during normalization.
     *
     * indexMap[i] = the position in the original string that produced
     * normalized character i. This lets us map any normalized offset
     * back to its exact original position.
     */
    function buildNormalized(s) {
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

    const { norm: normSearch } = buildNormalized(searchText);
    const { norm: normFull, indexMap } = buildNormalized(fullText);
    const normIdx = normFull.indexOf(normSearch);
    if (normIdx < 0) return null;

    /* Map back to original fullText position */
    const origIdx = indexMap[normIdx] || 0;

    /* Find the text node at origIdx */
    for (let i = 0; i < nodes.length; i++) {
      const entry = nodes[i];
      const nodeEnd = entry.start + entry.node.textContent.length;
      if (nodeEnd > origIdx) {
        const localIdx = Math.max(0, origIdx - entry.start);
        const range = document.createRange();
        range.setStart(entry.node, Math.min(localIdx, entry.node.textContent.length));
        range.setEnd(entry.node, entry.node.textContent.length);
        return range;
      }
    }
    return null;
  }

  /* Find start node/offset */
  let startNode = null, startOffset = 0;
  let endNode = null, endOffset = 0;
  const matchEnd = matchIdx + searchText.length;

  for (let i = 0; i < nodes.length; i++) {
    const entry = nodes[i];
    const nodeEnd = entry.start + entry.node.textContent.length;

    if (!startNode && nodeEnd > matchIdx) {
      startNode = entry.node;
      startOffset = matchIdx - entry.start;
    }
    if (nodeEnd >= matchEnd) {
      endNode = entry.node;
      endOffset = matchEnd - entry.start;
      break;
    }
  }

  if (!startNode || !endNode) return null;

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function applyAnnotationHighlights() {
  /* Remove existing highlights */
  document.querySelectorAll('mark.annotation-highlight').forEach(m => {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });

  const anns = annotationsCache[activeTabId] || [];
  anns.forEach(ann => {
    if (!ann.anchor || !ann.anchor.text || ann.resolved) return;
    const content = document.getElementById('content');
    const range = findTextRange(content, ann.anchor.text);
    if (!range) return;

    try {
      /* If range spans one node, surroundContents works */
      if (range.startContainer === range.endContainer) {
        const mark = document.createElement('mark');
        mark.className = 'annotation-highlight';
        mark.dataset.annotationId = ann.id;
        mark.dataset.type = ann.type || 'comment';
        range.surroundContents(mark);
      } else {
        /* Multi-node: wrap just the start node's portion so we have
           something clickable/scrollable anchored in the right place */
        const startLen = range.startContainer.textContent.length;
        const partialRange = document.createRange();
        partialRange.setStart(range.startContainer, range.startOffset);
        partialRange.setEnd(range.startContainer, startLen);
        const mark = document.createElement('mark');
        mark.className = 'annotation-highlight';
        mark.dataset.annotationId = ann.id;
        mark.dataset.type = ann.type || 'comment';
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
    setTimeout(() => { carousel.classList.remove('visible'); }, 200);
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
});

/* Carousel button click → set type and open form */
document.querySelectorAll('.carousel-btn').forEach(btn => {
  btn.onclick = (e) => {
    e.stopPropagation();
    if (!annotateSelection) return;
    selectedAnnotationType = btn.dataset.type;

    /* On narrow screens, force-open gutter so the form is visible */
    if (window.innerWidth <= 1400) {
      openGutterOverlay();
    }

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
