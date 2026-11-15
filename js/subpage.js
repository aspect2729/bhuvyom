/* Shared behaviour for the sub-pages (simulation.html, predictions.html): the sound button. */
(function () {
  const btn = document.querySelector('[data-action="sound"]');
  if (!btn || !window.SpaceAmbience) return;
  const amb = new window.SpaceAmbience();
  btn.addEventListener('click', () => {
    const on = amb.toggle();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Turn space sound off' : 'Turn space sound on');
    btn.querySelector('[data-bind="soundText"]').textContent = on ? 'Sound on' : 'Sound off';
    btn.querySelectorAll('[data-eq]').forEach((b) => { b.style.animation = on ? b.dataset.eq + ' 1.1s ease-in-out infinite' : 'none'; });
  });
})();
