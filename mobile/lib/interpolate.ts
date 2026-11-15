/**
 * Catmull–Rom bicubic field + colour-range fit — port of js/simulation.js gridAt/buildRaster/fitRanges.
 */
import { GRID, type Region } from '@/lib/geo';
import type { SimLayer, Stop } from '@/lib/layers';
import { BOUNDS } from '@/lib/regions';

export const RASTER = {
  ka: { rw: 100, rh: 150 }, // half of web 200×300 — Expo perf
  blr: { rw: 110, rh: 121 },
} as const;

const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));

function idw(vals: (number | null)[], region: Region, lat: number, lon: number): number {
  const g = GRID[region];
  const rows = g.rows;
  const cols = g.cols;
  let s = 0;
  let w = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const v = vals[i * cols + j];
      if (v == null || !Number.isFinite(v)) continue;
      const la = g.s + (i * (g.n - g.s)) / (rows - 1);
      const lo = g.w + (j * (g.e - g.w)) / (cols - 1);
      const dy = la - lat;
      const dx = (lo - lon) * 0.97;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1e-6) return v;
      const k = 1 / (d2 * Math.sqrt(d2));
      s += v * k;
      w += k;
    }
  }
  return w ? s / w : NaN;
}

/** Sample grid values at lat/lon (grid cells only — ignore trailing Bengaluru point). */
export function gridAt(vals: (number | null)[], region: Region, lat: number, lon: number): number {
  const g = GRID[region];
  const GR = g.rows;
  const GC = g.cols;
  const di = (g.n - g.s) / (GR - 1);
  const dj = (g.e - g.w) / (GC - 1);
  const gi = (lat - g.s) / di;
  const gj = (lon - g.w) / dj;
  const i1 = Math.max(0, Math.min(GR - 2, Math.floor(gi)));
  const j1 = Math.max(0, Math.min(GC - 2, Math.floor(gj)));
  const ti = Math.max(0, Math.min(1, gi - i1));
  const tj = Math.max(0, Math.min(1, gj - j1));
  const get = (i: number, j: number) =>
    vals[Math.max(0, Math.min(GR - 1, i)) * GC + Math.max(0, Math.min(GC - 1, j))];
  const rows: number[] = [];
  for (let d = -1; d <= 2; d++) {
    const a = get(i1 + d, j1 - 1);
    const b = get(i1 + d, j1);
    const c = get(i1 + d, j1 + 1);
    const d2 = get(i1 + d, j1 + 2);
    if (a == null || b == null || c == null || d2 == null) return idw(vals, region, lat, lon);
    rows.push(cr(a, b, c, d2, tj));
  }
  return cr(rows[0], rows[1], rows[2], rows[3], ti);
}

export function latLonFromFrame(
  region: Region,
  frame: { proj: { ax: number; bx: number; ay: number; by: number } },
  x: number,
  y: number,
): { lat: number; lon: number } {
  const lon = (x - frame.proj.bx) / frame.proj.ax;
  const lat = (y - frame.proj.by) / frame.proj.ay;
  return { lat, lon };
}

export function inBounds(region: Region, lat: number, lon: number): boolean {
  const b = BOUNDS[region];
  return lat >= b.s && lat <= b.n && lon >= b.w && lon <= b.e;
}

