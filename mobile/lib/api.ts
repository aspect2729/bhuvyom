/**
 * BhuVyom API client for Expo.
 * Base URL: EXPO_PUBLIC_API_URL, else Expo debugger host :8001, else localhost.
 */
import Constants from 'expo-constants';

export type ApiErrorBody = { error: string; reason: string; requirement?: string; hint?: string };

export class EngineError extends Error {
  detail: ApiErrorBody;
  constructor(detail: ApiErrorBody) {
    super(detail.reason);
    this.detail = detail;
  }
}

function resolveBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2
      ?.extra?.expoClient?.hostUri ||
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:8001`;
    }
  }
  return 'http://127.0.0.1:8001';
}

export const API_BASE = resolveBase();

export async function getJson<T>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new EngineError({
      error: 'server_unreachable',
      reason: `Cannot reach BhuVyom API at ${API_BASE}. Start: cd backend && uvicorn main:app --reload --port 8001`,
    });
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new EngineError(
      body?.reason
        ? body
        : {
            error: `http_${res.status}`,
            reason: typeof body?.detail === 'string' ? body.detail : `HTTP ${res.status}`,
          },
    );
  }
  return body as T;
}

export type SiteReading = { value: number | null; unit: string; period: string };
export type SiteCell = {
  id: string;
  polygon: [number, number][];
  center: [number, number];
  v: number | null;
};
export type SiteLayer = {
  label: string;
  unit: string;
  period: string;
  source: string;
  resolution: string;
  fit: 'region' | 'city';
  cells: SiteCell[];
  lo: number | null;
  hi: number | null;
  city_value: number | null;
  period_short: string;
};
export type SiteSummary = {
  layers: Record<string, SiteLayer>;
  readings: Record<string, SiteReading>;
  compare: {
    year: number;
    air: (number | null)[];
    lst: (number | null)[];
    air_source: string;
    lst_source: string;
  };
  runoff: {
    mean_extra_mm: number;
    ens_low: number;
    ens_high: number;
    period: string;
    validation: string;
  };
};

export type SimLive = {
  time: string | null;
  valid_time: string | null;
  values: Record<string, (number | null)[]>;
  source: string;
  air_source?: Record<string, unknown>;
  region: string;
  grid_points: number;
  note?: string;
  stored_in_database?: boolean;
};

export type SimRecord = {
  air: Record<string, number>;
  rain: Record<string, number>;
  rh: Record<string, number>;
  wind: Record<string, number>;
  source: string;
  focal: { lat: number; lon: number };
  coverage_note?: string;
};

export type ForecastField = {
  unit: string;
  label: string;
  kind: string;
  role: string;
  values: Record<string, (number | null)[]>;
};

export type ForecastResult = {
  title: string;
  variable: string;
  units: string;
  findings?: {
    statement: string;
    evidence?: { skill_by_horizon?: number[]; coverage_80?: number[]; coverage_95?: number[] };
  }[];
  executed_at?: string;
  model?: {
    id?: string;
    version?: string;
    selected_by_horizon?: Record<string, string>;
    training_period?: string;
    calibration_origins?: string;
    test_origins?: string;
  };
  validation?: {
    per_horizon?: Record<
      string,
      {
        selected_model?: string;
        test?: Record<string, { mae?: number; n?: number }>;
        test_skill_vs_climatology?: number;
        test_coverage_80?: number;
      }
    >;
  };
  quality?: { cells?: number };
  temporal_coverage?: { start?: string; end?: string; forecast_origin?: string };
  grid: {
    times: string[];
    fields: Record<string, ForecastField>;
    cells: { id: string; center: [number, number]; is_city_cell?: boolean }[];
  };
};

export type LabResult = {
  results: {
    runoff_today_mm: number;
    runoff_scenario_mm: number;
    change_pct: number | null;
  };
  storm_shape: { source: string; date: string; city_mean_mm: number };
  validation: string;
};

export const api = {
  health: () => getJson<{ status: string }>('/api/health'),
  site: () => getJson<SiteSummary>('/api/site/summary'),
  simLive: (region: 'ka' | 'blr') =>
    getJson<SimLive>(`/api/site/sim/live?region=${region}`),
  simRecord: () => getJson<SimRecord>('/api/site/sim/record'),
  lab: (q: { intensity: number; duration: number; permeable: number }) =>
    getJson<LabResult>(
      `/api/lab/runoff?intensity=${q.intensity}&duration=${q.duration}&permeable=${q.permeable}`,
    ),
  forecast: (variable: 'T2M' | 'PRECTOTCORR', horizon = 12) =>
    getJson<ForecastResult>(
      `/api/prediction/forecast?var=${variable}&horizon_months=${horizon}`,
    ),
  future: () => getJson<Record<string, unknown>>('/api/future/projections'),
};

/** Bengaluru POWER cell used by the prediction engine. */
export const CITY_CELL = 'p_13.000_77.500';

export function meanValid(values: (number | null)[] | undefined): number | null {
  if (!values?.length) return null;
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function lastValid(values: (number | null)[] | undefined): number | null {
  if (!values?.length) return null;
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export function fmt(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}
