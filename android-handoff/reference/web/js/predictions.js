/* Future predictions page.
 * Everything in the forecast chart, the headline numbers and the "how far ahead" table is OUTPUT OF THE BHUVYOM PREDICTION ENGINE
 * (aspect2729/bhuvyom, backend/engines/prediction), read from data/prediction/engine-results.js.
 * Two things are NOT engine output and are labelled as such on the page:
 *   - "Actual 2026" dots: Open-Meteo ERA5 archive, fetched live, used only to check the forecast.
 *   - Scenario table: IPCC AR6 WGI Table SPM.1 central warming estimates added to the observed 2022–2025 mean.
 */
(function () {
  'use strict';
  const D = window.BHUVYOM_PREDICTION;
  const $ = id => document.getElementById(id);
  if (!D) { $('pp-check').textContent = 'The engine results file (data/prediction/engine-results.js) did not load, so there is nothing to show.'; return; }
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── What each tab means ───
  const VARS = {
    air:  { code: 'T2M',         label: 'Air temperature', unit: '°C', dec: 1, sum: false },
    rain: { code: 'PRECTOTCORR', label: 'Rainfall',        unit: 'mm', dec: 0, sum: true }   // engine gives mm/day; shown as mm per month
  };
  const MODEL_NAME = { climatology: 'Monthly average', seasonal_naive: 'Same month last year', damped_persistence: 'Damped persistence', clim_trend: 'Average + trend', ridge_pooled: 'Ridge regression', gbm_pooled: 'Gradient boosting' };
  const MODEL_WHAT = {
    climatology: 'the long-term average for that calendar month',
    seasonal_naive: 'the value from the same month a year earlier',
    damped_persistence: 'recent anomalies that fade out toward the average',
    clim_trend: 'the monthly average plus a linear trend',
    ridge_pooled: 'a regularised linear model trained across all 25 cells',
    gbm_pooled: 'gradient-boosted trees trained across all 25 cells'
  };
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const TOWNS = [['Bengaluru',12.97,77.59],['Mysuru',12.30,76.64],['Mandya',12.52,76.90],['Tumakuru',13.34,77.10],['Kolar',13.14,78.13],['Hassan',13.00,76.10],
                 ['Chikkaballapura',13.43,77.73],['Ramanagara',12.72,77.28],['Chitradurga',14.23,76.40],['Hosur',12.74,77.83],['Chamarajanagar',11.92,76.94],['Madikeri',12.42,75.74]];
  // IPCC AR6 WGI SPM Table SPM.1 — global warming vs 1850–1900, central (°C); 2100 extends the 2050→2090 slope
  const AR6 = { ssp126: [[2020.5,1.2],[2030,1.5],[2050,1.7],[2090,1.8],[2100,1.825]],
                ssp245: [[2020.5,1.2],[2030,1.5],[2050,2.0],[2090,2.7],[2100,2.875]],
                ssp585: [[2020.5,1.2],[2030,1.6],[2050,2.4],[2090,4.4],[2100,4.9]] };
  const SCEN = [['ssp126', 'Low emissions', 'SSP1-2.6'], ['ssp245', 'Middle road', 'SSP2-4.5'], ['ssp585', 'High emissions', 'SSP5-8.5']];
  const interp = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i-1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return pts[pts.length - 1][1]; };

  // ─── Helpers ───
  const num = (x, d) => x.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = (x, V) => x == null ? '—' : num(x, V.dec) + ' ' + V.unit;
  const sgn = (x, V) => { const r = +Math.abs(x).toFixed(V.dec); return (r === 0 ? '±' : x > 0 ? '+' : '−') + num(r, V.dec) + ' ' + V.unit; };
  const daysIn = key => new Date(+key.slice(0, 4), +key.slice(5), 0).getDate();
  const monthLabel = key => MONTHS[+key.slice(5) - 1] + ' ' + key.slice(0, 4);
  const nowKey = (() => { const d = new Date(Date.now() + 5.5 * 3600e3); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); })();
  const nextKey = (() => { const d = new Date(Date.now() + 5.5 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); })();
  const cellsOf = P => P.cells;
  const idxOf = (P, id) => P.cells.findIndex(c => c.id === id);

  // ─── State ───
  const baseCells = cellsOf(D.vars.T2M);
  const state = { v: 'air', id: (baseCells.find(c => c.city) || baseCells[0]).id };
  const era = {};     // `${code}|${id}` -> { 'YYYY-MM': value in display units } for completed 2026 months

  // ─── Place picker ───
  function placeName(c) {
    const inside = TOWNS.filter(t => Math.abs(t[1] - c.lat) <= 0.25 && Math.abs(t[2] - c.lon) <= 0.3125).map(t => t[0]);
    return (inside.length ? inside.slice(0, 2).join(' · ') : 'Open country') + ' — ' + c.lat.toFixed(1) + '° N, ' + c.lon.toFixed(2) + '° E';
  }
  const sel = $('pp-cell');
  sel.innerHTML = baseCells.slice().sort((a, b) => b.lat - a.lat || a.lon - b.lon).map(c => `<option value="${c.id}"${c.id === state.id ? ' selected' : ''}>${placeName(c)}</option>`).join('');
  sel.addEventListener('change', () => { state.id = sel.value; render(); loadEra(); });
  document.querySelectorAll('.pp-tab').forEach(b => b.addEventListener('click', () => {
    state.v = b.dataset.var;
    document.querySelectorAll('.pp-tab').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    render(); loadEra();
  }));

  // ─── Series for the current tab and place, in display units ───
  function series() {
    const V = VARS[state.v], P = D.vars[V.code], ci = idxOf(P, state.id), n = P.times.length;
    const get = k => P.times.map((t, i) => { const x = P.f[k][ci][i]; return x == null ? null : x * (V.sum ? daysIn(t) : 1); });
    return { V, P, ci, n, obs: get('observed'), fc: get('forecast'), l80: get('pi80_low'), h80: get('pi80_high'), l95: get('pi95_low'), h95: get('pi95_high'), cl: get('climatology') };
  }
  const firstFc = S => S.fc.findIndex(x => x != null);

  // ─── 1 · Headline numbers ───
  function renderHero(S) {
    const { V, P } = S, ff = firstFc(S);
    let i = P.times.indexOf(nextKey); if (i < 0 || S.fc[i] == null) i = S.n - 1;
    const key = P.times[i], ahead = (+key.slice(0, 4) - +P.origin.slice(0, 4)) * 12 + (+key.slice(5) - +P.origin.slice(5));
    $('pp-k1').textContent = `${i === P.times.indexOf(nextKey) ? 'Next month' : 'Latest forecast month'} · ${monthLabel(key)}`;
    $('pp-v1').innerHTML = num(S.fc[i], V.dec) + `<small>${V.unit}</small>`;
    const hz = Math.max(1, Math.min(12, ahead)), skill = P.skill_by_h[hz];
    $('pp-s1').innerHTML = `<b>80 % range</b>${num(S.l80[i], V.dec)}–${num(S.h80[i], V.dec)} ${V.unit} · 95 % range ${num(S.l95[i], V.dec)}–${num(S.h95[i], V.dec)} ${V.unit}.<br>` +
      (skill > 0.02 ? `${ahead} months after the forecast starts (${monthLabel(P.origin)}); the model beats the average by ${Math.round(skill * 100)} % at this distance.`
                    : `${ahead} months after the forecast starts (${monthLabel(P.origin)}). At this distance the engine falls back to the monthly average.`);
    // whole forecast year
    const idx = S.fc.map((x, j) => x == null ? -1 : j).filter(j => j >= 0), yr = P.times[idx[0]].slice(0, 4);
    const agg = a => idx.reduce((s, j) => s + a[j], 0) / (V.sum ? 1 : idx.length);
    const fcY = agg(S.fc), clY = agg(S.cl);
    $('pp-k2').textContent = `All of ${yr}`;
    $('pp-v2').innerHTML = num(fcY, V.dec) + `<small>${V.unit}${V.sum ? ' total' : ' mean'}</small>`;
    $('pp-s2').innerHTML = `<b>${sgn(fcY - clY, V)}</b>vs the 1981–2025 average for these months (${num(clY, V.dec)} ${V.unit}). ${V.sum ? 'Sum' : 'Average'} of the 12 monthly forecasts.`;
    // typical error
    const mae = +P.mae_by_h['1'] * (V.sum ? 30.4 : 1);
    $('pp-k3').textContent = 'Typical miss, 1 month ahead';
    $('pp-v3').innerHTML = '±' + num(mae, V.dec) + `<small>${V.unit}</small>`;
    $('pp-s3').innerHTML = `Average error on months the engine had never seen (2018–2024), across all 25 cells. The 80 % range held ${Math.round(P.cov80_by_h['1'] * 100)} % of the time.`;
  }

  // ─── 2 · Chart ───
  const chartEl = $('pp-chart'), tipEl = $('pp-tip');
  chartEl.innerHTML = ''; const box = document.createElement('div'); chartEl.append(box, tipEl);
  function niceTicks(lo, hi, want) {
    const raw = (hi - lo) / want, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
    const t = []; for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.999; v += step) t.push(+v.toFixed(6));
    return t;
  }
  function drawChart(S) {
    const { V, P, n } = S, eraMap = era[V.code + '|' + state.id] || {};
    const W = Math.max(320, Math.round(chartEl.clientWidth)), H = W < 620 ? 300 : 420, m = { l: W < 620 ? 44 : 60, r: 18, t: 28, b: 38 };
    const eraVals = P.times.map(t => eraMap[t] == null ? null : eraMap[t]);
    const all = [S.obs, S.l95, S.h95, S.fc, S.cl, eraVals].flat().filter(x => x != null);
    let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || 1; if (V.sum) lo = Math.max(0, lo - pad); else lo -= pad; hi += pad;
    const ticks = niceTicks(lo, hi, 5), y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const x = i => m.l + (W - m.l - m.r) * i / (n - 1), y = v => m.t + (H - m.t - m.b) * (1 - (v - y0) / (y1 - y0));
    const line = a => { let d = '', pen = false; a.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); pen = true; }); return d; };
    const band = (l, h) => { const ix = h.map((v, i) => v == null || l[i] == null ? -1 : i).filter(i => i >= 0); if (!ix.length) return ''; return 'M' + ix.map(i => x(i).toFixed(1) + ' ' + y(h[i]).toFixed(1)).join('L') + 'L' + ix.slice().reverse().map(i => x(i).toFixed(1) + ' ' + y(l[i]).toFixed(1)).join('L') + 'Z'; };
    const ff = firstFc(S), nowI = P.times.indexOf(nowKey);
    let g = '';
    ticks.forEach(t => { g += `<line class="ax" x1="${m.l}" x2="${W - m.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text x="${m.l - 10}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${num(t, V.dec === 0 || t % 1 === 0 ? 0 : 1)}</text>`; });
    P.times.forEach((t, i) => { if (t.endsWith('-01')) g += `<line class="ax" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${m.t}" y2="${H - m.b}"/><text x="${x(i).toFixed(1)}" y="${H - 12}" text-anchor="start" dx="4">${t.slice(0, 4)}</text>`; });
    g += `<text x="${m.l}" y="14" text-anchor="start">${V.unit}${V.sum ? ' PER MONTH' : ''}</text>`;
    if (ff > 0) g += `<line x1="${x(ff).toFixed(1)}" x2="${x(ff).toFixed(1)}" y1="${m.t}" y2="${H - m.b}" stroke="#7FE0F0" stroke-opacity=".5" stroke-dasharray="3 4"/><text x="${(x(ff) + 8).toFixed(1)}" y="${m.t - 10}" style="fill:#7FE0F0">FORECAST →</text>`;
    if (nowI > 0) g += `<line x1="${x(nowI).toFixed(1)}" x2="${x(nowI).toFixed(1)}" y1="${m.t}" y2="${H - m.b}" stroke="#E9A15A" stroke-opacity=".7"/><text x="${x(nowI).toFixed(1)}" y="${H - m.b + 14}" text-anchor="middle" style="fill:#E9A15A" dy="-3">NOW</text>`;
    g += `<path d="${band(S.l95, S.h95)}" fill="#7FE0F0" fill-opacity=".12"/><path d="${band(S.l80, S.h80)}" fill="#7FE0F0" fill-opacity=".26"/>`;
    g += `<path d="${line(S.cl)}" fill="none" stroke="#8A8A92" stroke-width="1.5" stroke-dasharray="5 4"/>`;
    g += `<path d="${line(S.obs)}" fill="none" stroke="#F2F2F2" stroke-width="1.8" stroke-linejoin="round"/>`;
    g += `<path d="${line(S.fc)}" fill="none" stroke="#7FE0F0" stroke-width="2.2" stroke-linejoin="round"/>`;
    S.fc.forEach((v, i) => { if (v != null) g += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="#7FE0F0"/>`; });
    eraVals.forEach((v, i) => { if (v != null) g += `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4.5" fill="#E9A15A" stroke="#000" stroke-width="1.5"/>`; });
    g += `<line id="pp-guide" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="#F2F2F2" stroke-opacity=".35" style="display:none"/>`;
    g += `<rect id="pp-hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/>`;
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${g}</svg>`;
    chartEl.setAttribute('aria-label', `${V.label} at ${placeName(P.cells[S.ci]).split(' — ')[0]}: observed 2022–2025, engine forecast for ${P.times[ff].slice(0, 4)}, ranging ${fmt(Math.min(...S.fc.filter(v => v != null)), V)} to ${fmt(Math.max(...S.fc.filter(v => v != null)), V)}.`);
    const hit = $('pp-hit'), guide = $('pp-guide');
    hit.addEventListener('mousemove', e => {
      const r = box.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (W - m.l - m.r) * (n - 1))));
      guide.style.display = ''; guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i));
      const t = P.times[i], rows = [];
      if (S.obs[i] != null) rows.push(`<em style="background:#F2F2F2"></em>Observed ${fmt(S.obs[i], V)}`);
      if (S.fc[i] != null) {
        rows.push(`<em style="background:#7FE0F0"></em>Forecast ${fmt(S.fc[i], V)}`, `80 % range ${num(S.l80[i], V.dec)}–${num(S.h80[i], V.dec)}`, `95 % range ${num(S.l95[i], V.dec)}–${num(S.h95[i], V.dec)}`);
        if (S.cl[i] != null) rows.push(`<em style="background:#8A8A92"></em>Average ${fmt(S.cl[i], V)}`);
      }
      if (eraMap[t] != null) rows.push(`<em style="background:#E9A15A"></em>Actual ${fmt(eraMap[t], V)}` + (S.fc[i] != null ? (eraMap[t] >= S.l80[i] && eraMap[t] <= S.h80[i] ? ' · inside 80 % range' : ' · outside 80 % range') : ''));
      tipEl.innerHTML = `<b>${monthLabel(t)}</b>` + rows.join('<br>');
      tipEl.style.display = 'block';
      const tw = tipEl.offsetWidth, left = x(i) * (r.width / W) + 14;
      tipEl.style.left = (left + tw > r.width ? left - tw - 28 : left) + 'px'; tipEl.style.top = '24px';
    });
    hit.addEventListener('mouseleave', () => { tipEl.style.display = 'none'; guide.style.display = 'none'; });
  }

  // ─── 2b · Reality check against what actually happened (ERA5) ───
  function renderCheck(S) {
    const { V, P } = S, m = era[V.code + '|' + state.id], el = $('pp-check');
    if (m === 'error') { el.innerHTML = '<b>Reality check unavailable</b> — the 2026 actuals could not be loaded (needs a connection to the Open-Meteo archive).'; return; }
    if (!m) { el.textContent = 'Loading what actually happened in 2026…'; return; }
    const keys = Object.keys(m).filter(k => { const i = P.times.indexOf(k); return i >= 0 && S.fc[i] != null; });
    if (!keys.length) { el.textContent = ''; return; }
    let inside = 0, diff = 0;
    keys.forEach(k => { const i = P.times.indexOf(k); if (m[k] >= S.l80[i] && m[k] <= S.h80[i]) inside++; diff += m[k] - S.fc[i]; });
    diff /= keys.length;
    el.innerHTML = `<b>Reality check, ${keys.length} finished months of ${keys[0].slice(0, 4)}:</b> ${inside} landed inside the engine’s 80 % range (the aim is 8 in 10). On average the real value ran ${sgn(diff, V)} ${diff >= 0 ? 'above' : 'below'} the forecast.`;
  }
  function loadEra() {
    const V = VARS[state.v], P = D.vars[V.code], c = P.cells[idxOf(P, state.id)], key = V.code + '|' + state.id;
    if (era[key]) { renderCheck(series()); drawChart(series()); return; }
    const cacheKey = 'bfo-pp-era5-v1-' + nowKey + '-' + state.id;
    const done = (res, id, code) => {
      Object.assign(era, { ['T2M|' + id]: res.air, ['PRECTOTCORR|' + id]: res.rain });
      if (state.id === id) { const S = series(); renderCheck(S); drawChart(S); }
    };
    const id = state.id, cached = sessionStorage.getItem(cacheKey);
    if (cached) { done(JSON.parse(cached), id); return; }
    const yr = nowKey.slice(0, 4), end = new Date(Date.now() + 5.5 * 3600e3 - 6 * 86400e3).toISOString().slice(0, 10);
    if (end < yr + '-01-31') { era[key] = {}; renderCheck(series()); return; }
    renderCheck(series());
    fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${c.lat}&longitude=${c.lon}&start_date=${yr}-01-01&end_date=${end}&daily=temperature_2m_mean,precipitation_sum&timezone=Asia%2FKolkata`)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(j => {
        const acc = {}; j.daily.time.forEach((t, i) => { const k = t.slice(0, 7); const a = acc[k] || (acc[k] = { n: 0, t: 0, p: 0 }); if (j.daily.temperature_2m_mean[i] != null && j.daily.precipitation_sum[i] != null) { a.n++; a.t += j.daily.temperature_2m_mean[i]; a.p += j.daily.precipitation_sum[i]; } });
        const res = { air: {}, rain: {} };
        Object.keys(acc).forEach(k => { if (acc[k].n === daysIn(k)) { res.air[k] = acc[k].t / acc[k].n; res.rain[k] = acc[k].p; } });   // finished months only
        try { sessionStorage.setItem(cacheKey, JSON.stringify(res)); } catch (e) {}
        done(res, id);
      })
      .catch(() => { era[V.code + '|' + id] = 'error'; if (state.id === id) renderCheck(series()); });
  }

  // ─── 3 · How far ahead ───
  function renderTrust(S) {
    const { V, P } = S, hs = Array.from({ length: 12 }, (_, i) => i + 1);
    const skilful = hs.filter(h => P.skill_by_h[h] > 0.02), maxSkill = Math.max(0.01, ...hs.map(h => P.skill_by_h[h]));
    const lastGood = skilful.length ? Math.max(...skilful) : 0;
    const h2 = document.querySelectorAll('.pp-two .pp-h2')[0];
    h2.textContent = lastGood ? `Better than the average for ${lastGood} month${lastGood > 1 ? 's' : ''}. After that, it’s the average.` : 'No better than the average at any distance.';
    $('pp-trust-text').innerHTML = P.findings.map(s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join(' ') + ' Ranges are built from the model’s own past misses on months it had not seen.';
    $('pp-hz').innerHTML = hs.map(h => {
      const sk = P.skill_by_h[h], w = sk > 0.02 ? Math.round(8 + sk / maxSkill * 112) : 4, mae = +P.mae_by_h[h] * (V.sum ? 30.4 : 1);
      return `<tr><td>${h}</td><td>${MODEL_NAME[P.model_by_h[h]] || P.model_by_h[h]}</td>` +
        `<td><div class="bar"><i class="${sk > 0.02 ? '' : 'none'}" style="width:${w}px"></i><span>${sk > 0.02 ? Math.round(sk * 100) + ' %' : '0 %'}</span></div></td>` +
        `<td class="dim">± ${num(mae, V.dec)} ${V.unit}</td><td class="dim">${Math.round(P.cov80_by_h[h] * 100)} %</td></tr>`;
    }).join('');
  }

  // ─── 4 · Beyond 12 months ───
  function renderScen(S) {
    const { V, P } = S, wrap = $('pp-scen-wrap'), flag = `<p class="pp-flag"><b>What the engine can add.</b> Its long-term branch (backend/engines/prediction/projections.py) summarises NASA NEX-GDDP-CMIP6 model runs, but that dataset has not been downloaded into this project yet, so it is not shown. Once it is, this section is replaced by the multi-model median and range.</p>`;
    if (state.v !== 'air') {
      $('pp-scen-h').textContent = 'No rainfall scenario here';
      $('pp-scen-text').textContent = 'Monsoon rainfall depends on regional circulation that a simple warming scale cannot capture, so this page does not invent a rainfall projection. Switch to air temperature for the warming scenarios.';
      wrap.innerHTML = flag; return;
    }
    $('pp-scen-h').textContent = 'Warming scenarios to 2100';
    $('pp-scen-text').textContent = 'These figures are not computed by the prediction engine. They add the IPCC’s published central estimates of global warming, for each emissions scenario, to the average of the last four observed years at this place.';
    const obs = S.obs.slice(0, 48).filter(v => v != null), base = obs.reduce((a, b) => a + b, 0) / obs.length, yrs = [2030, 2050, 2070, 2100];
    wrap.innerHTML = `<table class="pp-scen"><caption class="pp-sr">Estimated air temperature by scenario and year</caption><thead><tr><th scope="col">Scenario</th>${yrs.map(y => `<th scope="col">${y}</th>`).join('')}</tr></thead><tbody>` +
      SCEN.map(([k, name, code]) => `<tr><td>${name}<small>${code}</small></td>` + yrs.map(y => { const d = interp(AR6[k], y) - interp(AR6[k], 2023.5); return `<td><div class="v">${num(base + d, 1)}<small>+${num(d, 1)} °C</small></div></td>`; }).join('') + '</tr>').join('') +
      `</tbody></table><p class="pp-flag" style="margin-top:26px">Starting point: <b>${num(base, 1)} °C</b>, the NASA POWER average for 2022–2025. Annual means; one year can run well above or below.</p>` + flag;
  }

  // ─── 5 · How it works ───
  function renderHow(S) {
    const { V, P } = S, li = a => a.map(t => `<li>${t}</li>`).join('');
    const chosen = Array.from(new Set(Object.values(P.model_by_h)));
    $('pp-how').innerHTML =
      `<div><h3>The data</h3><ul>${li([
        '<b>NASA POWER monthly</b>, built on the MERRA-2 reanalysis.',
        `<b>${P.training}</b> used for training.`,
        `<b>${P.cells.length} cells</b> of 0.5° × 0.625° (about 55 km) over Bengaluru and its surroundings. One cell covers a whole city.`,
        `Forecast starts after <b>${monthLabel(P.origin)}</b>, the last month acquired.`])}</ul></div>` +
      `<div><h3>The models</h3><ul>${li([
        `Six candidates compete: ${P.candidates.map(c => MODEL_NAME[c] || c).join(', ')}.`,
        '<b>One is picked for each distance ahead</b>, judged only on 2011–2017.',
        `Scored on <b>${P.test}</b>, which the choice never saw. Picked here: ${chosen.map(c => `${MODEL_NAME[c]} (${MODEL_WHAT[c]})`).join('; ')}.`,
        'Ranges are the 10th–90th and 2.5th–97.5th percentiles of the chosen model’s past misses.'])}</ul></div>` +
      `<div><h3>What it can’t do</h3><ul>${li([P.uncertainty].concat(P.limitations).map(s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')))}</ul></div>`;
    $('pp-source').textContent = `Engine: aspect2729/bhuvyom · backend/engines/prediction · model version ${P.version} · results generated ${P.executed}. Method basis: ${P.basis}. Actual 2026 values: Open-Meteo archive (ERA5), fetched live. Scenario warming: IPCC AR6 WGI Table SPM.1, central estimates. NASA POWER and ERA5 are different reanalyses, so small offsets between them are expected.`;
  }

  // ─── The still Earth beside the intro follows the tab ───
  function syncEarth() {
    document.querySelectorAll('.pp-earth img').forEach(i => i.classList.toggle('on', i.dataset.earth === state.v));
    const cap = $('pp-earth-cap'); if (cap) cap.textContent = state.v === 'rain' ? 'With clouds · NASA Blue Marble cloud composite' : 'Clear sky · NASA Blue Marble';
  }

  // ─── Render ───
  function render() {
    syncEarth();
    const S = series();
    renderHero(S); drawChart(S); renderCheck(S); renderTrust(S); renderScen(S); renderHow(S);
    $('pp-h2').textContent = VARS[state.v].label + ': observed, then forecast';
    $('pp-chart-note').textContent = (S.V.sum ? 'Rainfall is shown as the total for each month (the engine works in mm per day, multiplied by the days in the month). ' : '') +
      `The engine forecasts from ${monthLabel(S.P.origin)}, so months through now can be checked against what actually happened. The grey dashed line is the 1981–2025 average for each month: where the forecast sits on it, the engine has nothing better to say.`;
  }
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => drawChart(series()), 120); });
  render(); loadEra();

  // ─── Scroll reveal ───
  const rv = document.querySelectorAll('.pp-reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12 });
    rv.forEach(el => io.observe(el));
  } else rv.forEach(el => el.classList.add('in'));
})();
