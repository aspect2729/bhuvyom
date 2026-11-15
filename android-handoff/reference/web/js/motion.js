/* Site-wide motion: Lenis smooth scrolling + GSAP / ScrollTrigger animations.
 * Loaded last on every page (after assets/vendor/gsap.min.js, ScrollTrigger.min.js, lenis.min.js).
 * - Respects prefers-reduced-motion: no smoothing, no animation, everything simply visible.
 * - Maps keep their own wheel zoom: Lenis ignores the wheel while a map is focused.
 * - Map frames are never transformed (their hover read-outs depend on exact positions).
 * The <head> of each page adds html.gsap-on early and hides the first-screen elements
 * until this file animates them in (with a 3 s fallback if this file never runs). */
(function () {
  'use strict';
  window.__motionReady = true;
  const html = document.documentElement;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const REVEAL_CLASSES = '.sim-reveal, .pp-reveal, .cmp-reveal';

  if (reduce || !window.gsap) {
    html.classList.remove('gsap-on');
    document.querySelectorAll(REVEAL_CLASSES).forEach(el => el.classList.add('in'));
    return;
  }
  const gsap = window.gsap, ST = window.ScrollTrigger;
  if (ST) gsap.registerPlugin(ST);
  html.classList.add('gsap-on');

  // GSAP takes over from the pages' CSS reveal transitions; Lenis' recommended base styles
  const css = document.createElement('style');
  css.textContent = `
    html.gsap-on .sim-reveal, html.gsap-on .pp-reveal, html.gsap-on .cmp-reveal { opacity: 1; transform: none; transition: none; }
    html.lenis, html.lenis body { height: auto; }
    .lenis.lenis-smooth { scroll-behavior: auto !important; }
    .lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
    .lenis.lenis-stopped { overflow: hidden; }`;
  document.head.appendChild(css);

  // ─── Lenis smooth scroll, driven by GSAP's ticker so scroll and animation share one clock ───
  let lenis = null;
  if (window.Lenis) {
    lenis = new window.Lenis({
      lerp: 0.09,
      smoothWheel: true,
      // a focused map handles the wheel itself (zoom); everything else scrolls smoothly
      prevent: node => !!(node && node.classList && node.classList.contains('leaflet-container') && node.contains(document.activeElement))
    });
    window.__lenis = lenis;
    if (ST) lenis.on('scroll', ST.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);

    // Same-page anchor links glide instead of jumping
    document.addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href]'); if (!a || a.target === '_blank') return;
      const url = new URL(a.getAttribute('href'), location.href);
      if (url.pathname !== location.pathname || !url.hash || url.hash === '#') return;
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1))); if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -24, duration: 1.4 });
      history.replaceState(null, '', url.hash);
    });
  }

  const ease = 'power3.out';
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // ─── First screen: navigation bar + home hero ───
  const nav = $$('header > div');
  if (nav.length) gsap.fromTo(nav, { autoAlpha: 0, y: -16 }, { autoAlpha: 1, y: 0, duration: 1, ease, delay: 0.1 });
  const hero = $$('#top > div:first-child > div > *').concat($$('#top > div:last-child'));
  if (hero.length) gsap.fromTo(hero, { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, duration: 1.1, ease, stagger: 0.09, delay: 0.25 });

  if (!ST) { $$(REVEAL_CLASSES).forEach(el => el.classList.add('in')); return; }

  // ─── Blocks that rise in once as they enter the viewport ───
  const blocks = $$([
    REVEAL_CLASSES,
    // home page
    '#layers > div > div:first-child', '#systems > div > div:first-child', '#systems-cat-bar', '#system-display',
    '#simulations > div > div', '#compare > div > div',
    '#data > div > p', '#data > div > h2', '#how > div > p', '#how > div > h2',
    'section[aria-labelledby="ctaTitle"] > div:not([aria-hidden]) > *',
    // compare page: the moved "two temperatures" section
    '#honest > div > *'
  ].join(','));
  blocks.forEach(el => {
    gsap.fromTo(el, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 1, ease, scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
  });

  // ─── Groups that stagger in: cards, steps, facts ───
  ['#layers article', '#data article', '#how li'].forEach(sel => {
    const els = $$(sel); if (!els.length) return;
    gsap.set(els, { autoAlpha: 0, y: 30 });
    ST.batch(els, { start: 'top 92%', once: true, onEnter: b => gsap.to(b, { autoAlpha: 1, y: 0, duration: 0.9, ease, stagger: 0.08, overwrite: true }) });
  });

  // The pipeline line on the home page draws across
  $$('#how > div > div[aria-hidden]').forEach(line => {
    gsap.fromTo(line, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 1.4, ease: 'power2.inOut', scrollTrigger: { trigger: line, start: 'top 90%', once: true } });
  });

  // ─── Gentle depth on the home page (scrubbed to scroll, so it moves only as you scroll) ───
  const earth = document.getElementById('earth');
  if (earth) gsap.to(earth, { yPercent: 10, ease: 'none', scrollTrigger: { trigger: earth, start: 'top top', end: 'bottom top', scrub: true } });
  const ring = document.querySelector('section[aria-labelledby="ctaTitle"] > div[aria-hidden]');
  if (ring) gsap.fromTo(ring, { rotate: -12 }, { rotate: 18, ease: 'none', scrollTrigger: { trigger: ring.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });

  // Layout settles after fonts, images and maps load
  window.addEventListener('load', () => ST.refresh());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ST.refresh());
})();
