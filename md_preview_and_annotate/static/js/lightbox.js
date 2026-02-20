/* ── Image Lightbox ──────────────────────────────────── */
let _lightboxImages = [];
let _lightboxIndex = 0;

function openLightbox(src, alt, index) {
  const overlay = document.getElementById('lightbox-overlay');
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  const counter = document.getElementById('lightbox-counter');
  if (!overlay || !img || !caption || !counter) return;

  _lightboxIndex = index || 0;
  img.src = src;
  img.alt = alt || '';
  caption.textContent = alt || '';
  caption.style.display = alt ? '' : 'none';

  if (_lightboxImages.length > 1) {
    counter.textContent = (_lightboxIndex + 1) + ' / ' + _lightboxImages.length;
    if (counter.parentElement) counter.parentElement.style.display = '';
  } else {
    if (counter.parentElement) counter.parentElement.style.display = 'none';
  }

  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  /* Animate in with Motion One if available */
  if (window.Motion && !_prefersReducedMotion) {
    Motion.animate(overlay, { opacity: [0, 1] }, { duration: 0.25 });
    Motion.animate(img, { scale: [0.92, 1], opacity: [0, 1] }, { duration: 0.3, easing: [0.22, 1, 0.36, 1] });
  }
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;

  const finish = () => {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  if (window.Motion && !_prefersReducedMotion) {
    Motion.animate(overlay, { opacity: 0 }, { duration: 0.2 }).finished.then(finish);
  } else {
    finish();
  }
}

function lightboxNav(delta) {
  if (_lightboxImages.length < 2) return;
  _lightboxIndex = (_lightboxIndex + delta + _lightboxImages.length) % _lightboxImages.length;
  const entry = _lightboxImages[_lightboxIndex];
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');
  const counter = document.getElementById('lightbox-counter');
  if (img) {
    img.src = entry.src;
    img.alt = entry.alt;
  }
  if (caption) {
    caption.textContent = entry.alt || '';
    caption.style.display = entry.alt ? '' : 'none';
  }
  if (counter) {
    counter.textContent = (_lightboxIndex + 1) + ' / ' + _lightboxImages.length;
  }
}

function attachLightboxToContent() {
  const content = document.getElementById('content');
  if (!content) return;
  /* Close any open lightbox before rebuilding image list (avoids stale index) */
  const overlay = document.getElementById('lightbox-overlay');
  if (overlay && overlay.classList.contains('active')) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  _lightboxImages = [];
  content.querySelectorAll('img:not(.emoji):not(.tpl-var-img)').forEach((img, i) => {
    img.style.cursor = 'zoom-in';
    img.dataset.lightboxIndex = i;
    _lightboxImages.push({ src: img.src, alt: img.alt });
    img.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(img.src, img.alt, i);
    });
  });
}

/* Event listeners */
document.addEventListener('keydown', (e) => {
  const overlay = document.getElementById('lightbox-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (e.key === 'Escape') { closeLightbox(); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { lightboxNav(-1); e.preventDefault(); }
  if (e.key === 'ArrowRight') { lightboxNav(1); e.preventDefault(); }
});

document.addEventListener('click', (e) => {
  if (e.target.closest('.lightbox-close')) { closeLightbox(); return; }
  if (e.target.closest('.lightbox-prev')) { lightboxNav(-1); return; }
  if (e.target.closest('.lightbox-next')) { lightboxNav(1); return; }
  /* Click on backdrop (not stage content) closes */
  const overlay = document.getElementById('lightbox-overlay');
  if (overlay && overlay.classList.contains('active') && e.target === overlay) {
    closeLightbox();
  }
});
