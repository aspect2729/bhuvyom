/* Page behaviour for index.html — mirrors the logic in design-source/ThreeColor.dc.html.
 * Every value marked "SAMPLE" in the UI is placeholder data until the NASA pipeline is wired in.
 */
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  /* ------------------------------------------------------------------ 1. Earth hero */
  const canvas = $('#earth');
  const HERO_H = 960; // px — hero height in the design
  const TEXTURE_FILES = {
    day: 'assets/textures/earth_day_8k.jpg',
    lights: 'assets/textures/earth_lights_8k.jpg',
    clouds: 'assets/textures/earth_clouds_8k.jpg',
    ocean: 'assets/textures/earth_ocean_mask_4k.jpg',
    bump: 'assets/textures/earth_bump_4k.jpg'
  };
  let globe = null;
  const startGlobe = (textures) => { globe = new window.EarthGlobe(canvas, {
    textures,
    atmosphere: [0.36, 0.56, 0.95],
    markerColor: [0.92, 0.63, 0.35], // amber #E9A15A, pulsing on Bengaluru
    startLon: 1.3542 + 0.5,           // starts just east of India, rotates India into view
    spin: 1,
    layout: (cw) => {
      const mob = cw < 900;
      const R = mob ? Math.max(200, cw * 0.62) : Math.min(cw * 0.37, 580);
      return [{
        cx: mob ? cw * 0.62 : cw * 0.74,      // desktop: right side, partly off-screen
        cy: mob ? HERO_H - R * 0.55 : 500,
        r: R,
        lat: 0.24,                            // camera looks from ~14° N
        sun: [-0.72, 0.32, 0.62],             // light from upper-left → night side + city lights on the right
        mark: 1, clipTop: 0, clipBottom: HERO_H
      }];
    }
  }); };
  // Opened straight from disk: WebGL can't use file:// images, so load the embedded (data-URL) copies instead.
  if (location.protocol === 'file:') {
    const s = document.createElement('script');
    s.src = 'js/earth-textures-embedded.js';
    s.onload = () => startGlobe(window.EARTH_TEXTURES_EMBEDDED);
    document.head.appendChild(s);
  } else startGlobe(TEXTURE_FILES);
  window.addEventListener('pagehide', () => globe && globe.destroy && globe.destroy());

  /* ------------------------------------------------------------------ 2. Sound toggle */
  const amb = new window.SpaceAmbience();
  const soundBtn = $('[data-action="sound"]');
  soundBtn.addEventListener('click', () => {
    const on = amb.toggle();
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', on ? 'Turn space sound off' : 'Turn space sound on');
    $('[data-bind="soundText"]', soundBtn).textContent = on ? 'Sound on' : 'Sound off';
    $$('[data-eq]', soundBtn).forEach((b) => { b.style.animation = on ? b.dataset.eq + ' 1.1s ease-in-out infinite' : 'none'; });
  });

  /* ------------------------------------------------------------------ 3. Explorer: layer chips + heat grid */
  const CHIPS = {
    air:  { label: 'Air temperature', value: '29.4 °C', lo: '20 °C',  hi: '36 °C',  seed: 0,   stops: [[0, [24, 40, 90]], [0.3, [91, 140, 255]], [0.6, [127, 224, 240]], [0.85, [224, 144, 90]], [1, [244, 194, 124]]] },
    lst:  { label: 'Land surface',    value: '36.1 °C', lo: '24 °C',  hi: '44 °C',  seed: 1.3, stops: [[0, [40, 30, 70]], [0.35, [154, 134, 184]], [0.7, [224, 144, 90]], [1, [250, 214, 150]]] },
    rain: { label: 'Precipitation',   value: '170 mm',  lo: '0 mm',   hi: '250 mm', seed: 2.1, stops: [[0, [6, 12, 24]], [0.4, [47, 107, 255]], [0.8, [127, 224, 240]], [1, [230, 250, 255]]] },
    rh:   { label: 'Humidity',        value: '74 %',    lo: '40 %',   hi: '95 %',   seed: 3.7, stops: [[0, [20, 20, 40]], [0.5, [95, 196, 216]], [1, [200, 214, 255]]] },
    wind: { label: 'Wind',            value: '2.8 m/s', lo: '0 m/s',  hi: '8 m/s',  seed: 5.2, stops: [[0, [20, 16, 40]], [0.5, [154, 134, 184]], [1, [169, 232, 245]]] }
  };
  const ramp = (t, stops) => {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) { const a = stops[i - 1], b = stops[i], k = (t - a[0]) / (b[0] - a[0]); return a[1].map((v, j) => Math.round(v + (b[1][j] - v) * k)); }
    }
    return stops[stops.length - 1][1];
  };
  // SAMPLE field: a warm urban core, a hot spot in the east (Whitefield side), a cool lake pocket.
  // Replace with real gridded values from the NASA pipeline (24 × 13 cells over Bengaluru's bbox).
  const cellColours = (chip) => {
    const out = [];
    for (let r = 0; r < 13; r++) for (let c = 0; c < 24; c++) {
      const x = (c - 12) / 11, y = (r - 6) / 6.2;
      const dd = Math.sqrt(x * x + y * y * 1.1);
      const mask = Math.max(0, Math.min(1, (1.15 - dd) / 0.45));
      let t = 0.8 - 0.5 * dd + 0.1 * Math.sin(c * 0.9 + r * 0.5 + chip.seed) + 0.07 * Math.cos(c * 0.4 - r * 1.1 + chip.seed);
      t += 0.2 * Math.exp(-((c - 19) * (c - 19) + (r - 5) * (r - 5)) / 7);
      t -= 0.25 * Math.exp(-((c - 15) * (c - 15) + (r - 8) * (r - 8)) / 3);
      const [R, G, B] = ramp(t, chip.stops);
      const a = mask < 0.02 ? 0.05 : 0.12 + 0.75 * mask;
      out.push('rgba(' + R + ',' + G + ',' + B + ',' + a.toFixed(2) + ')');
    }
    return out;
  };
  const cells = $$('[data-cells] > div');
  const selectChip = (key) => {
    const chip = CHIPS[key];
    $$('[data-chip]').forEach((b) => {
      const on = b.dataset.chip === key;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.style.color = on ? '#000' : '#C9C9CE';
      b.style.borderColor = on ? 'transparent' : 'rgba(255,255,255,0.14)';
      b.style.background = on ? 'linear-gradient(90deg,#7FE0F0,#5B8CFF)' : 'transparent';
    });
    cellColours(chip).forEach((bg, i) => { if (cells[i]) cells[i].style.background = bg; });
    $$('[data-bind="chipLabel"]').forEach((el) => { el.textContent = chip.label; });
    $('[data-bind="chipValue"]').textContent = chip.value;
    $('[data-bind="rampLo"]').textContent = chip.lo;
    $('[data-bind="rampHi"]').textContent = chip.hi;
    $('[data-ramp]').style.background = 'linear-gradient(90deg,' + chip.stops.map((s) => 'rgb(' + s[1].join(',') + ') ' + Math.round(s[0] * 100) + '%').join(',') + ')';
  };
  $$('[data-chip]').forEach((b) => b.addEventListener('click', () => selectChip(b.dataset.chip)));

  /* ------------------------------------------------------------------ 4. Urban-heat simulation sliders */
  // PLACEHOLDER MODEL — only so the UI responds. Swap for the real simulation output.
  const sl = { canopy: 55, roofs: 40, built: 30 };
  const FMT = { canopy: (v) => Math.round(v * 0.4) + ' %', roofs: (v) => v + ' %', built: (v) => '+' + Math.round(v * 0.3) + ' %' };
  const updateSim = () => {
    const f = (sl.canopy * 0.5 + sl.roofs * 0.35 - sl.built * 0.3) / (55 * 0.5 + 40 * 0.35 - 30 * 0.3);
    const mean = 1.25 * f;
    $('[data-bind="simDelta"]').textContent = (mean >= 0 ? '−' : '+') + Math.abs(mean).toFixed(1) + ' °C';
  };
  $$('[data-slider]').forEach((input) => {
    const k = input.dataset.slider;
    input.addEventListener('input', () => {
      sl[k] = Number(input.value);
      $('[data-fill="' + k + '"]').style.width = sl[k] + '%';
      $('[data-thumb="' + k + '"]').style.left = sl[k] + '%';
      $('[data-display="' + k + '"]').textContent = FMT[k](sl[k]);
      updateSim();
    });
  });
})();
