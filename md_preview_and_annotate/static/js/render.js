/* ── TOC ──────────────────────────────────────────────── */
function buildToc(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const headings = tmp.querySelectorAll('h1, h2, h3, h4');
  const toc = document.getElementById('toc-list');
  toc.innerHTML = '';
  headings.forEach((h, i) => {
    const level = h.tagName.toLowerCase();
    const text = h.textContent;
    const id = slugify(text) + '-' + i;
    const li = document.createElement('li');
    li.style.animationDelay = (i * 0.02) + 's';
    const a = document.createElement('a');
    a.href = '#' + id;
    a.textContent = text;
    a.className = 'toc-' + level;
    a.dataset.target = id;
    li.appendChild(a);
    toc.appendChild(li);
  });
}

/* Scroll spy — throttled with rAF */
let scrollSpyPending = false;
function updateActiveHeading() {
  if (scrollSpyPending) return;
  scrollSpyPending = true;
  requestAnimationFrame(() => {
    scrollSpyPending = false;
    const headings = document.querySelectorAll('#content h1, #content h2, #content h3, #content h4');
    const links = document.querySelectorAll('#toc a');
    let current = '';

    headings.forEach(h => {
      const rect = h.getBoundingClientRect();
      if (rect.top <= 80) current = h.id;
    });

    links.forEach(a => {
      a.classList.toggle('active', a.dataset.target === current);
    });

    const activeLink = document.querySelector('#toc a.active');
    if (activeLink) {
      const sc = document.getElementById('toc-scroll');
      const lr = activeLink.getBoundingClientRect();
      const sr = sc.getBoundingClientRect();
      if (lr.top < sr.top + 20 || lr.bottom > sr.bottom - 40) {
        activeLink.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  });
}
window.addEventListener('scroll', updateActiveHeading, { passive: true });

/* ── Render ───────────────────────────────────────────── */
function render(md) {
  /* Skip if content hasn't changed */
  if (md === lastRenderedMd) return;
  lastRenderedMd = md;

  const html = marked.parse(md, { gfm: true, breaks: false });
  buildToc(html);

  const content = document.getElementById('content');
  content.innerHTML = html;
  applyEmojiStyle(content);

  /* Assign IDs to headings */
  content.querySelectorAll('h1, h2, h3, h4').forEach((h, i) => {
    h.id = slugify(h.textContent) + '-' + i;
  });

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

  updateActiveHeading();
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
}

/* ── Word Count ───────────────────────────────────────── */
function updateWordCount(md) {
  const text = md.replace(/[#*_`~\[\]()>|\\-]/g, ' ').trim();
  const words = text.split(/\s+/).filter(w => w.length > 0).length;
  const mins = Math.max(1, Math.ceil(words / 250));
  const el = document.getElementById('word-count');
  if (el) el.textContent = words.toLocaleString() + ' words \u00b7 ' + mins + ' min read';
}
