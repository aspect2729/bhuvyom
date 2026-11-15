/**
 * Bundle → ForecastResult adapter for offline Forecast (prediction-engine-results.json).
 */
import engine from '../data/prediction-engine-results.json';
import type { ForecastField, ForecastResult } from '@/lib/api';

type EngineVar = {
  unit: string;
  label: string;
  origin?: string;
  executed?: string;
  version?: string;
  times: string[];
  cells: { id: string; lon: number; lat: number; city?: boolean }[];
  f: Record<string, (number | null)[][]>;
  model_by_h?: Record<string, string>;
  skill_by_h?: Record<string, number>;
  cov80_by_h?: Record<string, number>;
  mae_by_h?: Record<string, number>;
  findings?: string[];
  assumptions?: string[];
  limitations?: string[];
  training?: string;
  test?: string;
};

const vars = (engine as { vars: Record<string, EngineVar> }).vars;

function fieldFrom(
  name: string,
  label: string,
  unit: string,
  cells: EngineVar['cells'],
  matrix: (number | null)[][] | undefined,
): ForecastField {
  const values: Record<string, (number | null)[]> = {};
  cells.forEach((c, i) => {
    values[c.id] = matrix?.[i] ?? [];
  });
  return {
    unit,
    label,
    kind: name,
    role: name,
    values,
  };
}

export function bundledForecast(variable: 'T2M' | 'PRECTOTCORR'): ForecastResult {
  const v = vars[variable];
  if (!v) throw new Error(`Bundled engine has no variable ${variable}`);

  const fields: Record<string, ForecastField> = {};
  for (const [name, matrix] of Object.entries(v.f)) {
    fields[name] = fieldFrom(name, name, v.unit, v.cells, matrix);
  }

  const perHorizon: NonNullable<ForecastResult['validation']>['per_horizon'] = {};
  for (const h of Object.keys(v.skill_by_h ?? {})) {
    perHorizon[h] = {
      selected_model: v.model_by_h?.[h],
      test_skill_vs_climatology: v.skill_by_h?.[h],
      test_coverage_80: v.cov80_by_h?.[h],
      test: v.mae_by_h?.[h] != null ? { mae: { mae: v.mae_by_h[h] } } : undefined,
    };
  }

  return {
    title: v.label,
    variable,
    units: v.unit,
    findings: (v.findings ?? []).map((statement) => ({ statement })),
    executed_at: v.executed,
    model: {
      id: 'bhuvyom-bundled',
      version: v.version,
      selected_by_horizon: v.model_by_h,
      training_period: v.training,
      test_origins: v.test,
    },
    validation: { per_horizon: perHorizon },
    quality: { cells: v.cells.length },
    temporal_coverage: {
      start: v.times[0],
      end: v.times[v.times.length - 1],
      forecast_origin: v.origin,
    },
    grid: {
      times: v.times,
      fields,
      cells: v.cells.map((c) => ({
        id: c.id,
        center: [c.lat, c.lon] as [number, number],
        is_city_cell: !!c.city,
      })),
    },
  };
}

/** Live API first; on failure, bundled prediction-engine-results.json. */
export async function forecastWithFallback(
  fetchLive: () => Promise<ForecastResult>,
  variable: 'T2M' | 'PRECTOTCORR',
): Promise<ForecastResult & { offline?: boolean }> {
  try {
    return await fetchLive();
  } catch {
    return { ...bundledForecast(variable), offline: true };
  }
}
