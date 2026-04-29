// MeetUp — main.js

/* ──────────────────────────────────────────
   HERO SLIDER
   ────────────────────────────────────────── */
(function initHeroSlider() {
  const slides   = document.querySelectorAll('.hero__slide');
  const dots     = document.querySelectorAll('.hero__dot');
  const prevBtn  = document.getElementById('heroPrev');
  const nextBtn  = document.getElementById('heroNext');
  const hero     = document.getElementById('hero');

  if (!slides.length) return;

  let current   = 0;
  let timer     = null;
  const DELAY   = 5000;

  function goTo(index) {
    slides[current].classList.remove('hero__slide--active');
    dots[current].classList.remove('hero__dot--active');
    dots[current].setAttribute('aria-selected', 'false');

    current = (index + slides.length) % slides.length;

    slides[current].classList.add('hero__slide--active');
    dots[current].classList.add('hero__dot--active');
    dots[current].setAttribute('aria-selected', 'true');
  }

  function start() {
    timer = setInterval(() => goTo(current + 1), DELAY);
  }

  function stop() {
    clearInterval(timer);
  }

  function restart() {
    stop();
    start();
  }

  // Flechas
  prevBtn?.addEventListener('click', () => { goTo(current - 1); restart(); });
  nextBtn?.addEventListener('click', () => { goTo(current + 1); restart(); });

  // Dots
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => { goTo(i); restart(); });
  });

  // Pausa al hover
  hero?.addEventListener('mouseenter', stop);
  hero?.addEventListener('mouseleave', start);

  // Swipe en mobile
  let touchStartX = 0;
  hero?.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  hero?.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      goTo(diff > 0 ? current + 1 : current - 1);
      restart();
    }
  }, { passive: true });

  start();
})();

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

/* ──────────────────────────────────────────
   SOLUCIONES — TABS
   ────────────────────────────────────────── */
(function initSolutionsTabs() {
  const tabs   = document.querySelectorAll('.solutions__tab');
  const panels = document.querySelectorAll('.solutions__panel');

  if (!tabs.length) return;

  function activateTab(index) {
    tabs.forEach((tab, i) => {
      const isActive = i === index;
      tab.classList.toggle('solutions__tab--active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });

    panels.forEach((panel, i) => {
      const isActive = i === index;
      panel.classList.toggle('solutions__panel--active', isActive);
      if (isActive) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    });
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activateTab(i));

    // Navegación por teclado (←→)
    tab.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { activateTab((i + 1) % tabs.length); tabs[(i + 1) % tabs.length].focus(); }
      if (e.key === 'ArrowLeft')  { activateTab((i - 1 + tabs.length) % tabs.length); tabs[(i - 1 + tabs.length) % tabs.length].focus(); }
    });
  });
})();
