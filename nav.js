// nav.js — Shared navigation component
// Detects current page and renders appropriate nav

(function () {
  const path = location.pathname.replace(/\/+$/, '');
  const isHome = path === '' || path.endsWith('/portfolio') || path.endsWith('/portfolio/index.html') || path === '/index.html';

  const i18n = {
    es: { nav_projects: 'Proyectos', nav_about: 'Sobre mí', nav_contact: 'Contacto', nav_back: '← Portfolio' },
    en: { nav_projects: 'Projects', nav_about: 'About', nav_contact: 'Contact', nav_back: '← Portfolio' }
  };

  function getLang() {
    try { return localStorage.getItem('lang') || 'es'; } catch { return 'es'; }
  }

  function render() {
    const existing = document.querySelector('nav');
    if (existing) existing.remove();

    const lang = getLang();
    const nav = document.createElement('nav');
    nav.className = isHome ? 'nav-home' : 'nav-page';

    if (isHome) {
      nav.innerHTML = `
        <div class="nl">jjordan<span>.</span></div>
        <div class="nk">
          <a class="nav-link" href="#projects">${i18n[lang].nav_projects}</a>
          <a class="nav-link" href="#about">${i18n[lang].nav_about}</a>
          <a class="nav-link" href="#contact">${i18n[lang].nav_contact}</a>
          <a class="nav-link" href="https://github.com/pochojordan" target="_blank" rel="noopener">GitHub</a>
          <div class="lang-toggle" id="langToggle">
            <button class="lang-btn${lang === 'es' ? ' active' : ''}" data-lang="es">ES</button>
            <button class="lang-btn${lang === 'en' ? ' active' : ''}" data-lang="en">EN</button>
          </div>
        </div>`;
    } else {
      nav.innerHTML = `
        <div class="nl">jjordan<span>.</span></div>
        <div class="nk">
          <a class="nav-link" href="../index.html">${i18n[lang].nav_back}</a>
          <a class="nav-link" href="https://github.com/pochojordan" target="_blank" rel="noopener">GitHub</a>
        </div>`;
    }

    document.body.prepend(nav);
  }

  render();

  window.__navRender = render;
  window.__navI18n = i18n;
})();
