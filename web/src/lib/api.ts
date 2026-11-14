export interface ApiError { error: string; reason: string; requirement?: string; hint?: string }

export class EngineError extends Error {
  detail: ApiError
  constructor(detail: ApiError) { super(detail.reason); this.detail = detail }
}

/** Same-origin '/api' (Vite proxies it to the FastAPI backend on :8001). */
export async function getJson<T>(path: string): Promise<T> {
  let res: Response
  try { res = await fetch(path) } catch {
    throw new EngineError({ error: 'server_unreachable', reason: 'The BhuVyom API is not running. Start it: cd backend && uvicorn main:app --reload --port 8001' })
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new EngineError(body?.reason ? body : { error: `http_${res.status}`, reason: res.status === 502 || res.status === 504 ? 'The BhuVyom API is not running on port 8001.' : JSON.stringify(body?.detail ?? body) })
  return body as T
}

export type LngLat = [number, number]
export interface SiteCell { id: string; polygon: LngLat[]; center: LngLat; v: number | null }
export interface SiteLayer { label: string; unit: string; period: string; source: string; resolution: string; fit: 'region' | 'city'; cells: SiteCell[]; lo: number | null; hi: number | null; city_value: number | null; period_short: string }
export interface SiteSummary {
  layers: Record<string, SiteLayer>
  readings: Record<string, { value: number | null; unit: string; period: string }>
  compare: { year: number; air: (number | null)[]; lst: (number | null)[]; air_source: string; lst_source: string }
  runoff: { mean_extra_mm: number; ens_low: number; ens_high: number; period: string; validation: string }
}
export interface LabCell { id: string; polygon: LngLat[]; center: LngLat; rain_mm: number | null; today_mm: number | null; scenario_mm: number | null }
export interface LabResult {
  inputs: { intensity_mm_h: number; duration_h: number; storm_depth_mm: number; permeable: number; today_permeable: number; soil_group: string; lambda: number }
  cells: LabCell[]
  results: { runoff_today_mm: number; runoff_scenario_mm: number; change_pct: number | null; runoff_coeff_today: number; runoff_coeff_scenario: number; volume_today_mcm: number; volume_scenario_mcm: number; scenario_ensemble_mm: [number, number]; bbmp_area_km2: number }
  curve: { rain_mm: number[]; today_mm: number[]; scenario_mm: number[] }
  parameters: Record<string, number>
  storm_shape: { source: string; date: string; city_mean_mm: number; max_cell_mm: number }
  assumptions: string[]; methodology: string; validation: string
}
export interface Ens { median: number | null; min: number | null; max: number | null; n_models: number }
export interface FutureMetric {
  id: string; label: string; unit?: string; decimals?: number; why?: string; available: boolean; reason?: string
  baseline?: Ens
  scenarios?: Record<string, { windows: Record<string, { period: string; value: Ens; delta: Ens }>; trajectory: { year: number; window: string; median: number | null; min: number | null; max: number | null; n_models: number }[] }>
}
export interface FutureData {
  source: { product: string; resolution: string; reference: string; grid_cell: { lat: number; lon: number } | null; models: string[] }
  scenarios: { id: string; label: string; code: string }[]
  baseline_period: string; windows: Record<string, string>; method: string; metrics: FutureMetric[]; limitations: string[]
}

export const api = {
  site: () => getJson<SiteSummary>('/api/site/summary'),
  boundary: () => getJson<GeoJSON.FeatureCollection>('/api/boundaries/bbmp'),
  lab: (q: { intensity: number; duration: number; permeable: number }) =>
    getJson<LabResult>(`/api/lab/runoff?intensity=${q.intensity}&duration=${q.duration}&permeable=${q.permeable}`),
  future: () => getJson<FutureData>('/api/future/projections'),
}
