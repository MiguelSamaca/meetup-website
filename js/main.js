// MeetUp — main.js

/* ──────────────────────────────────────────
   NAVBAR: scroll effect + hamburger menu
   ────────────────────────────────────────── */
(function initNavbar() {
  const navbar     = document.getElementById('navbar');
  const hamburger  = document.getElementById('hamburger');
  const navMenu    = document.getElementById('navMenu');
  const navLinks   = document.querySelectorAll('.navbar__link');

  if (!navbar || !hamburger || !navMenu) return;

  // Scroll: agregar clase "scrolled" al bajar 20px
  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // Hamburguesa: abrir / cerrar menú mobile
  hamburger.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Cerrar menú al hacer click en un link
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // Cerrar menú con Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && navMenu.classList.contains('open')) {
      navMenu.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      hamburger.focus();
    }
  });

  // Active link al hacer scroll por las secciones
  const sections = document.querySelectorAll('section[id]');
  const activateLink = () => {
    const scrollY = window.scrollY + 100;
    sections.forEach(section => {
      const top    = section.offsetTop;
      const height = section.offsetHeight;
      const id     = section.getAttribute('id');
      const link   = document.querySelector(`.navbar__link[href="#${id}"]`);
      if (link) {
        link.classList.toggle('active', scrollY >= top && scrollY < top + height);
      }
    });
  };
  window.addEventListener('scroll', activateLink, { passive: true });
})();