/** Even-odd point-in-polygon (ring = [lon, lat][] or [lat, lon][] — detected). */
function inPoly(lat: number, lon: number, ring: number[][]): boolean {
  if (ring.length < 3) return true;
  // geojson is [lon, lat]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const outlineCache: Partial<Record<Region, number[][]>> = {};

export function setOutline(region: Region, ring: number[][]) {
  outlineCache[region] = ring;
}

/** Dense Float32Array raster (NaN = outside / missing), row-major. */
export function buildRaster(
  vals: (number | null)[],
  region: Region,
  shift = 0,
  scale = 1,
): { data: Float32Array; rw: number; rh: number } {
  const { rw, rh } = RASTER[region];
  const b = BOUNDS[region];
  const out = new Float32Array(rw * rh);
  out.fill(NaN);
  const grid = vals.slice(0, GRID[region].rows * GRID[region].cols);
  if (!grid.some((v) => v != null && Number.isFinite(v))) return { data: out, rw, rh };
  const ring = outlineCache[region]; // set via setOutline / lib/outlines.ensureOutlines()
  for (let r = 0; r < rh; r++) {
    const lat = b.n - ((r + 0.5) / rh) * (b.n - b.s);
    for (let c = 0; c < rw; c++) {
      const lon = b.w + ((c + 0.5) / rw) * (b.e - b.w);
      if (ring && !inPoly(lat, lon, ring)) continue;
      const v = gridAt(grid, region, lat, lon);
      if (Number.isFinite(v)) out[r * rw + c] = v * scale + shift;
    }
  }
  return { data: out, rw, rh };
}

export function fitRange(
  layer: SimLayer,
  values: (number | null)[],
  extraPad = 0,
): { lo: number; hi: number } {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length < 4) return { lo: layer.lo, hi: layer.hi };
  const mn = Math.min(...nums);
  const mx = Math.max(...nums);
  const pad = (mx - mn) * 0.1 || 1;
  const step = layer.dec ? 1 : mx - mn > 50 ? 10 : 5;
  let lo = Math.floor((mn - pad) / step) * step;
  let hi = Math.ceil((mx + pad + extraPad) / step) * step;
  if (layer.key === 'rain' || layer.key === 'pm25' || layer.key === 'wind') lo = Math.max(0, lo);
  if (layer.key === 'rh') hi = Math.min(100, hi);
  return { lo, hi };
}

export function niceStep(lo: number, hi: number): number {
  const span = hi - lo;
  if (span <= 6) return 0.5;
  if (span <= 14) return 1;
  return 2;
}

export function rampRgba(t: number, stops: Stop[], alpha = 255): number {
  const c = Math.max(0, Math.min(1, t));
  let rgb = stops[stops.length - 1][1];
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const k = (c - a[0]) / (b[0] - a[0] || 1);
      rgb = a[1].map((v, j) => Math.round(v + (b[1][j] - v) * k)) as [number, number, number];
      break;
    }
  }
  const [r, g, b] = rgb;
  return ((alpha & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

/** Pack RGBA pixels for Skia Image (little-endian Uint32 → Uint8Array). */
export function rasterToPixels(
  data: Float32Array,
  rw: number,
  rh: number,
  lo: number,
  hi: number,
  stops: Stop[],
  fieldOpacity: number,
): Uint8Array {
  const pixels = new Uint8Array(rw * rh * 4);
  const span = hi - lo || 1;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    const o = i * 4;
    if (!Number.isFinite(v)) {
      pixels[o + 3] = 0;
      continue;
    }
    const t = (v - lo) / span;
    const rgba = rampRgba(t, stops, Math.round(255 * fieldOpacity));
    pixels[o] = rgba & 255;
    pixels[o + 1] = (rgba >> 8) & 255;
    pixels[o + 2] = (rgba >> 16) & 255;
    pixels[o + 3] = (rgba >> 24) & 255;
  }
  return pixels;
}

export const FIELD_OPACITY: Record<SimLayer['key'], number> = {
  air: 0.48,
  surf: 0, // dots only
  rain: 0.34,
  rh: 0.22,
  wind: 0.14,
  pm25: 0.28,
};

export const FX_NOTE: Record<SimLayer['key'], (step?: number) => string> = {
  air: () => 'Colour: live air temperature · tap any point to read',
  surf: () => 'Dot size and colour: ground temperature',
  rain: () => 'Clouds: live cover now, darker where the last 30 days were wettest',
  rh: () => 'Mist thickens as humidity rises',
  wind: () => 'Streaks flow with the live wind, coloured by speed',
  pm25: () => 'Haze and particles thicken with PM2.5, drifting on the wind',
};

/** @deprecated Prefer Google satellite mosaic via lib/googleBasemap — kept for any single-URL callers. */
export function basemapUrl(region: Region, mode: 'day' | 'night'): string {
  const b = BOUNDS[region];
  const lat = (b.s + b.n) / 2;
  const lon = (b.w + b.e) / 2;
  const zoom = region === 'ka' ? 7 : 12;
  // Google Maps Static-style satellite center (tile mosaic is used in LiveHeatMap).
  void mode;
  return `https://mt0.google.com/vt/lyrs=s&hl=en&x=${Math.floor(((lon + 180) / 360) * 2 ** zoom)}&y=${Math.floor(
    ((1 -
      Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) /
      2) *
      2 ** zoom,
  )}&z=${zoom}`;
}
