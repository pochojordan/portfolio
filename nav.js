// nav.js — Shared navigation component
// Detects current page and renders appropriate nav

(function () {
  const isHome = location.pathname === '/' || location.pathname.endsWith('index.html') && !location.pathname.includes('/factory');

  const i18n = {
    es: { nav_projects: 'Proyectos', nav_back: '← Portfolio' },
    en: { nav_projects: 'Projects', nav_back: '← Portfolio' }
  };

  function getLang() {
    try { return localStorage.getItem('lang') || 'es'; } catch { return 'es'; }
  }

  function render() {
    const existing = document.querySelector('nav');
    if (existing) existing.remove();

    const lang = getLang();
    const nav = document.createElement('nav');
    nav.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10;padding:1.2rem 2.5rem;display:flex;justify-content:space-between;align-items:center;backdrop-filter:blur(18px);background:rgba(6,8,15,.7);border-bottom:1px solid rgba(30,39,64,.35)';

    if (isHome) {
      nav.innerHTML = `
        <div class="nl">jjordan<span>.</span></div>
        <div class="nk">
          <a href="#projects" data-i18n="nav_projects">${i18n[lang].nav_projects}</a>
          <a href="https://github.com/jjordan" target="_blank">GitHub</a>
          <div class="lang-toggle" id="langToggle">
            <button class="lang-btn${lang === 'es' ? ' active' : ''}" data-lang="es">ES</button>
            <button class="lang-btn${lang === 'en' ? ' active' : ''}" data-lang="en">EN</button>
          </div>
        </div>`;
    } else {
      nav.innerHTML = `
        <div class="nl">jjordan<span>.</span></div>
        <div class="nk">
          <a href="../index.html" style="color:#8892a8;text-decoration:none;font-size:.85rem;font-weight:500;transition:color .3s" onmouseover="this.style.color='#e2e8f0'" onmouseout="this.style.color='#8892a8'">${i18n[lang].nav_back}</a>
          <a href="https://github.com/jjordan" target="_blank" style="color:#8892a8;text-decoration:none;font-size:.85rem;font-weight:500;transition:color .3s" onmouseover="this.style.color='#e2e8f0'" onmouseout="this.style.color='#8892a8'">GitHub</a>
        </div>`;
    }

    document.body.prepend(nav);
  }

  render();

  // Expose for i18n lang toggle on home page
  window.__navRender = render;
  window.__navI18n = i18n;
})();
