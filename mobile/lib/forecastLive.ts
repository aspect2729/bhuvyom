/**
 * Derivations from /api/prediction/forecast for one grid cell.
 * Everything here is arithmetic on API series (plus mm/day → mm/month for rain);
 * nothing is estimated or filled in.
 */
import type { ForecastResult } from '@/lib/api';

export type FutureMode = 'air' | 'rain';

export const MODEL_NAMES: Record<string, string> = {
  climatology: 'Monthly average',
  seasonal_naive: 'Same month last year',
  damped_persistence: 'Damped persistence',
  clim_trend: 'Average + trend',
  ridge_pooled: 'Ridge regression',
  gbm_pooled: 'Gradient boosting',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? ym} ${y}`;
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export type Series = (number | null)[];

export type Derived = {
  cellId: string;
  unit: string;
  digits: number;
  times: string[];
  forecast: Series;
  observed: Series;
  lo80: Series;
  hi80: Series;
  lo95: Series;
  hi95: Series;
  clim: Series;
  nowYm: string;
  startIdx: number; // first month with a forecast (-1 if none)
  lastObsIdx: number;
  nextIdx: number; // month shown as "next month" (-1 if none)
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function utcYm(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Returns null when the cell has no series in this response. */
export function derive(fc: ForecastResult, mode: FutureMode, cellId: string, now = new Date()): Derived | null {
  const f = fc.grid.fields;
  if (!f.forecast?.values?.[cellId]) return null;
  const times = fc.grid.times;
  const rain = mode === 'rain';
  const scale = (ym: string) => (rain ? daysInMonth(ym) : 1);
  const get = (name: string): Series =>
    times.map((t, i) => {
      const v = num(f[name]?.values?.[cellId]?.[i]);
      return v == null ? null : v * scale(t);
    });
  const forecast = get('forecast');
  const observed = get('observed');
  const nowYm = utcYm(now);
  const startIdx = forecast.findIndex((v) => v != null);
  let lastObsIdx = -1;
  observed.forEach((v, i) => {
    if (v != null) lastObsIdx = i;
  });
  // First forecast month that is still in the future, else first non-null forecast month.
  let nextIdx = times.findIndex((t, i) => t > nowYm && forecast[i] != null);
  if (nextIdx < 0) nextIdx = startIdx;
  return {
    cellId,
    unit: rain ? 'mm' : '°C',
    digits: rain ? 0 : 1,
    times,
    forecast,
    observed,
    lo80: get('pi80_low'),
    hi80: get('pi80_high'),
    lo95: get('pi95_low'),
    hi95: get('pi95_high'),
    clim: get('climatology'),
    nowYm,
    startIdx,
    lastObsIdx,
    nextIdx,
  };
}

/** Mean (air) or sum (rain) of the forecast months in a calendar year, vs climatology on the same months. */
export function yearSummary(d: Derived, mode: FutureMode, year: number) {
  const idx = d.times.map((t, i) => (t.startsWith(`${year}-`) && d.forecast[i] != null ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const agg = (s: Series, ids: number[]) => {
    const vals = ids.map((i) => s[i]).filter((v): v is number => v != null);
    if (vals.length !== ids.length || !vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return mode === 'rain' ? sum : sum / vals.length;
  };
  const value = agg(d.forecast, idx);
  const clim = agg(d.clim, idx);
  return { value, clim, n: idx.length };
}

export type HzLive = {
  h: number;
  model: string;
  skill: number | null;
  err: number | null;
  hit: number | null;
};

/** Per-horizon validation rows from the engine's out-of-sample backtest. */
export function horizonRows(fc: ForecastResult, mode: FutureMode, d: Derived | null): HzLive[] {
  const per = fc.validation?.per_horizon;
  if (!per) return [];
  return Object.keys(per)
    .map(Number)
    .filter((h) => Number.isFinite(h))
    .sort((a, b) => a - b)
    .map((h) => {
      const p = per[String(h)];
      const sel = p.selected_model ?? fc.model?.selected_by_horizon?.[String(h)] ?? '';
      const mae = num(p.test?.[sel]?.mae);
      const targetYm = d && d.startIdx >= 0 ? d.times[d.startIdx + h - 1] : undefined;
      const mult = mode === 'rain' ? (targetYm ? daysInMonth(targetYm) : 30.4) : 1;
      return {
        h,
        model: MODEL_NAMES[sel] ?? sel,
        skill: num(p.test_skill_vs_climatology),
        err: mae == null ? null : mae * mult,
        hit: num(p.test_coverage_80),
      };
    });
}

/** Number of leading horizons where skill beats the 2 % engineering threshold. */
export function skillHorizons(fc: ForecastResult): number | null {
  const sk = fc.findings?.[0]?.evidence?.skill_by_horizon;
  if (!sk) return null;
  let n = 0;
  for (const v of sk) {
    if (v > 0.02) n++;
    else break;
  }
  return n;
}

export function niceTicks(lo: number, hi: number, target = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}
