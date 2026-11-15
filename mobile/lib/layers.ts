/**
 * Map layers, ramps and scenario tables — copied from Simulate.dc.html / Compare.dc.html
 * (ramps are identical to js/compare.js on the site). AR6 numbers are IPCC AR6 WGI Table SPM.1 central estimates.
 */
export type Stop = [number, [number, number, number]];

export type SimLayer = {
  key: 'air' | 'surf' | 'rain' | 'rh' | 'wind' | 'pm25';
  /** Simulate.dc.html label */
  label: string;
  /** Compare.dc.html label */
  cmpLabel: string;
  short: string;
  unit: string;
  dec: number;
  lo: number;
  hi: number;
  /** system id used for the "System" block on Simulate */
  sys: 'temp' | 'precip' | 'atmos' | 'chem';
  /** variable name highlighted in the system block */
  tag: string;
  stops: Stop[];
  /** Compare: [positive change, negative change] */
  word: [string, string];
  /** key in /api/site/sim/record (annual series), if any */
  record?: 'air' | 'rain' | 'rh' | 'wind';
};

const WARM: Stop[] = [
  [0, [24, 40, 90]],
  [0.3, [91, 140, 255]],
  [0.55, [127, 224, 240]],
  [0.8, [224, 144, 90]],
  [1, [244, 194, 124]],
];

export const LAYERS: SimLayer[] = [
  { key: 'air', label: 'Air temperature', cmpLabel: 'Air temperature', short: 'Air temp', unit: '°C', dec: 1, lo: 14, hi: 38, sys: 'temp', tag: 'Air temperature', stops: WARM, word: ['warmer', 'cooler'], record: 'air' },
  { key: 'surf', label: 'Ground surface temperature', cmpLabel: 'Ground temperature', short: 'Ground temp', unit: '°C', dec: 1, lo: 14, hi: 46, sys: 'temp', tag: 'Land surface temperature', stops: [[0, [40, 30, 70]], [0.35, [154, 134, 184]], [0.7, [224, 144, 90]], [1, [250, 214, 150]]], word: ['warmer', 'cooler'] },
  { key: 'rain', label: 'Rainfall · last 30 days', cmpLabel: 'Rainfall · 30 days', short: 'Rainfall', unit: 'mm', dec: 0, lo: 0, hi: 300, sys: 'precip', tag: 'Rainfall', stops: [[0, [10, 14, 30]], [0.25, [47, 107, 255]], [0.65, [127, 224, 240]], [1, [230, 250, 255]]], word: ['wetter', 'drier'], record: 'rain' },
  { key: 'rh', label: 'Relative humidity', cmpLabel: 'Relative humidity', short: 'Humidity', unit: '%', dec: 0, lo: 20, hi: 100, sys: 'atmos', tag: 'Relative humidity', stops: [[0, [40, 30, 60]], [0.5, [95, 196, 216]], [1, [200, 214, 255]]], word: ['more humid', 'drier'], record: 'rh' },
  { key: 'wind', label: 'Wind speed', cmpLabel: 'Wind speed', short: 'Wind', unit: 'm/s', dec: 1, lo: 0, hi: 9, sys: 'atmos', tag: 'Wind speed & direction', stops: [[0, [60, 70, 140]], [0.4, [127, 224, 240]], [0.75, [200, 240, 255]], [1, [255, 255, 255]]], word: ['windier', 'calmer'], record: 'wind' },
  { key: 'pm25', label: 'PM2.5 air pollution', cmpLabel: 'PM2.5 air pollution', short: 'PM2.5', unit: 'µg/m³', dec: 0, lo: 0, hi: 100, sys: 'chem', tag: 'PM2.5 Particulate', stops: [[0, [20, 40, 60]], [0.25, [95, 196, 216]], [0.55, [154, 134, 184]], [0.8, [224, 144, 90]], [1, [244, 120, 90]]], word: ['more polluted', 'cleaner'] },
];

export const layerByKey = (k: string | undefined) => LAYERS.find((l) => l.key === k) ?? LAYERS[0];

export const isTempLayer = (l: SimLayer) => l.sys === 'temp';

/** Interpolated colour on a ramp, as an `rgb()` string. */
export function rampRgb(t: number, st: Stop[]): string {
  const c = Math.max(0, Math.min(1, t));
  for (let i = 1; i < st.length; i++) {
    if (c <= st[i][0]) {
      const a = st[i - 1];
      const b = st[i];
      const k = (c - a[0]) / (b[0] - a[0] || 1);
      const rgb = a[1].map((v, j) => Math.round(v + (b[1][j] - v) * k));
      return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    }
  }
  const e = st[st.length - 1][1];
  return `rgb(${e[0]},${e[1]},${e[2]})`;
}

/** Value → colour on the layer's fixed domain (same scale on every map). */
export function layerColor(v: number | null | undefined, l: SimLayer): string {
  if (v == null || !Number.isFinite(v)) return 'rgba(255,255,255,0.08)';
  return rampRgb((v - l.lo) / (l.hi - l.lo), l.stops);
}

/** Ramp stops as gradient props for expo-linear-gradient. */
export function rampGradient(st: Stop[]) {
  return {
    colors: st.map((s) => `rgb(${s[1].join(',')})`) as unknown as readonly [string, string, ...string[]],
    locations: st.map((s) => s[0]) as unknown as readonly [number, number, ...number[]],
  };
}

export const AR6: Record<string, [number, number][]> = {
  ssp126: [[2020.5, 1.2], [2030, 1.5], [2050, 1.7], [2090, 1.8], [2100, 1.825]],
  ssp245: [[2020.5, 1.2], [2030, 1.5], [2050, 2.0], [2090, 2.7], [2100, 2.875]],
  ssp585: [[2020.5, 1.2], [2030, 1.6], [2050, 2.4], [2090, 4.4], [2100, 4.9]],
};

export const SCEN: { id: 'ssp126' | 'ssp245' | 'ssp585'; label: string; code: string }[] = [
  { id: 'ssp126', label: 'Low emissions', code: 'SSP1-2.6' },
  { id: 'ssp245', label: 'Middle road', code: 'SSP2-4.5' },
  { id: 'ssp585', label: 'High emissions', code: 'SSP5-8.5' },
];

export function interp(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const a = pts[i - 1];
      const b = pts[i];
      return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    }
  }
  return pts[pts.length - 1][1];
}

/** Display formatting: fixed decimals; null → "No record". */
export function fmtVal(v: number | null | undefined, dec: number): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function signed(x: number, dec: number): string {
  const r = Number(Math.abs(x).toFixed(dec));
  const sign = r === 0 ? '±' : x > 0 ? '+' : '−';
  return `${sign}${r.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}
