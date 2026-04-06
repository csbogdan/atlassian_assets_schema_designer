const menuButton = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');

if (menuButton && menu) {
  menuButton.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

const sections = [...document.querySelectorAll('[data-section]')];
const links = [...document.querySelectorAll('[data-nav-link]')];

if (sections.length && links.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;
      const id = visible.target.getAttribute('id');
      links.forEach((link) => {
        const active = link.getAttribute('href') === `#${id}`;
        link.classList.toggle('active', active);
      });
    },
    { rootMargin: '-25% 0px -55% 0px', threshold: [0.1, 0.4, 0.7] },
  );

  sections.forEach((section) => observer.observe(section));
}

if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 },
  );

  document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));
}

const yearEl = document.querySelector('[data-year]');
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}

const initMermaid = () => {
  if (!window.mermaid || initMermaid.done) return;
  initMermaid.done = true;
  window.mermaid.initialize({
    startOnLoad: true,
    theme: 'base',
    themeVariables: {
      fontFamily: '"Public Sans", sans-serif',
      primaryColor: '#fff7ef',
      primaryTextColor: '#11233b',
      primaryBorderColor: '#d95d39',
      lineColor: '#0b5d7a',
      secondaryColor: '#eff5f7',
      tertiaryColor: '#f8efe4',
      clusterBkg: '#fffaf1',
      clusterBorder: '#11233b'
    }
  });
};

initMermaid.done = false;
initMermaid();
window.addEventListener('load', initMermaid);

const zoomableImages = [
  ...document.querySelectorAll('.shot-card img'),
  ...document.querySelectorAll('img[data-zoomable]')
].filter((img, index, arr) => arr.indexOf(img) === index);

if (zoomableImages.length) {
  const overlay = document.createElement('div');
  overlay.className = 'zoom-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Image zoom view');
  overlay.innerHTML = `
    <div class="zoom-dialog">
      <div class="zoom-toolbar">
        <div>
          <strong data-zoom-title>Image preview</strong>
          <span data-zoom-caption>Click outside the dialog or press Escape to close.</span>
        </div>
        <button class="zoom-close" type="button" aria-label="Close image preview">✕</button>
      </div>
      <div class="zoom-body">
        <img src="" alt="">
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const zoomImage = overlay.querySelector('.zoom-body img');
  const zoomTitle = overlay.querySelector('[data-zoom-title]');
  const zoomCaption = overlay.querySelector('[data-zoom-caption]');
  const closeButton = overlay.querySelector('.zoom-close');

  const closeZoom = () => {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    zoomImage.setAttribute('src', '');
    zoomImage.setAttribute('alt', '');
  };

  const openZoom = (img) => {
    const title = img.closest('.shot-card')?.querySelector('.shot-copy strong')?.textContent?.trim()
      || img.getAttribute('alt')
      || 'Image preview';
    const caption = img.closest('.shot-card')?.querySelector('.shot-copy span')?.textContent?.trim()
      || 'Click outside the dialog or press Escape to close.';

    zoomImage.setAttribute('src', img.currentSrc || img.src);
    zoomImage.setAttribute('alt', img.getAttribute('alt') || title);
    zoomTitle.textContent = title;
    zoomCaption.textContent = caption;
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };

  zoomableImages.forEach((img) => {
    img.addEventListener('click', () => openZoom(img));
  });

  closeButton.addEventListener('click', closeZoom);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeZoom();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
      closeZoom();
    }
  });
}
