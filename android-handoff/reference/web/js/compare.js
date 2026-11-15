/* Compare page — the same place at two moments, side by side, on one colour scale.
 *   Present : Open-Meteo forecast API "current" values (ECMWF / GFS) + Copernicus CAMS air quality, on a grid over the region
 *   Past    : Open-Meteo archive (ERA5 reanalysis) for the chosen day, same hour of day, same grid
 *   Rainfall: total over the 30 days before each date.  Ground temperature: 0–7 cm soil layer on both sides.
 * The map, interpolation and weather effects follow js/simulation.js; boundaries come from data/outlines.js.
 * "All 16 systems" is an opt-in static snapshot: systems with no connected data say so instead of showing invented fields. */
(function () {
  'use strict';
  const OUT = window.BFO_OUTLINES, $ = id => document.getElementById(id);
  if (!OUT || typeof L === 'undefined') { const l = $('cmp-live'); if (l) { l.textContent = 'Map libraries did not load'; l.dataset.state = 'error'; } return; }
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── Time helpers (everything is India Standard Time) ───
  const pad2 = n => String(n).padStart(2, '0');
  const istNow = () => new Date(Date.now() + 5.5 * 3600e3);
  const isoDate = d => d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDate(d); };
  const M3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pretty = s => +s.slice(8) + ' ' + M3[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4);
  const todayStr = () => isoDate(istNow());
  const HOUR = istNow().getUTCHours();
  const NOW_YEAR = istNow().getUTCFullYear(), YMIN = 1980, YMAX = 2100;
  const yearsAgo = n => { const d = istNow(); d.setUTCFullYear(d.getUTCFullYear() - n); return isoDate(d); };
  const maxPast = () => addDays(todayStr(), -7);          // ERA5 lags real time by a few days
  function agoText(s) {
    const days = Math.round((Date.parse(todayStr() + 'T00:00:00Z') - Date.parse(s + 'T00:00:00Z')) / 86400e3);
    if (days >= 365 * 0.97) { const y = Math.round(days / 365.25); return y + (y === 1 ? ' year' : ' years') + ' ago'; }
    if (days >= 30) { const m = Math.round(days / 30.4); return m + (m === 1 ? ' month' : ' months') + ' ago'; }
    return days + ' days ago';
  }

  // ─── Regions (identical grids to the simulation page) ───
  const BLR = [12.9716, 77.5946];
  const REGIONS = {
    ka:  { key: 'ka',  name: 'Karnataka', bounds: { s: 11.5, n: 18.5, w: 74.0, e: 78.6 }, rows: 9, cols: 7, rw: 200, rh: 300, outline: OUT.ka,  places: OUT.townsKa,   fxScale: 1,   strip: 'Karnataka · 191,791 km²', minZoom: 5 },
    blr: { key: 'blr', name: 'Bengaluru', bounds: { s: 12.62, n: 13.27, w: 77.28, e: 77.87 }, rows: 6,  cols: 6, rw: 220, rh: 242, outline: OUT.blr, places: OUT.placesBlr, fxScale: 0.4, strip: 'Bengaluru Urban district · 12.7–13.2° N', minZoom: 8 }
  };
  let REG, BOUNDS, GRID, BLR_IDX, OUTLINE, RW, RH, MN, MS, KAF, mask = null;
  const mercY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
  function setRegionData(k) {
    REG = REGIONS[k]; BOUNDS = REG.bounds; OUTLINE = REG.outline; RW = REG.rw; RH = REG.rh;
    REG.di = (BOUNDS.n - BOUNDS.s) / (REG.rows - 1); REG.dj = (BOUNDS.e - BOUNDS.w) / (REG.cols - 1);
    GRID = [];
    for (let i = 0; i < REG.rows; i++) for (let j = 0; j < REG.cols; j++) GRID.push([+(BOUNDS.s + i * REG.di).toFixed(4), +(BOUNDS.w + j * REG.dj).toFixed(4)]);
    GRID.push(BLR); BLR_IDX = GRID.length - 1;
    MN = mercY(BOUNDS.n); MS = mercY(BOUNDS.s);
    KAF = OUTLINE.map(([la, lo]) => [(lo - BOUNDS.w) / (BOUNDS.e - BOUNDS.w), (MN - mercY(la)) / (MN - MS)]);
    mask = null;
  }
  setRegionData('ka');

  // IPCC AR6 WGI Table SPM.1 — global warming vs 1850–1900, central (°C); 2100 extends the 2050→2090 slope
  const AR6 = { ssp126: [[2020.5,1.2],[2030,1.5],[2050,1.7],[2090,1.8],[2100,1.825]],
                ssp245: [[2020.5,1.2],[2030,1.5],[2050,2.0],[2090,2.7],[2100,2.875]],
                ssp585: [[2020.5,1.2],[2030,1.6],[2050,2.4],[2090,4.4],[2100,4.9]] };
  const SCEN = { ssp126: 'Low emissions (SSP1-2.6)', ssp245: 'Middle road (SSP2-4.5)', ssp585: 'High emissions (SSP5-8.5)' };
  const SCEN_SHORT = { ssp126: 'Low emissions', ssp245: 'Middle road', ssp585: 'High emissions' };
  const interp = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i-1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return pts[pts.length - 1][1]; };

  // ─── Layers ───
  const WARM = [[0,[24,40,90]],[0.3,[91,140,255]],[0.55,[127,224,240]],[0.8,[224,144,90]],[1,[244,194,124]]];
  const LAYERS = [
    { key: 'air',  label: 'Air temperature',    unit: '°C',    dec: 1, lo: 14, hi: 38,  fieldA: 0.62, src: '2 m above ground · ECMWF / ERA5', stops: WARM,
      word: ['warmer', 'cooler'] },
    { key: 'surf', label: 'Ground temperature', unit: '°C',    dec: 1, lo: 14, hi: 46,  fieldA: 0,    src: 'Soil, 0–7 cm · ECMWF / ERA5-Land', word: ['warmer', 'cooler'],
      stops: [[0,[40,30,70]],[0.35,[154,134,184]],[0.7,[224,144,90]],[1,[250,214,150]]] },
    { key: 'rain', label: 'Rainfall · 30 days', unit: 'mm',    dec: 0, lo: 0,  hi: 300, fieldA: 0.34, src: 'Daily totals summed', word: ['wetter', 'drier'],
      stops: [[0,[10,14,30]],[0.25,[47,107,255]],[0.65,[127,224,240]],[1,[230,250,255]]] },
    { key: 'rh',   label: 'Relative humidity',  unit: '%',     dec: 0, lo: 20, hi: 100, fieldA: 0.22, src: '2 m above ground', word: ['more humid', 'drier'],
      stops: [[0,[40,30,60]],[0.5,[95,196,216]],[1,[200,214,255]]] },
    { key: 'wind', label: 'Wind speed',         unit: 'm/s',   dec: 1, lo: 0,  hi: 9,   fieldA: 0.14, src: '10 m above ground', word: ['windier', 'calmer'],
      stops: [[0,[60,70,140]],[0.4,[127,224,240]],[0.75,[200,240,255]],[1,[255,255,255]]] },
    { key: 'pm25', label: 'PM2.5 air pollution', unit: 'µg/m³', dec: 0, lo: 0,  hi: 100, fieldA: 0.28, src: 'Fine particulates · Copernicus CAMS', word: ['more polluted', 'cleaner'],
      stops: [[0,[20,40,60]],[0.25,[95,196,216]],[0.55,[154,134,184]],[0.8,[224,144,90]],[1,[244,120,90]]] }
  ];
  const FX_NOTE = {
    air: 'Colour and contour lines show temperature.', surf: 'Dot size and colour show ground temperature.',
    rain: 'Clouds follow cloud cover; they are darker where the last 30 days were wettest.', rh: 'Mist thickens as humidity rises.',
    wind: 'Streaks flow with the wind and are coloured by speed.', pm25: 'Haze and drifting particles thicken with PM2.5.'
  };
  let layer = LAYERS[0], basemap = 'day', mode = 'split', pastDate = yearsAgo(10);
  let leftMode = 'past', tlYear = +pastDate.slice(0, 4), mmdd = pastDate.slice(5), scenario = 'ssp245', playing = false;   // the timeline moves the LEFT map

  // ─── Colour + number helpers ───
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const rampAt = (t, stops) => {
    t = clamp01(t);
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const a = stops[i-1], b = stops[i], k = (t - a[0]) / ((b[0] - a[0]) || 1); return a[1].map((v, j) => Math.round(v + (b[1][j] - v) * k)); }
    return stops[stops.length - 1][1];
  };
  const rampCss = stops => 'linear-gradient(90deg,' + stops.map(s => `rgb(${s[1].join(',')}) ${Math.round(s[0] * 100)}%`).join(',') + ')';
  const num = (v, d) => v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (v, ly) => (v == null || isNaN(v)) ? '—' : num(v, ly.dec) + ' ' + ly.unit;
  const sgn = (d, ly) => { const r = +Math.abs(d).toFixed(ly.dec); return (r === 0 ? '±' : d > 0 ? '+' : '−') + num(r, ly.dec) + ' ' + ly.unit; };
  function inPoly(lat, lon) {
    let inside = false;
    for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
      const [yi, xi] = OUTLINE[i], [yj, xj] = OUTLINE[j];
      if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function nearestName(lat, lon) {
    let best = REG.places[0], d0 = 1e9;
    REG.places.forEach(t => { const d = (t[1] - lat) ** 2 + (t[2] - lon) ** 2; if (d < d0) { d0 = d; best = t; } });
    return best[0];
  }

  // ─── Data: present (live) and past (ERA5) ───
  const VALUE_KEYS = ['air', 'surf', 'rain', 'rh', 'wind', 'wdir', 'cloud', 'pm25'];
  const pick = (arr, f) => arr.map(x => { try { const v = f(x); return (v == null || isNaN(v)) ? null : v; } catch (e) { return null; } });
  const coords = () => ({ lat: GRID.map(p => p[0]).join(','), lon: GRID.map(p => p[1]).join(',') });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function getJson(u, tries = 3) {
    for (let i = 0; ; i++) {
      const r = await fetch(u);
      if (r.status === 429 && i < tries - 1) { await sleep(15000); continue; }      // burst limit: wait and try again
      if (!r.ok) throw new Error(u.split('?')[0] + ' ' + r.status);
      return r.json();
    }
  }
  function cached(key) { try { const c = JSON.parse(sessionStorage.getItem(key)); if (c && Date.now() - c.at < 20 * 60e3) return c.data; } catch (e) {} return null; }
  function store(key, data) { try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch (e) {} }

  async function loadPresent() {
    const key = 'bfo-cmp-live-v2-' + REG.key, hit = cached(key); if (hit) return hit;
    const c = coords();
    const [w, a] = await Promise.all([
      getJson(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,soil_temperature_0_to_7cm,cloud_cover&daily=precipitation_sum&past_days=30&forecast_days=1&wind_speed_unit=ms&timezone=Asia%2FKolkata`),
      getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.lat}&longitude=${c.lon}&current=pm2_5`).catch(() => null)
    ]);
    const data = { when: `Live · ${(w[BLR_IDX].current.time || '').slice(11, 16)} IST`, values: {
      air: pick(w, x => x.current.temperature_2m), surf: pick(w, x => x.current.soil_temperature_0_to_7cm),
      rain: pick(w, x => x.daily.precipitation_sum.slice(0, 30).reduce((s, v) => s + (v || 0), 0)),
      rh: pick(w, x => x.current.relative_humidity_2m), wind: pick(w, x => x.current.wind_speed_10m), wdir: pick(w, x => x.current.wind_direction_10m),
      cloud: pick(w, x => x.current.cloud_cover), pm25: a ? pick(a, x => x.current.pm2_5) : GRID.map(() => null) } };
    store(key, data); return data;
  }
  async function loadPast(date) {
    const key = `bfo-cmp-past-v2-${REG.key}-${date}-${HOUR}`;
    try { const p = JSON.parse(localStorage.getItem(key)); if (p) return p; } catch (e) {}
    const c = coords(), H = HOUR;
    const [w, d, a] = await Promise.all([
      getJson(`https://archive-api.open-meteo.com/v1/archive?latitude=${c.lat}&longitude=${c.lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,soil_temperature_0_to_7cm&wind_speed_unit=ms&timezone=Asia%2FKolkata`),
      getJson(`https://archive-api.open-meteo.com/v1/archive?latitude=${c.lat}&longitude=${c.lon}&start_date=${addDays(date, -30)}&end_date=${addDays(date, -1)}&daily=precipitation_sum&timezone=Asia%2FKolkata`),
      date >= '2022-09-01' ? getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.lat}&longitude=${c.lon}&start_date=${date}&end_date=${date}&hourly=pm2_5&timezone=Asia%2FKolkata`).catch(() => null) : Promise.resolve(null)
    ]);
    const hr = k => pick(w, x => x.hourly[k][H]);
    const data = { when: `${pretty(date)} · ${pad2(H)}:00 IST`, date, values: {
      air: hr('temperature_2m'), surf: hr('soil_temperature_0_to_7cm'), rh: hr('relative_humidity_2m'), wind: hr('wind_speed_10m'), wdir: hr('wind_direction_10m'), cloud: hr('cloud_cover'),
      rain: pick(d, x => { const v = x.daily.precipitation_sum; return v.length >= 28 ? v.reduce((s, q) => s + (q || 0), 0) : null; }),
      pm25: a ? pick(a, x => x.hourly.pm2_5[H]) : GRID.map(() => null) } };
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
    return data;
  }

  function projData(live, y, scen) {
    const d = interp(AR6[scen], y) - interp(AR6[scen], NOW_YEAR), v = {};
    VALUE_KEYS.forEach(k => { v[k] = GRID.map(() => null); });
    ['air', 'surf'].forEach(k => { v[k] = live.values[k].map(x => x == null ? null : x + d); });
    return { kind: 'proj', date: null, year: y, delta: d, when: `${y} · ${SCEN[scen]}`, values: v };
  }

  // ─── Rasters (bicubic from the regular grid) ───
  const latOfRow = r => { const m = MN + (MS - MN) * (r + 0.5) / RH; return (2 * Math.atan(Math.exp(m)) - Math.PI / 2) * 180 / Math.PI; };
  const lonOfCol = c => BOUNDS.w + (BOUNDS.e - BOUNDS.w) * (c + 0.5) / RW;
  function buildMask() { mask = new Uint8Array(RW * RH); for (let r = 0; r < RH; r++) { const la = latOfRow(r); for (let c = 0; c < RW; c++) mask[r * RW + c] = inPoly(la, lonOfCol(c)) ? 1 : 0; } }
  function idw(vals, lat, lon) {
    let s = 0, w = 0;
    for (let i = 0; i < GRID.length; i++) { const v = vals[i]; if (v == null) continue; const dy = GRID[i][0] - lat, dx = (GRID[i][1] - lon) * 0.97, d2 = dx * dx + dy * dy; if (d2 < 1e-6) return v; const k = 1 / (d2 * Math.sqrt(d2)); s += v * k; w += k; }
    return w ? s / w : NaN;
  }
  const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  function gridAt(vals, lat, lon) {
    const GR = REG.rows, GC = REG.cols, gi = (lat - BOUNDS.s) / REG.di, gj = (lon - BOUNDS.w) / REG.dj;
    const i1 = Math.max(0, Math.min(GR - 2, Math.floor(gi))), j1 = Math.max(0, Math.min(GC - 2, Math.floor(gj)));
    const ti = Math.max(0, Math.min(1, gi - i1)), tj = Math.max(0, Math.min(1, gj - j1));
    const g = (i, j) => vals[Math.max(0, Math.min(GR - 1, i)) * GC + Math.max(0, Math.min(GC - 1, j))];
    const rows = [];
    for (let di = -1; di <= 2; di++) {
      const a = g(i1 + di, j1 - 1), b = g(i1 + di, j1), c = g(i1 + di, j1 + 1), d = g(i1 + di, j1 + 2);
      if (a == null || b == null || c == null || d == null) return idw(vals, lat, lon);
      rows.push(cr(a, b, c, d, tj));
    }
    return cr(rows[0], rows[1], rows[2], rows[3], ti);
  }
  function buildRaster(vals, masked) {
    if (!mask) buildMask();
    const out = new Float32Array(RW * RH).fill(NaN);
    if (vals.every(v => v == null)) return out;
    for (let r = 0; r < RH; r++) { const la = latOfRow(r); for (let c = 0; c < RW; c++) if (!masked || mask[r * RW + c]) out[r * RW + c] = gridAt(vals, la, lonOfCol(c)); }
    return out;
  }

  // ─── The two sides ───
  function makeSide(id) {
    const S = { id, data: null, raster: {}, full: {}, mean: {}, map: null, field: null, baseDay: null, baseNight: null, cut: null, tipEl: $('tip-' + id), veil: $('veil-' + id), frame: $('frame-' + id),
      fxCv: $('fx-' + id), trail: document.createElement('canvas'), cache: document.createElement('canvas'), veilCv: document.createElement('canvas'),
      parts: [], specks: [], isoCache: null, cacheKey: '', veilImg: null, W: 0, H: 0, V: null, MW: [0, 0] };
    S.fx = S.fxCv.getContext('2d'); S.tctx = S.trail.getContext('2d'); S.cctx = S.cache.getContext('2d'); S.vctx = S.veilCv.getContext('2d');
    return S;
  }
  const SA = makeSide('a'), SB = makeSide('b'), SIDES = [SA, SB];
  const rasterOf = (S, k) => S.raster[k] || (S.raster[k] = buildRaster(S.data.values[k], true));
  function fullOf(S, k) {
    if (S.full[k]) return S.full[k];
    if (k === 'u' || k === 'v') {                                        // meteorological direction = where the wind comes FROM
      const sp = S.data.values.wind, dir = S.data.values.wdir;
      const u = GRID.map((_, i) => sp[i] == null || dir[i] == null ? null : -sp[i] * Math.sin(dir[i] * Math.PI / 180));
      const v = GRID.map((_, i) => sp[i] == null || dir[i] == null ? null : -sp[i] * Math.cos(dir[i] * Math.PI / 180));
      S.full.u = buildRaster(u, false); S.full.v = buildRaster(v, false); return S.full[k];
    }
    return (S.full[k] = buildRaster(S.data.values[k], false));
  }
  const hasData = (S, k) => !!S.data && S.data.values[k].some(v => v != null);
  const valueAt = (S, lat, lon) => (S.data && hasData(S, layer.key) && inPoly(lat, lon)) ? gridAt(S.data.values[layer.key], lat, lon) : NaN;
  function meanOf(S, k) {
    if (S.mean[k] !== undefined) return S.mean[k];
    if (!hasData(S, k)) return (S.mean[k] = null);
    const R = rasterOf(S, k); let s = 0, n = 0; for (let i = 0; i < R.length; i++) { const v = R[i]; if (!isNaN(v)) { s += v; n++; } }
    return (S.mean[k] = n ? s / n : null);
  }
  function resetSide(S) { S.raster = {}; S.full = {}; S.mean = {}; S.isoCache = null; S.cacheKey = ''; S.parts = []; S.specks = []; S.tctx.clearRect(0, 0, S.trail.width, S.trail.height); }

  // One colour scale per layer, fitted to what both moments contain
  function fitRanges() {
    LAYERS.forEach(l => {
      const vals = [];
      SIDES.forEach(S => { if (!S.data) return; GRID.forEach((p, i) => { if (i === BLR_IDX || inPoly(p[0], p[1])) { const v = S.data.values[l.key][i]; if (v != null) vals.push(v); } }); });
      if (vals.length < 4) return;
      const mn = Math.min(...vals), mx = Math.max(...vals), pad = (mx - mn) * 0.1 || 1, step = l.dec ? 1 : (mx - mn > 50 ? 10 : 5);
      l.lo = Math.max(['rain', 'pm25', 'wind'].includes(l.key) ? 0 : -Infinity, Math.floor((mn - pad) / step) * step);
      l.hi = Math.ceil((mx + pad) / step) * step;
      if (l.key === 'rh') l.hi = Math.min(100, l.hi);
    });
  }

  // ─── Noise for clouds, mist and haze ───
  const NS = 256; let NA = null, NB = null;
  function makeNoise(seed, oct) {
    let s = seed >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = new Float32Array(NS * NS); let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const cells = 4 << o, lat = new Float32Array(cells * cells).map(rnd);
      for (let y = 0; y < NS; y++) { const gy = y / NS * cells, y0 = gy | 0, ty = gy - y0, sy = ty * ty * (3 - 2 * ty), y1 = (y0 + 1) % cells;
        for (let x = 0; x < NS; x++) { const gx = x / NS * cells, x0 = gx | 0, tx = gx - x0, sx = tx * tx * (3 - 2 * tx), x1 = (x0 + 1) % cells;
          const a = lat[y0 * cells + x0], b = lat[y0 * cells + x1], c = lat[y1 * cells + x0], d = lat[y1 * cells + x1];
          out[y * NS + x] += amp * ((a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy); } }
      tot += amp; amp *= 0.5;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    let mn = 1, mx = 0; out.forEach(v => { mn = Math.min(mn, v); mx = Math.max(mx, v); });
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn);
    return out;
  }
  const nz = (N, x, y) => { x = ((x % NS) + NS) % NS; y = ((y % NS) + NS) % NS; const x0 = x | 0, y0 = y | 0, tx = x - x0, ty = y - y0, x1 = (x0 + 1) % NS, y1 = (y0 + 1) % NS; const a = N[y0 * NS + x0], b = N[y0 * NS + x1], c = N[y1 * NS + x0], d = N[y1 * NS + x1]; return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty; };

  // ─── Effects ───
  let DPR = 1, T = 0;
  function sizeFx(S) {
    DPR = Math.min(2, window.devicePixelRatio || 1); S.W = S.frame.clientWidth; S.H = S.frame.clientHeight;
    [S.fxCv, S.trail, S.cache].forEach(c => { c.width = S.W * DPR; c.height = S.H * DPR; });
    S.tctx.setTransform(DPR, 0, 0, DPR, 0, 0); S.cctx.setTransform(DPR, 0, 0, DPR, 0, 0); S.cacheKey = '';
  }
  const getView = S => { const a = S.map.latLngToContainerPoint([BOUNDS.n, BOUNDS.w]), b = S.map.latLngToContainerPoint([BOUNDS.s, BOUNDS.e]); return { x0: a.x, y0: a.y, dx: b.x - a.x, dy: b.y - a.y }; };
  function clipState(S, ctx) { ctx.beginPath(); KAF.forEach((f, i) => { const x = S.V.x0 + f[0] * S.V.dx, y = S.V.y0 + f[1] * S.V.dy; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.clip(); }
  const at = (R, a, b) => { const c = (a * RW) | 0, r = (b * RH) | 0; return (c < 0 || r < 0 || c >= RW || r >= RH) ? NaN : R[r * RW + c]; };
  const inMask = (a, b) => { const c = (a * RW) | 0, r = (b * RH) | 0; return c >= 0 && r >= 0 && c < RW && r < RH && mask[r * RW + c] === 1; };
  function meanWind(S) {
    if (!hasData(S, 'wind') || !hasData(S, 'wdir')) return [0, 0];
    const U = fullOf(S, 'u'), V = fullOf(S, 'v'); let su = 0, sv = 0, n = 0;
    for (let i = 0; i < U.length; i += 37) if (!isNaN(U[i])) { su += U[i]; sv += V[i]; n++; }
    return n ? [su / n, sv / n] : [0, 0];
  }
  function drawVeil(S, o) {
    const q = 3, vw = Math.ceil(S.W / q), vh = Math.ceil(S.H / q);
    if (S.veilCv.width !== vw || S.veilCv.height !== vh) { S.veilCv.width = vw; S.veilCv.height = vh; S.veilImg = S.vctx.createImageData(vw, vh); }
    const d = S.veilImg.data, t = T / 1000, V = S.V, dx = -S.MW[0] * o.speed * t, dy = S.MW[1] * o.speed * t;
    for (let y = 0; y < vh; y++) {
      const fy = (y * q + q / 2 - V.y0) / V.dy;
      for (let x = 0; x < vw; x++) {
        const i = (y * vw + x) * 4, fxx = (x * q + q / 2 - V.x0) / V.dx;
        if (fxx < 0 || fxx > 1 || fy < 0 || fy > 1) { d[i + 3] = 0; continue; }
        const den = o.dens(fxx, fy); if (!(den > 0.02)) { d[i + 3] = 0; continue; }
        const u = fxx * o.scale * NS, v = fy * o.scale * NS * 1.4, n = 0.65 * nz(NA, u + dx, v + dy) + 0.35 * nz(NB, u * 2.1 - dx * 1.6, v * 2.1 - dy * 1.6), th = 1 - den;
        const a = smooth(th - o.soft, th + o.soft * 1.6, n) * o.maxA * (0.4 + 0.6 * den), shade = o.shade ? o.shade(fxx, fy, n - th) : 1;
        d[i] = o.tint[0] * shade; d[i + 1] = o.tint[1] * shade; d[i + 2] = o.tint[2] * shade; d[i + 3] = a * 255;
      }
    }
    S.vctx.putImageData(S.veilImg, 0, 0);
    S.fx.save(); clipState(S, S.fx); S.fx.imageSmoothingEnabled = true; S.fx.drawImage(S.veilCv, 0, 0, vw * q, vh * q); S.fx.restore();
  }
  const seed = p => { for (let k = 0; k < 30; k++) { const a = Math.random(), b = Math.random(); if (inMask(a, b)) { p.fx = a; p.fy = b; break; } } p.age = 0; p.max = 60 + Math.random() * 90; return p; };
  function stepWind(S) {
    const U = fullOf(S, 'u'), Vv = fullOf(S, 'v'), V = S.V, n = Math.round(Math.min(2400, Math.max(900, V.dx * V.dy / 380)));
    while (S.parts.length < n) S.parts.push(seed({})); if (S.parts.length > n) S.parts.length = n;
    const kpx = 0.85 * Math.max(0.6, V.dx / 900), hi = Math.max(4, layer.hi), B = 7, buckets = Array.from({ length: B }, () => []), tc = S.tctx;
    tc.globalCompositeOperation = 'destination-in'; tc.fillStyle = 'rgba(0,0,0,0.955)'; tc.fillRect(0, 0, S.W, S.H); tc.globalCompositeOperation = 'source-over';
    S.parts.forEach(p => {
      const u = at(U, p.fx, p.fy), v = at(Vv, p.fx, p.fy);
      if (isNaN(u) || ++p.age > p.max || !inMask(p.fx, p.fy)) { seed(p); return; }
      const x = V.x0 + p.fx * V.dx, y = V.y0 + p.fy * V.dy; p.fx += u * kpx / V.dx; p.fy -= v * kpx / V.dy;
      buckets[Math.min(B - 1, (Math.hypot(u, v) / hi * B) | 0)].push(x, y, V.x0 + p.fx * V.dx, V.y0 + p.fy * V.dy);
    });
    tc.lineWidth = 1.5; tc.lineCap = 'round';
    buckets.forEach((seg, b) => { if (!seg.length) return; const c = rampAt((b + 0.5) / B * 0.7 + 0.3, layer.stops); tc.strokeStyle = `rgba(${c.join(',')},0.95)`; tc.beginPath(); for (let i = 0; i < seg.length; i += 4) { tc.moveTo(seg[i], seg[i + 1]); tc.lineTo(seg[i + 2], seg[i + 3]); } tc.stroke(); });
    S.fx.save(); clipState(S, S.fx); S.fx.drawImage(S.trail, 0, 0, S.W, S.H); S.fx.restore();
  }
  function drawSpecks(S) {
    const U = fullOf(S, 'u'), Vv = fullOf(S, 'v'), R = rasterOf(S, 'pm25'), span = Math.max(20, layer.hi), V = S.V;
    while (S.specks.length < 700) S.specks.push(seed({}));
    const kpx = 0.06 * Math.max(0.6, V.dx / 900), fx = S.fx;
    fx.save(); clipState(S, fx);
    S.specks.forEach(p => {
      const u = at(U, p.fx, p.fy), v = at(Vv, p.fx, p.fy), c = at(R, p.fx, p.fy);
      if (isNaN(u) || isNaN(c) || ++p.age > p.max * 4) { seed(p); return; }
      p.fx += (u * kpx + (Math.random() - 0.5) * 0.4) / V.dx; p.fy -= (v * kpx + (Math.random() - 0.5) * 0.4) / V.dy;
      const t = clamp01(c / span), life = Math.sin(Math.PI * p.age / (p.max * 4)), col = rampAt(0.45 + t * 0.55, layer.stops);
      fx.fillStyle = `rgba(${col.join(',')},${(0.3 + 0.7 * t) * life})`; fx.fillRect(V.x0 + p.fx * V.dx, V.y0 + p.fy * V.dy, 2, 2);
    });
    fx.restore();
  }
  const niceStep = range => range <= 6 ? 0.5 : range <= 14 ? 1 : 2;
  function isolines(S) {
    const key = layer.lo + '|' + layer.hi + '|' + REG.key; if (S.isoCache && S.isoCache.key === key) return S.isoCache;
    const R = rasterOf(S, 'air'), step = niceStep(layer.hi - layer.lo), s = 2, minor = [], major = [], levels = [];
    for (let Lv = Math.ceil(layer.lo / step) * step; Lv <= layer.hi; Lv += step) levels.push(Lv);
    const P = (c, r) => [(c + 0.5) / RW, (r + 0.5) / RH];
    for (let r = 0; r + s < RH; r += s) for (let c = 0; c + s < RW; c += s) {
      const v0 = R[r * RW + c], v1 = R[r * RW + c + s], v2 = R[(r + s) * RW + c + s], v3 = R[(r + s) * RW + c];
      if (isNaN(v0) || isNaN(v1) || isNaN(v2) || isNaN(v3)) continue;
      const lo = Math.min(v0, v1, v2, v3), hi = Math.max(v0, v1, v2, v3);
      levels.forEach(Lv => {
        if (Lv < lo || Lv > hi) return;
        const idx = (v0 > Lv ? 8 : 0) | (v1 > Lv ? 4 : 0) | (v2 > Lv ? 2 : 0) | (v3 > Lv ? 1 : 0); if (idx === 0 || idx === 15) return;
        const T_ = P(c + s * (Lv - v0) / (v1 - v0), r), Rr = P(c + s, r + s * (Lv - v1) / (v2 - v1)), Bm = P(c + s * (Lv - v3) / (v2 - v3), r + s), Lf = P(c, r + s * (Lv - v0) / (v3 - v0));
        const segs = { 1: [[Lf, Bm]], 2: [[Bm, Rr]], 3: [[Lf, Rr]], 4: [[T_, Rr]], 5: [[Lf, T_], [Bm, Rr]], 6: [[T_, Bm]], 7: [[Lf, T_]], 8: [[Lf, T_]], 9: [[T_, Bm]], 10: [[T_, Rr], [Lf, Bm]], 11: [[T_, Rr]], 12: [[Lf, Rr]], 13: [[Bm, Rr]], 14: [[Lf, Bm]] }[idx];
        const out = Math.abs(Lv / (step * 2) - Math.round(Lv / (step * 2))) < 1e-6 ? major : minor; segs.forEach(sg => out.push(sg[0][0], sg[0][1], sg[1][0], sg[1][1]));
      });
    }
    return (S.isoCache = { key, minor, major });
  }
  function drawIsotherms(S) {
    const iso = isolines(S), V = S.V, fx = S.fx; fx.save(); clipState(S, fx); fx.lineCap = 'round';
    [[iso.minor, 'rgba(255,255,255,0.3)', 1, true], [iso.major, 'rgba(255,255,255,0.62)', 1.3, false]].forEach(([seg, col, lw, dashed]) => {
      fx.strokeStyle = col; fx.lineWidth = lw; fx.setLineDash(dashed ? [3, 4] : []); fx.lineDashOffset = dashed && !reduce ? -T / 90 : 0; fx.beginPath();
      for (let i = 0; i < seg.length; i += 4) { fx.moveTo(V.x0 + seg[i] * V.dx, V.y0 + seg[i + 1] * V.dy); fx.lineTo(V.x0 + seg[i + 2] * V.dx, V.y0 + seg[i + 3] * V.dy); }
      fx.stroke();
    });
    fx.restore();
  }
  function drawDots(S) {
    const V = S.V, key = [V.x0, V.y0, V.dx, V.dy, layer.lo, layer.hi, S.data.when].map(v => typeof v === 'number' ? v.toFixed(1) : v).join('|') + S.W + 'x' + S.H;
    if (S.cacheKey !== key) {
      S.cacheKey = key; S.cctx.clearRect(0, 0, S.W, S.H);
      const R = rasterOf(S, 'surf'), sp = 9, span = layer.hi - layer.lo;
      for (let y = sp / 2; y < S.H; y += sp) { const fy = (y - V.y0) / V.dy; if (fy < 0 || fy > 1) continue;
        for (let x = sp / 2; x < S.W; x += sp) { const fxx = (x - V.x0) / V.dx; if (fxx < 0 || fxx > 1) continue;
          const v = at(R, fxx, fy); if (isNaN(v)) continue; const t = clamp01((v - layer.lo) / span), c = rampAt(t, layer.stops);
          S.cctx.fillStyle = `rgba(${c.join(',')},${0.55 + 0.45 * t})`; S.cctx.beginPath(); S.cctx.arc(x, y, 0.9 + 3.1 * t, 0, Math.PI * 2); S.cctx.fill(); } }
    }
    S.fx.drawImage(S.cache, 0, 0, S.W, S.H);
    if (reduce) return;
    const y = V.y0 + ((T / 26) % (V.dy + 160)) - 80; S.fx.save(); clipState(S, S.fx); S.fx.globalCompositeOperation = 'lighter';
    const g = S.fx.createLinearGradient(0, y - 40, 0, y + 40); g.addColorStop(0, 'rgba(250,214,150,0)'); g.addColorStop(0.5, 'rgba(250,214,150,0.16)'); g.addColorStop(1, 'rgba(250,214,150,0)');
    S.fx.fillStyle = g; S.fx.fillRect(0, y - 40, S.W, 80); S.fx.restore();
  }
  function drawFx(S) {
    if (!S.map || !S.data || !S.W) return;
    S.V = getView(S); S.MW = meanWind(S);
    const fx = S.fx; fx.setTransform(DPR, 0, 0, DPR, 0, 0); fx.clearRect(0, 0, S.W, S.H);
    const night = basemap === 'night', k = layer.key; if (!hasData(S, k)) return;
    if (k === 'air') drawIsotherms(S);
    else if (k === 'surf') drawDots(S);
    else if (k === 'rain') {
      const R = rasterOf(S, 'rain'), hi = Math.max(60, layer.hi), C = hasData(S, 'cloud') ? fullOf(S, 'cloud') : null; if (!C) return;
      drawVeil(S, { scale: 2.2 * REG.fxScale, speed: 0.9, soft: 0.12, maxA: night ? 0.8 : 0.92, tint: night ? [196, 204, 222] : [250, 251, 253],
        dens: (a, b) => clamp01((at(C, a, b) || 0) / 100) * 0.92,
        shade: (a, b, e) => { const wet = clamp01((at(R, a, b) || 0) / hi); return Math.max(0.38, Math.min(1, 0.72 + e * 0.9 - wet * 0.42)); } });
    }
    else if (k === 'rh') { const R = rasterOf(S, 'rh'); drawVeil(S, { scale: 1.3 * REG.fxScale, speed: 0.35, soft: 0.34, maxA: night ? 0.42 : 0.55, tint: night ? [150, 175, 195] : [214, 232, 240], dens: (a, b) => clamp01(((at(R, a, b) || 0) - 35) / 65) }); }
    else if (k === 'wind') { if (hasData(S, 'wdir')) stepWind(S); }
    else if (k === 'pm25') { const R = rasterOf(S, 'pm25'), span = Math.max(20, layer.hi); drawVeil(S, { scale: 3.2 * REG.fxScale, speed: 0.25, soft: 0.4, maxA: 0.5, tint: night ? [150, 120, 100] : [196, 170, 140], dens: (a, b) => clamp01((at(R, a, b) || 0) / span) * 0.85 }); if (hasData(S, 'wdir')) drawSpecks(S); }
  }
  let onScreen = false, rafId = 0, lastFrame = 0;
  function loop(ts) {
    rafId = 0; if (!onScreen || document.hidden || reduce || mode !== 'split') return;
    rafId = requestAnimationFrame(loop); if (ts - lastFrame < 32) return;
    lastFrame = ts; T = ts; SIDES.forEach(drawFx);
  }
  function kick() {
    if (mode !== 'split') return;
    if (reduce) { T = 0; SIDES.forEach(S => { if (!S.map || !S.data) return; if (layer.key === 'wind') { S.V = getView(S); S.MW = meanWind(S); S.tctx.clearRect(0, 0, S.W, S.H); if (hasData(S, 'wdir')) for (let i = 0; i < 40; i++) stepWind(S); S.fx.clearRect(0, 0, S.W, S.H); } drawFx(S); }); return; }
    if (!rafId && onScreen && !document.hidden) rafId = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', kick);

  // ─── Colour field (Leaflet image overlay) ───
  function renderField(S) {
    if (!S.map || !S.data) return;
    if (!layer.fieldA || !hasData(S, layer.key)) { if (S.field) { S.map.removeLayer(S.field); S.field = null; } return; }
    const R = rasterOf(S, layer.key), cv = document.createElement('canvas'); cv.width = RW; cv.height = RH;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(RW, RH), span = layer.hi - layer.lo, A = Math.round(255 * layer.fieldA);
    for (let i = 0; i < R.length; i++) { const v = R[i]; if (isNaN(v)) continue; const [r, g, b] = rampAt((v - layer.lo) / span, layer.stops); img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = A; }
    ctx.putImageData(img, 0, 0); const url = cv.toDataURL();
    if (S.field) S.field.setUrl(url); else S.field = L.imageOverlay(url, [[BOUNDS.s, BOUNDS.w], [BOUNDS.n, BOUNDS.e]], { className: 'ts-field', interactive: false }).addTo(S.map);
  }

  // ─── Maps (two, kept in step) ───
  let syncing = false, hover = null;
  function fitRegion() {
    const narrow = $('frame-a').clientWidth < 520;
    SA.map.fitBounds(L.latLngBounds(OUTLINE), { paddingTopLeft: [16, narrow ? 70 : 76], paddingBottomRight: [16, 16] });
    SB.map.setView(SA.map.getCenter(), SA.map.getZoom(), { animate: false });
  }
  function initMaps() {
    SIDES.forEach(S => {
      S.map = L.map('map-' + S.id, { zoomControl: false, attributionControl: false, scrollWheelZoom: false, zoomSnap: 0.25, minZoom: REG.minZoom, maxZoom: 12 });
      L.control.zoom({ position: 'topright' }).addTo(S.map);
      S.baseDay = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 12 });
      S.baseNight = L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', { maxNativeZoom: 8, maxZoom: 12 });
      S.map.createPane('cut'); S.map.getPane('cut').style.zIndex = 450; S.map.getPane('cut').style.pointerEvents = 'none';
      S.cut = L.polygon(OUTLINE, { pane: 'cut', interactive: false, color: '#F2F2F2', weight: 1.2, opacity: 0.85, fill: false }).addTo(S.map);
      L.marker(BLR, { icon: L.divIcon({ className: 'ts-beacon', iconSize: [12, 12], iconAnchor: [6, 6] }), keyboard: false, interactive: false }).addTo(S.map);
      S.map.on('focus', () => S.map.scrollWheelZoom.enable()); S.map.on('blur', () => S.map.scrollWheelZoom.disable());
    });
    setBasemap(basemap);
    fitRegion();
    [[SA, SB], [SB, SA]].forEach(([src, dst]) => {
      const follow = () => { if (syncing) return; syncing = true; dst.map.setView(src.map.getCenter(), src.map.getZoom(), { animate: false }); syncing = false; };
      src.map.on('move', follow); src.map.on('zoomend', follow);
      src.map.on('mousemove', e => probe(e.latlng)); src.map.on('click', e => probe(e.latlng)); src.map.on('mouseout', clearHover);
      src.map.on('movestart zoomstart', () => { SIDES.forEach(S => { S.tipEl.style.display = 'none'; S.tctx.clearRect(0, 0, S.W, S.H); }); });
      src.map.on('moveend zoomend', () => { SIDES.forEach(S => S.tctx.clearRect(0, 0, S.W, S.H)); if (reduce) kick(); });
    });
    setTimeout(() => { SIDES.forEach(S => { S.map.invalidateSize(); sizeFx(S); }); }, 100);
  }
  function setBasemap(which) {
    basemap = which;
    document.querySelectorAll('[data-basemap]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.basemap === which)));
    SIDES.forEach(S => {
      if (!S.map) return;
      const on = which === 'day' ? S.baseDay : S.baseNight, off = which === 'day' ? S.baseNight : S.baseDay;
      if (S.map.hasLayer(off)) S.map.removeLayer(off); if (!S.map.hasLayer(on)) on.addTo(S.map).bringToBack();
    });
    if (reduce) kick();
  }
  document.querySelectorAll('[data-basemap]').forEach(b => b.addEventListener('click', () => setBasemap(b.dataset.basemap)));

  // ─── Hover: the same spot on both maps ───
  function probe(latlng) {
    if (!SA.data || !SB.data || !inPoly(latlng.lat, latlng.lng)) { clearHover(); return; }
    hover = { lat: latlng.lat, lon: latlng.lng, name: nearestName(latlng.lat, latlng.lng) };
    SIDES.forEach(S => {
      const v = valueAt(S, hover.lat, hover.lon), p = S.map.latLngToContainerPoint(latlng);
      S.tipEl.innerHTML = `<b>${hover.name}</b><span>${isNaN(v) ? (S.data.kind === 'proj' ? 'No projection' : 'No record') : fmt(v, layer)}</span>`;
      S.tipEl.style.left = p.x + 'px'; S.tipEl.style.top = p.y + 'px'; S.tipEl.style.display = 'block';
    });
    renderReadouts();
  }
  function clearHover() { SIDES.forEach(S => { S.tipEl.style.display = 'none'; }); if (hover) { hover = null; renderReadouts(); } }

  // ─── Readouts, change sentence, legend, table ───
  function sideValue(S) {
    if (!S.data || !hasData(S, layer.key)) return null;
    if (hover) { const v = valueAt(S, hover.lat, hover.lon); return isNaN(v) ? null : v; }
    return meanOf(S, layer.key);
  }
  const noRecordText = S => (S.data && S.data.kind === 'proj') ? 'No projection' : 'No record';
  function renderReadouts() {
    SIDES.forEach(S => {
      const isLeft = S === SA, v = sideValue(S), d = S.data;
      let k = isLeft ? 'Past' : 'Now', chipK = 'NOW';
      if (isLeft) {
        chipK = 'PAST';
        if (d && d.kind === 'proj') { k = `${d.year} · projection`; chipK = 'FUTURE'; }
        else if (d && d.kind === 'live') { k = 'Same as now'; chipK = 'LIVE'; }
        else if (d) k = `Past · ${agoText(d.date)}`;
        $('chipk-a').textContent = chipK;
      }
      $('k-' + S.id).textContent = k;
      $('v-' + S.id).textContent = d ? (v == null ? noRecordText(S) : fmt(v, layer)) : '—';
      let sub = !d ? '' : hover ? `Near ${hover.name} · ${hover.lat.toFixed(2)}° N ${hover.lon.toFixed(2)}° E` : `${REG.name} average · ${d.when}`;
      if (d && d.kind === 'proj' && v != null) sub += ' · today’s reading plus the projected warming';
      if (d && !hasData(S, layer.key)) sub += d.kind === 'proj' ? ' · only temperature is projected' : ' · this layer has no record for that day';
      $('s-' + S.id).textContent = sub;
      $('chip-' + S.id).textContent = d ? d.when : '—';
    });
  }
  function renderChange() {
    const a = sideValue(SA), b = sideValue(SB), h = $('cmp-change'), n = $('cmp-change-note'), d = SA.data;
    if (!d || !SB.data) { h.textContent = '—'; n.textContent = ''; return; }
    if (d.kind === 'live') { h.innerHTML = '<em>No difference</em>, both maps show the live conditions'; n.textContent = 'Move the timeline back to compare with the past, or forward for a warming scenario.'; return; }
    if (a == null || b == null) {
      if (d.kind === 'proj') { h.textContent = `No ${d.year} projection for ${layer.label.split(' · ')[0].toLowerCase()}`; n.textContent = 'Only air and ground temperature are projected, from the IPCC warming scenarios. Choose one of those layers, or move the timeline back into the record.'; }
      else { h.textContent = a == null ? `No ${layer.label.toLowerCase()} record for ${pretty(d.date)}` : 'Not enough data to compare'; n.textContent = layer.key === 'pm25' ? 'Air-quality records in this source start in September 2022. Choose a later day.' : 'Try another day or layer.'; }
      return;
    }
    const dv = b - a, tiny = Math.abs(dv) < 0.5 * Math.pow(10, -layer.dec);
    const then = d.kind === 'proj' ? `the ${d.year} projection (${SCEN_SHORT[scenario]})` : agoText(d.date), where = hover ? 'Near ' + hover.name : REG.name + ' average';
    h.innerHTML = tiny ? `<em>No change</em> in ${layer.label.toLowerCase()} compared with ${then}` : `<em>${num(Math.abs(dv), layer.dec)} ${layer.unit} ${dv > 0 ? layer.word[0] : layer.word[1]}</em> than ${then}`;
    n.textContent = d.kind === 'proj'
      ? `${where}: ${fmt(a, layer)} projected for ${d.year}, ${fmt(b, layer)} now. The projection is today’s live reading plus the IPCC AR6 central warming estimate for ${SCEN[scenario]}; it is not a forecast of that day’s weather.`
      : `${where}: ${fmt(a, layer)} on ${pretty(d.date)}, ${fmt(b, layer)} now. One day against another shows weather as much as climate, so move the date around to see how much it swings.`;
  }
  function renderLegend() {
    $('ts-legend-label').textContent = `${layer.label} (${layer.unit})`;
    $('ts-legend-bar').style.background = rampCss(layer.stops);
    $('ts-legend-min').textContent = fmt(layer.lo, layer); $('ts-legend-max').textContent = fmt(layer.hi, layer);
    document.querySelector('.ts-legend .fx').textContent = FX_NOTE[layer.key] + ' The same colour scale on both sides.';
  }
  function renderTable() {
    const d = SA.data, miss = d && d.kind === 'proj' ? 'No projection' : 'No record';
    $('th-past').textContent = !d ? 'Past' : d.kind === 'proj' ? `${d.year} projection` : d.kind === 'live' ? 'Left map · live' : 'Past · ' + pretty(d.date);
    $('cmp-tbody').innerHTML = LAYERS.map(l => {
      const a = SA.data ? meanOf(SA, l.key) : null, b = SB.data ? meanOf(SB, l.key) : null;
      return `<tr class="${l === layer ? 'cur' : ''}"><td>${l.label}</td>` +
        (a == null ? `<td class="na">${miss}</td>` : `<td class="v">${fmt(a, l)}</td>`) + (b == null ? '<td class="na">—</td>' : `<td class="v">${fmt(b, l)}</td>`) +
        (a == null || b == null ? '<td class="na">—</td>' : `<td class="d">${sgn(b - a, l)}</td>`) + '</tr>';
    }).join('');
  }

  // ─── Optional: all 16 systems, static ───
  const SYSTEMS16 = [
    { n: 1, name: 'Temperature', layers: ['air', 'surf'] }, { n: 2, name: 'Precipitation & Water', layers: ['rain'] },
    { n: 3, name: 'Extreme Weather', need: 'IMD / NASA event records' }, { n: 4, name: 'Atmospheric Activity', layers: ['rh', 'wind'] },
    { n: 5, name: 'Ocean Systems', need: 'Argo floats · OSCAR · Sentinel-6' }, { n: 6, name: 'Vegetation & Greenery', need: 'MODIS / Sentinel-2 NDVI' },
    { n: 7, name: 'Land & Soil', need: 'SRTM · ESA WorldCover' }, { n: 8, name: 'Wildfires', need: 'VIIRS 375 m active fires' },
    { n: 9, name: 'Cryosphere', need: 'MODIS snow and glacier products' }, { n: 10, name: 'Solar & Space Activity', need: 'NOAA SWPC · GOES' },
    { n: 11, name: 'Air Quality', layers: ['pm25'] }, { n: 12, name: 'Carbon & Ecosystems', need: 'MODIS GPP / NPP · OCO-2' },
    { n: 13, name: 'Geological Activity', need: 'USGS · GSI seismic catalogues' }, { n: 14, name: 'Human Impact', need: 'VIIRS night lights · WorldPop' },
    { n: 15, name: 'Derived Intelligence', note: 'Will be built from the layers above, once more of them are connected.' }, { n: 16, name: 'Predictions & Simulations', link: 'predictions.html' }
  ];
  const tileLayer = {};     // system number -> chosen layer key
  function buildAllGrid() {
    $('cmp-all-grid').innerHTML = SYSTEMS16.map(s => {
      const nn = pad2(s.n);
      if (s.link) return `<div class="cmp-tile off"><h3><i>${nn}</i>${s.name}</h3><div class="none"><b>Forecast engine</b>This one looks forward, not back. <a href="${s.link}">Open future predictions →</a></div></div>`;
      if (!s.layers) return `<div class="cmp-tile off"><h3><i>${nn}</i>${s.name}</h3><div class="none"><b>Not connected yet</b>${s.note || 'Needs ' + s.need + '.'}</div></div>`;
      const chips = s.layers.length > 1 ? `<div class="lyr">${s.layers.map(k => `<button type="button" data-sys="${s.n}" data-lk="${k}" aria-pressed="false">${LAYERS.find(l => l.key === k).label.replace(' temperature', '').replace(' · 30 days', '')}</button>`).join('')}</div>` : '';
      return `<div class="cmp-tile" id="tile-${s.n}"><h3><i>${nn}</i>${s.name}</h3>
        <div class="pair"><canvas id="tc-${s.n}-a" aria-hidden="true"></canvas><canvas id="tc-${s.n}-b" aria-hidden="true"></canvas></div>
        <div class="cap"><span class="p">PAST <b id="tv-${s.n}-a">—</b></span><span class="n">NOW <b id="tv-${s.n}-b">—</b></span></div>
        <div class="chg" id="tg-${s.n}"></div>${chips}</div>`;
    }).join('');
    SYSTEMS16.forEach(s => { if (s.layers) tileLayer[s.n] = s.layers[0]; });
  }
  function drawMini(cv, S, ly) {
    const w = 168, h = Math.round(w * RH / RW); cv.width = w * 2; cv.height = h * 2; cv.style.aspectRatio = w + ' / ' + h;
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
    if (!S.data || !hasData(S, ly.key)) { ctx.fillStyle = '#6E6E76'; ctx.font = '22px Jura, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(S.data && S.data.kind === 'proj' ? 'NO PROJECTION' : 'NO RECORD', cv.width / 2, cv.height / 2); return; }
    const R = rasterOf(S, ly.key), off = document.createElement('canvas'); off.width = RW; off.height = RH;
    const oc = off.getContext('2d'), img = oc.createImageData(RW, RH), span = ly.hi - ly.lo;
    for (let i = 0; i < R.length; i++) { const v = R[i]; if (isNaN(v)) continue; const [r, g, b] = rampAt((v - ly.lo) / span, ly.stops); img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
    oc.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, cv.width, cv.height);
    ctx.strokeStyle = 'rgba(242,242,242,0.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); KAF.forEach((f, i) => { const x = f[0] * cv.width, y = f[1] * cv.height; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke();
  }
  function renderAll() {
    $('all-past').textContent = !SA.data ? '—' : SA.data.kind === 'proj' ? SA.data.year + ' projection' : SA.data.kind === 'live' ? 'live' : pretty(SA.data.date);
    SYSTEMS16.forEach(s => {
      if (!s.layers) return;
      const ly = LAYERS.find(l => l.key === tileLayer[s.n]);
      drawMini($('tc-' + s.n + '-a'), SA, ly); drawMini($('tc-' + s.n + '-b'), SB, ly);
      const a = SA.data ? meanOf(SA, ly.key) : null, b = SB.data ? meanOf(SB, ly.key) : null;
      $('tv-' + s.n + '-a').textContent = a == null ? 'none' : fmt(a, ly); $('tv-' + s.n + '-b').textContent = b == null ? '—' : fmt(b, ly);
      $('tg-' + s.n).innerHTML = (a == null || b == null) ? (s.layers.length > 1 ? '' : (SA.data && SA.data.kind === 'proj' ? 'No projection for this one' : 'No record to compare')) : `<b>${sgn(b - a, ly)}</b>${b - a > 0 ? ly.word[0] : ly.word[1]} than then`;
      document.querySelectorAll(`[data-sys="${s.n}"]`).forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.lk === ly.key)));
    });
  }
  $('cmp-all-grid').addEventListener('click', e => { const b = e.target.closest('[data-lk]'); if (!b) return; tileLayer[+b.dataset.sys] = b.dataset.lk; renderAll(); });

  // ─── Layer menu (same design as the simulation) ───
  const menuBtn = $('cmp-menu-btn'), menuList = $('cmp-menu-list');
  const swatch = l => `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 45%), conic-gradient(from 210deg, ${l.stops.filter(st => st[0] >= 0.2).map(st => `rgb(${st[1].join(',')})`).concat(`rgb(${rampAt(0.2, l.stops).join(',')})`).join(',')})`;
  const accentOf = l => rampAt(0.62, l.stops);
  function renderMenu() {
    $('cmp-menu-current').textContent = layer.label;
    menuList.innerHTML = LAYERS.map(l => { const a = accentOf(l).join(','); return `<button type="button" class="ts-opt" role="menuitemradio" aria-checked="${l === layer}" data-layer="${l.key}" style="--oc:rgb(${a});--ocrgb:${a}"><span class="sw" aria-hidden="true" style="background:${swatch(l)}"></span><span class="n">${l.label}</span><span class="u">${l.unit}</span><span class="s">${l.src}</span></button>`; }).join('');
    const a = accentOf(layer); const m = $('cmp-menu'); m.style.setProperty('--acc', `rgb(${a.join(',')})`); m.style.setProperty('--accrgb', a.join(',')); $('cmp-menu-sw').style.background = swatch(layer);
  }
  function openMenu(open) { menuList.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open)); if (open) { const c = menuList.querySelector('[aria-checked="true"]'); if (c) c.focus({ preventScroll: true }); } }
  menuBtn.addEventListener('click', () => openMenu(!menuList.classList.contains('open')));
  menuList.addEventListener('click', e => { const b = e.target.closest('[data-layer]'); if (!b) return; setLayer(LAYERS.find(l => l.key === b.dataset.layer)); openMenu(false); menuBtn.focus({ preventScroll: true }); });
  menuList.addEventListener('keydown', e => { const it = [...menuList.querySelectorAll('.ts-opt')], i = it.indexOf(document.activeElement); if (e.key === 'ArrowDown') { e.preventDefault(); it[(i + 1) % it.length].focus(); } if (e.key === 'ArrowUp') { e.preventDefault(); it[(i - 1 + it.length) % it.length].focus(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuList.classList.contains('open')) { openMenu(false); menuBtn.focus(); } });
  document.addEventListener('click', e => { if (!e.target.closest('#cmp-menu')) openMenu(false); });

  // ─── Render pipeline ───
  function updateLeftVeil() {
    const d = SA.data; if (!d || leftLoading) return;
    if (hasData(SA, layer.key)) { showVeil(SA, ''); return; }
    showVeil(SA, d.kind === 'proj' ? `No ${d.year} projection for ${layer.label.split(' · ')[0].toLowerCase()}. Only air and ground temperature are projected.` : layer.key === 'pm25' ? 'No PM2.5 record for that day. Records start in September 2022.' : `No ${layer.label.toLowerCase()} record for that day.`);
  }
  function render() {
    updateLeftVeil(); renderMenu(); renderLegend(); renderReadouts(); renderChange(); renderTable();
    if (mode === 'split') { SIDES.forEach(renderField); kick(); } else renderAll();
  }
  function setLayer(l) { layer = l; hover = null; SIDES.forEach(S => { S.tipEl.style.display = 'none'; S.parts = []; S.specks = []; S.isoCache = null; S.cacheKey = ''; S.tctx.clearRect(0, 0, S.W, S.H); }); render(); }

  // ─── Loading ───
  const liveEl = $('cmp-live');
  function showVeil(S, text) { S.veil.hidden = !text; if (text) S.veil.firstElementChild.textContent = text; }
  let loadToken = 0, leftToken = 0, leftLoading = false;
  const failText = (e, fallback) => /429/.test(String(e && e.message)) ? 'Too many requests to the data service. Wait a minute, then try again.' : fallback;
  // Fills the left map for the current timeline position: archive day, the live reading, or a warming scenario
  async function resolveLeft() {
    const tok = ++leftToken, m = leftMode, k = REG.key;
    if (m === 'past') {
      showVeil(SA, 'Loading the past…'); leftLoading = true;
      try { const d = await loadPast(pastDate); if (tok === leftToken) leftLoading = false; if (tok !== leftToken || REG.key !== k) return false; d.kind = 'past'; SA.data = d; resetSide(SA); showVeil(SA, ''); return true; }
      catch (e) { if (tok !== leftToken) return false; leftLoading = false; SA.data = null; resetSide(SA); showVeil(SA, failText(e, 'That day could not be loaded. Try another date.')); return false; }
    }
    leftLoading = false;
    if (!SB.data) { SA.data = null; return false; }
    SA.data = m === 'live' ? Object.assign({}, SB.data, { kind: 'live', date: todayStr(), when: 'Same as now' }) : projData(SB.data, tlYear, scenario);
    resetSide(SA); showVeil(SA, ''); return true;
  }
  async function refreshLeft() { const ok = await resolveLeft(); fitRanges(); render(); return ok; }
  async function loadBoth() {
    const tok = ++loadToken, k = REG.key;
    liveEl.dataset.state = 'loading'; liveEl.textContent = 'Connecting to live data';
    showVeil(SB, 'Loading live data…'); showVeil(SA, leftMode === 'past' ? 'Loading the past…' : '');
    SIDES.forEach(S => { S.data = null; resetSide(S); }); renderReadouts();
    const presentP = (async () => { try { const d = await loadPresent(); if (tok !== loadToken || REG.key !== k) return false; SB.data = d; resetSide(SB); showVeil(SB, ''); return true; } catch (e) { if (tok === loadToken) { SB.data = null; showVeil(SB, failText(e, 'Live data unavailable')); } return false; } })();
    let b;
    if (leftMode === 'past') [b] = await Promise.all([presentP, resolveLeft()]); else { b = await presentP; await resolveLeft(); }
    if (tok !== loadToken) return;
    liveEl.dataset.state = b ? 'live' : 'error'; liveEl.textContent = b ? `Live · ${SB.data.when.replace('Live · ', '')}` : 'Live data unavailable';
    if (!mask) buildMask();
    fitRanges(); SIDES.forEach(S => { if (S.map) sizeFx(S); }); render();
  }

  // ─── Controls ───
  const HINT = 'Drag the timeline: the left map shows that year on the same day and hour (1980 on); this year is live; later years add an IPCC warming scenario to today’s reading, for temperature only. Play steps by decades. PM2.5 records start in September 2022.';
  const slider = $('ts-tl-slider'), yearEl = $('ts-tl-year'), fillEl = $('ts-tl-fill'), playBtn = $('ts-tl-play'), scenEl = $('ts-scen');
  const PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#F2F2F2" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
  const PAUSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#F2F2F2" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>';
  const pctOf = y => (y - YMIN) / (YMAX - YMIN) * 100;
  $('ts-tl-now').style.left = pctOf(NOW_YEAR) + '%'; $('ts-tl-livemark').style.left = pctOf(NOW_YEAR) + '%'; $('ts-tl-rec').style.width = pctOf(NOW_YEAR) + '%';
  playBtn.innerHTML = PLAY;
  function paintTimeline() {
    yearEl.textContent = tlYear; slider.value = tlYear; fillEl.style.width = pctOf(tlYear) + '%';
    scenEl.classList.toggle('off', leftMode !== 'proj');
    scenEl.querySelectorAll('[data-scen]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scen === scenario)));
    document.querySelectorAll('.cmp-chip').forEach(c => c.setAttribute('aria-pressed', String(leftMode === 'past' && yearsAgo(+c.dataset.ago) === pastDate)));
    if (leftMode === 'past') $('cmp-date').value = pastDate;
    $('cmp-hint').textContent = HINT;
  }
  function dateForYear(y) { const mo = +mmdd.slice(0, 2) - 1, d = new Date(Date.UTC(y, mo, +mmdd.slice(3))); return d.getUTCMonth() !== mo ? `${y}-02-28` : isoDate(d); }
  let tlTimer = 0;
  function setYear(y, immediate) {
    tlYear = Math.max(YMIN, Math.min(YMAX, y));
    if (tlYear < NOW_YEAR) { leftMode = 'past'; pastDate = dateForYear(tlYear); } else leftMode = tlYear === NOW_YEAR ? 'live' : 'proj';
    paintTimeline(); clearTimeout(tlTimer);
    if (!started) return Promise.resolve();
    if (immediate) return refreshLeft();
    tlTimer = setTimeout(refreshLeft, 280); return Promise.resolve();       // wait for the slider to settle before fetching a new year
  }
  slider.addEventListener('input', () => setYear(+slider.value));
  slider.addEventListener('change', () => setYear(+slider.value, true));
  scenEl.addEventListener('click', e => { const b = e.target.closest('[data-scen]'); if (!b) return; scenario = b.dataset.scen; paintTimeline(); if (leftMode === 'proj') refreshLeft(); });
  async function playLoop() {
    while (playing) {
      await new Promise(r => setTimeout(r, reduce ? 1200 : 900)); if (!playing) break;
      await setYear(tlYear + 10 > YMAX ? YMIN : tlYear + 10, true);
    }
  }
  playBtn.addEventListener('click', () => {
    playing = !playing; playBtn.innerHTML = playing ? PAUSE : PLAY; playBtn.setAttribute('aria-pressed', String(playing)); playBtn.setAttribute('aria-label', playing ? 'Pause timeline' : 'Play timeline');
    if (playing) playLoop();
  });

  function setPastDate(d) {
    if (!d || d > maxPast() || d < '1980-01-01') { $('cmp-hint').textContent = `Choose a day between 1 Jan 1980 and ${pretty(maxPast())}.`; return; }
    pastDate = d; mmdd = d.slice(5); leftMode = 'past'; tlYear = +d.slice(0, 4); paintTimeline();
    if (started) refreshLeft();
  }
  $('cmp-date').max = maxPast();
  document.querySelectorAll('.cmp-chip').forEach(c => c.addEventListener('click', () => setPastDate(yearsAgo(+c.dataset.ago))));
  $('cmp-date').addEventListener('change', e => setPastDate(e.target.value));

  document.querySelectorAll('[data-region]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.region; if (REG.key === k) return;
    setRegionData(k); document.querySelectorAll('[data-region]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('cmp-region-label').textContent = REG.strip; hover = null;
    SIDES.forEach(S => { if (S.field) { S.map.removeLayer(S.field); S.field = null; } S.cut.setLatLngs(OUTLINE); S.map.setMinZoom(REG.minZoom); S.data = null; resetSide(S); S.fx.setTransform(1, 0, 0, 1, 0, 0); S.fx.clearRect(0, 0, S.fxCv.width, S.fxCv.height); });
    if (SA.map) fitRegion();
    loadBoth();
  }));
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.mode; if (m === mode) return; mode = m;
    document.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    $('cmp-split').hidden = m !== 'split'; $('cmp-all').hidden = m !== 'all';
    $('cmp-menu').style.display = m === 'all' ? 'none' : ''; document.querySelector('[aria-label="Basemap"]').style.display = m === 'all' ? 'none' : '';
    if (m === 'split') { SIDES.forEach(S => { if (S.map) { S.map.invalidateSize(); sizeFx(S); } }); render(); }
    else { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } renderAll(); }
  }));

  // ─── Reveal + start ───
  const rv = document.querySelectorAll('.cmp-reveal');
  if ('IntersectionObserver' in window && !reduce) { const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 }); rv.forEach(el => io.observe(el)); }
  else rv.forEach(el => el.classList.add('in'));

  let started = false;
  function start() {
    if (started) return; started = true;
    basemap = 'day';   // always open on the day basemap; Night stays one click away
    initMaps();
    setTimeout(() => { NA = makeNoise(7, 6); NB = makeNoise(19, 5); loadBoth(); }, 30);
  }
  buildAllGrid(); setPastDate(pastDate); renderMenu(); renderLegend();
  const grid = $('cmp-grid');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { start(); io.disconnect(); } }, { rootMargin: '600px 0px' }).observe(grid);
    new IntersectionObserver(es => { onScreen = es[0].isIntersecting; kick(); }).observe(grid);
  } else { onScreen = true; start(); }
  window.addEventListener('resize', () => { if (!started || mode !== 'split') return; SIDES.forEach(S => { S.map.invalidateSize(); sizeFx(S); S.tctx.clearRect(0, 0, S.W, S.H); }); kick(); });
})();
