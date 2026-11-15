export interface Metrics {
  n: number; mae: number | null; rmse: number | null; bias: number | null; r2: number | null
  coverage_80: number | null; coverage_95: number | null; interval_n: number
  mean_width_80: number | null; pinball_10: number | null; pinball_90: number | null
}
export interface Group extends Metrics { group: string; sufficient: boolean }
export interface CellGroup extends Group { cell: { id: string; center: [number, number]; polygon: [number, number][] } }
export interface Comparison extends Metrics { version: string; parameters: Record<string, unknown>; passes_validation_gates: boolean }
export interface Experiment {
  run_id: string; variable: string; unit: string; experiment_version: string; protocol: string; created_at: string; dataset_sha256: string
  periods: Record<string, { start: string; end: string }>; training_period: { start: string; end: string }
  features: string[]; selected_by_horizon: Record<string, string>; test_opened: boolean
  comparisons: Record<string, Record<string, Comparison>>; limitations: string[]
  interval_calibration_counts: Record<string, number>; preprocessing: Record<string, unknown>
  interval_repair_available: boolean; candidates: Record<string, { version: string; parameters: Record<string, unknown> }>
}
export interface ExperimentList { experiments: Experiment[]; promotion_events: { run_id: string; promoted_at: string }[] }
export interface Forecast {
  prediction_id: string; grid_id: string; model_id: string; forecast_origin: string; target_timestamp: string; forecast_horizon: number
  predicted_value: number | null; pi80_low: number | null; pi80_high: number | null; pi95_low: number | null; pi95_high: number | null
}
export interface Performance {
  run_id: string; variable: string; unit: string; dataset: string; horizon: number; metrics: Metrics
  cells: CellGroup[]; regional: Group[]; months: Group[]; seasons: Group[]; years: Group[]; horizons: Group[]; conditions: Group[]
  timeline: { target: string; actual: number; predicted: number; signed_error: number; mae: number; n: number; pi80_low: number | null; pi80_high: number | null }[]
  error_distribution: { bin: string; count: number; lower: number; upper: number }[]
  forecast: Forecast[]; minimum_grid_pairs: number; comparisons: Experiment['comparisons']; notice: string; uncertainty: string
  interval_audit: { status: string; calibration_available_through: string; note: string }
}
