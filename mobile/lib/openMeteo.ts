/**
 * Open-Meteo client — android-handoff docs/04-data-and-apis.md §§2–4.
 * No API key. Persistent cache via cacheStore.
 */
import type { SimLive, SimRecord } from '@/lib/api';
import { cacheDelete, cacheGet, cacheSet, TTL } from '@/lib/cacheStore';
import type { Region } from '@/lib/geo';
import { BLR, SIM_GRID, buildPoints, lists } from '@/lib/regions';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const LIVE_CURRENT =
  'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,soil_temperature_0_to_7cm,cloud_cover';
const PAST_HOURLY =
  'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,soil_temperature_0_to_7cm';

export type LayerKey = 'air' | 'surf' | 'rain' | 'rh' | 'wind' | 'pm25';

type Loc = {
  current?: Record<string, number | string | null>;
  daily?: Record<string, (number | null)[]>;
  hourly?: Record<string, (number | null)[]>;
};

function asArr(body: unknown): Loc[] {
  if (Array.isArray(body)) return body as Loc[];
  if (body && typeof body === 'object') return [body as Loc];
  return [];
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, retries = 2): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.status === 429 && attempt < retries) {
      await sleep(15_000);
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Open-Meteo HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ''}`);
    }
    return res.json();
  }
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Current hour in Asia/Kolkata (0–23). */
export function istHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
}

export function istClock(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
}

/** Same calendar day N years ago, clamped to ERA5 lag (today − 7d). Feb 29 → Feb 28. */
export function pastDateYearsAgo(years: number, now = new Date()): string {
  const max = new Date(now);
  max.setDate(max.getDate() - 7);
  const d = new Date(now);
  d.setFullYear(d.getFullYear() - years);
  if (d.getMonth() !== now.getMonth()) d.setDate(0); // rolled past Feb 29
  if (d > max) return ymd(max);
  if (d < new Date(1980, 0, 1)) return '1980-01-01';
  return ymd(d);
}

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return ymd(new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

function rain30(daily: (number | null)[] | undefined): number | null {
  if (!daily?.length) return null;
  // Exclude today (last index when past_days=30 & forecast_days=1 → 31 entries).
  const slice = daily.length > 30 ? daily.slice(0, 30) : daily;
  let sum = 0;
  let n = 0;
  for (const v of slice) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      sum += v;
      n++;
    }
  }
  return n >= 28 ? sum : n > 0 ? sum : null;
}

function pickHour(series: (number | null)[] | undefined, hour: number): number | null {
  if (!series?.length) return null;
  return num(series[Math.min(hour, series.length - 1)]);
}

function emptyVals(n: number): Record<string, (number | null)[]> {
  return {
    air: Array(n).fill(null),
    surf: Array(n).fill(null),
    rain: Array(n).fill(null),
    rh: Array(n).fill(null),
    wind: Array(n).fill(null),
    pm25: Array(n).fill(null),
    cloud: Array(n).fill(null),
    wdir: Array(n).fill(null),
  };
}

async function fetchPm25Current(lat: string, lon: string, n: number): Promise<(number | null)[]> {
  try {
    const url = `${AIR}?latitude=${lat}&longitude=${lon}&current=pm2_5`;
    const body = asArr(await fetchJson(url));
    return Array.from({ length: n }, (_, i) => num(body[i]?.current?.pm2_5));
  } catch {
    return Array(n).fill(null);
  }
}

async function fetchPm25Hourly(
  lat: string,
  lon: string,
  date: string,
  hour: number,
  n: number,
): Promise<(number | null)[]> {
  if (date < '2022-09-01') return Array(n).fill(null);
  try {
    const url = `${AIR}?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=pm2_5&timezone=Asia%2FKolkata`;
    const body = asArr(await fetchJson(url));
    return Array.from({ length: n }, (_, i) => pickHour(body[i]?.hourly?.pm2_5, hour));
  } catch {
    return Array(n).fill(null);
  }
}

export async function fetchLive(
  region: Region,
  opts?: { force?: boolean },
): Promise<SimLive> {
  // Always use the Simulate grid so LiveHeatMap / geo.ts stay aligned (no UI change).
  const cacheKey = `live:sim:${region}`;
  if (opts?.force) await cacheDelete(cacheKey);
  else {
    const hit = await cacheGet<SimLive>(cacheKey, TTL.liveMs);
    if (hit) return hit;
  }

  const points = buildPoints(region, SIM_GRID[region]);
  const { latitude, longitude } = lists(points);
  const n = points.length;

  const weatherUrl =
    `${FORECAST}?latitude=${latitude}&longitude=${longitude}` +
    `&current=${LIVE_CURRENT}` +
    `&daily=precipitation_sum&past_days=30&forecast_days=1` +
    `&wind_speed_unit=ms&timezone=Asia%2FKolkata`;

  const body = asArr(await fetchJson(weatherUrl));
  const values = emptyVals(n);
  let time: string | null = null;

  for (let i = 0; i < n; i++) {
    const loc = body[i] ?? {};
    const c = loc.current ?? {};
    values.air[i] = num(c.temperature_2m);
    values.surf[i] = num(c.soil_temperature_0_to_7cm);
    values.rh[i] = num(c.relative_humidity_2m);
    values.wind[i] = num(c.wind_speed_10m);
    values.wdir[i] = num(c.wind_direction_10m);
    values.cloud[i] = num(c.cloud_cover);
    values.rain[i] = rain30(loc.daily?.precipitation_sum);
    if (i === n - 1 && typeof c.time === 'string') time = c.time;
  }

  values.pm25 = await fetchPm25Current(latitude, longitude, n);

  const out: SimLive = {
    time: time ? `${time.slice(11, 16)} IST` : `Live · ${istClock()} IST`,
    valid_time: time,
    values,
    source: 'Open-Meteo · ECMWF IFS / GFS best match · CAMS PM2.5',
    region,
    grid_points: n,
    note: 'Live grid via Open-Meteo (android-handoff §2)',
  };
  await cacheSet(cacheKey, out);
  return out;
}

export async function fetchPastDay(
  region: Region,
  date: string,
  hour = istHour(),
): Promise<SimLive> {
  const cacheKey = `past:sim:${region}:${date}:h${hour}`;
  const hit = await cacheGet<SimLive>(cacheKey, TTL.pastMs);
  if (hit) return hit;

  const points = buildPoints(region, SIM_GRID[region]);
  const { latitude, longitude } = lists(points);
  const n = points.length;

  const hourlyUrl =
    `${ARCHIVE}?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${date}&end_date=${date}` +
    `&hourly=${PAST_HOURLY}` +
    `&wind_speed_unit=ms&timezone=Asia%2FKolkata`;

  const rainStart = addDays(date, -30);
  const rainEnd = addDays(date, -1);
  const rainUrl =
    `${ARCHIVE}?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${rainStart}&end_date=${rainEnd}` +
    `&daily=precipitation_sum&timezone=Asia%2FKolkata`;

  const [hourlyBody, rainBody] = await Promise.all([fetchJson(hourlyUrl), fetchJson(rainUrl)]);
  const hourly = asArr(hourlyBody);
  const rain = asArr(rainBody);
  const values = emptyVals(n);

  for (let i = 0; i < n; i++) {
    const h = hourly[i]?.hourly ?? {};
    values.air[i] = pickHour(h.temperature_2m, hour);
    values.surf[i] = pickHour(h.soil_temperature_0_to_7cm, hour);
    values.rh[i] = pickHour(h.relative_humidity_2m, hour);
    values.wind[i] = pickHour(h.wind_speed_10m, hour);
    values.wdir[i] = pickHour(h.wind_direction_10m, hour);
    values.cloud[i] = pickHour(h.cloud_cover, hour);
    const precip = rain[i]?.daily?.precipitation_sum;
    values.rain[i] = rain30(precip);
  }

  values.pm25 = await fetchPm25Hourly(latitude, longitude, date, hour, n);

  const out: SimLive = {
    time: `${date} · ${String(hour).padStart(2, '0')}:00 IST`,
    valid_time: `${date}T${String(hour).padStart(2, '0')}:00`,
    values,
    source: 'Open-Meteo · ERA5 / ERA5-Land · CAMS PM2.5',
    region,
    grid_points: n,
    note: 'Past-day grid via Open-Meteo archive (android-handoff §3)',
  };
  await cacheSet(cacheKey, out);
  return out;
}

type YearMaps = {
  air: Record<string, number>;
  rain: Record<string, number>;
  rh: Record<string, number>;
  wind: Record<string, number>;
};

function aggregateAnnual(
  times: string[],
  t2m: (number | null)[],
  precip: (number | null)[],
  rh: (number | null)[],
  wind: (number | null)[],
): YearMaps {
  const buckets: Record<
    string,
    { t: number[]; r: number[]; h: number[]; w: number[]; days: number }
  > = {};
  for (let i = 0; i < times.length; i++) {
    const y = times[i]?.slice(0, 4);
    if (!y) continue;
    if (!buckets[y]) buckets[y] = { t: [], r: [], h: [], w: [], days: 0 };
    const b = buckets[y];
    b.days++;
    const tv = num(t2m[i]);
    const rv = num(precip[i]);
    const hv = num(rh[i]);
    const wv = num(wind[i]);
    if (tv != null) b.t.push(tv);
    if (rv != null) b.r.push(rv);
    if (hv != null) b.h.push(hv);
    if (wv != null) b.w.push(wv);
  }
  const air: Record<string, number> = {};
  const rain: Record<string, number> = {};
  const rhOut: Record<string, number> = {};
  const windOut: Record<string, number> = {};
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  for (const [y, b] of Object.entries(buckets)) {
    if (b.days <= 300) continue;
    if (b.t.length > 300) air[y] = +mean(b.t).toFixed(2);
    if (b.r.length > 300) rain[y] = +b.r.reduce((a, c) => a + c, 0).toFixed(1);
    if (b.h.length > 300) rhOut[y] = +mean(b.h).toFixed(1);
    if (b.w.length > 300) windOut[y] = +mean(b.w).toFixed(2);
  }
  return { air, rain, rh: rhOut, wind: windOut };
}

export async function fetchAnnualRecord(): Promise<SimRecord> {
  const cacheKey = 'record:blr:annual';
  const hit = await cacheGet<SimRecord>(cacheKey, TTL.recordMs);
  if (hit) return hit;

  const lastYear = new Date().getUTCFullYear() - 1;
  const url =
    `${ARCHIVE}?latitude=${BLR.lat}&longitude=${BLR.lon}` +
    `&start_date=1980-01-01&end_date=${lastYear}-12-31` +
    `&daily=temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean,wind_speed_10m_mean` +
    `&wind_speed_unit=ms&timezone=Asia%2FKolkata`;

  const body = asArr(await fetchJson(url))[0];
  const daily = body?.daily as Record<string, (number | null)[] | string[]> | undefined;
  if (!daily?.time) throw new Error('Annual record: empty Open-Meteo response');

  const times = daily.time as string[];
  const maps = aggregateAnnual(
    times,
    (daily.temperature_2m_mean as (number | null)[]) ?? [],
    (daily.precipitation_sum as (number | null)[]) ?? [],
    (daily.relative_humidity_2m_mean as (number | null)[]) ?? [],
    (daily.wind_speed_10m_mean as (number | null)[]) ?? [],
  );

  const out: SimRecord = {
    ...maps,
    source: 'Open-Meteo · ERA5 annual means at Bengaluru',
    focal: { lat: BLR.lat, lon: BLR.lon },
    coverage_note: 'Years with >300 valid days; rain = annual total, others = annual mean',
  };
  await cacheSet(cacheKey, out);
  return out;
}

/** Mean of record years 2016–2025 (inclusive) for anomaly / AR6 air base. */
export function climateMean(series: Record<string, number> | undefined): number | null {
  if (!series) return null;
  const vals: number[] = [];
  for (let y = 2016; y <= 2025; y++) {
    const v = series[String(y)];
    if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * ERA5 reality check for a Forecast cell (docs/04 §5):
 * complete months from Jan 1 of the forecast year → today − 6 days.
 */
export async function fetchRealityCheck(
  lat: number,
  lon: number,
  kind: 'air' | 'rain',
): Promise<{ months: { ym: string; value: number }[]; source: string }> {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - 6);
  const year = end.getUTCFullYear();
  const cacheKey = `era5:${kind}:${lat.toFixed(3)}:${lon.toFixed(3)}:${year}-${end.getUTCMonth() + 1}`;
  const hit = await cacheGet<{ months: { ym: string; value: number }[]; source: string }>(
    cacheKey,
    TTL.era5MonthMs,
  );
  if (hit) return hit;

  const start = `${year}-01-01`;
  const endIso = ymd(end);
  const url =
    `${ARCHIVE}?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start}&end_date=${endIso}` +
    `&daily=temperature_2m_mean,precipitation_sum&timezone=Asia%2FKolkata`;
  const body = asArr(await fetchJson(url))[0];
  const daily = body?.daily as Record<string, (number | null)[] | string[]> | undefined;
  const times = (daily?.time as string[]) ?? [];
  const t2m = (daily?.temperature_2m_mean as (number | null)[]) ?? [];
  const precip = (daily?.precipitation_sum as (number | null)[]) ?? [];

  const buckets: Record<string, number[]> = {};
  for (let i = 0; i < times.length; i++) {
    const ym = times[i]?.slice(0, 7);
    if (!ym) continue;
    const v = kind === 'air' ? num(t2m[i]) : num(precip[i]);
    if (v == null) continue;
    if (!buckets[ym]) buckets[ym] = [];
    buckets[ym].push(v);
  }

  const months: { ym: string; value: number }[] = [];
  for (const [ym, vals] of Object.entries(buckets).sort()) {
    const [y, m] = ym.split('-').map(Number);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (vals.length < dim) continue; // incomplete month
    const value =
      kind === 'air'
        ? vals.reduce((a, b) => a + b, 0) / vals.length
        : vals.reduce((a, b) => a + b, 0);
    months.push({ ym, value: +value.toFixed(kind === 'air' ? 2 : 1) });
  }

  const out = { months, source: 'Open-Meteo · ERA5 reality check' };
  await cacheSet(cacheKey, out);
  return out;
}

/** Single-point live readout for Home when the BhuVyom site API is down. */
export async function fetchHomeStamp(): Promise<{
  air: number | null;
  surf: number | null;
  rh: number | null;
  pm25: number | null;
  time: string;
  source: string;
}> {
  const cacheKey = 'live:home:blr';
  const hit = await cacheGet<{
    air: number | null;
    surf: number | null;
    rh: number | null;
    pm25: number | null;
    time: string;
    source: string;
  }>(cacheKey, TTL.liveMs);
  if (hit) return hit;

  const url =
    `${FORECAST}?latitude=${BLR.lat}&longitude=${BLR.lon}` +
    `&current=temperature_2m,relative_humidity_2m,soil_temperature_0_to_7cm` +
    `&timezone=Asia%2FKolkata`;
  const body = asArr(await fetchJson(url))[0];
  const c = body?.current ?? {};
  let pm25: number | null = null;
  try {
    const aq = asArr(
      await fetchJson(`${AIR}?latitude=${BLR.lat}&longitude=${BLR.lon}&current=pm2_5`),
    )[0];
    pm25 = num(aq?.current?.pm2_5);
  } catch {
    pm25 = null;
  }
  const out = {
    air: num(c.temperature_2m),
    surf: num(c.soil_temperature_0_to_7cm),
    rh: num(c.relative_humidity_2m),
    pm25,
    time: typeof c.time === 'string' ? `${c.time.slice(11, 16)} IST` : `${istClock()} IST`,
    source: 'Open-Meteo',
  };
  await cacheSet(cacheKey, out);
  return out;
}
