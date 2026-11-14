export type DataType = 'observed' | 'analysed' | 'predicted' | 'simulated'
export type EngineName = 'acquisition' | 'analysis' | 'prediction' | 'simulation'

export interface Cell {
  id: string
  polygon: [number, number][]
  center: [number, number]
  is_city_cell?: boolean
}

export interface FieldSpec {
  unit: string
  label: string
  kind: 'time_series' | 'static'
  role: 'value' | 'uncertainty' | 'diagnostic' | 'quality'
  values: Record<string, (number | null)[] | number | null>
}

export interface Finding {
  statement: string
  category: 'observation' | 'statistical' | 'modelled' | 'simulated' | 'no_conclusion'
  evidence: Record<string, unknown>
  rule: string
  limitations: string[]
}

export interface TraceStep {
  step: string
  status: string
  detail: string
  duration_ms: number | null
}

export interface EngineResult {
  result_id: string
  schema_version: string
  engine_name: EngineName
  data_type: DataType
  title: string
  variable: string
  units: string
  crs: string
  native_resolution: string
  effective_resolution: string
  temporal_resolution: string
  temporal_coverage: Record<string, string | null>
  grid: {
    cells: Cell[]
    times: string[]
    fields: Record<string, FieldSpec>
    cell_attributes: Record<string, Record<string, unknown>>
  }
  default_field: string
  sources: Record<string, unknown>[]
  methodology: Record<string, unknown> & { id: string }
  model: Record<string, unknown> | null
  quality: Record<string, unknown>
  uncertainty: Record<string, unknown>
  validation: Record<string, unknown>
  configuration: Record<string, unknown>
  scenario: Record<string, unknown> | null
  assumptions: string[]
  limitations: string[]
  findings: Finding[]
  trace: TraceStep[]
  executed_at: string
}

export interface Product {
  id: string
  engine: EngineName
  data_type: DataType
  label: string
  endpoint: string
  available: boolean
  parameters?: Record<string, number | string>
}

export interface Methodology {
  id: string
  engine: string
  name: string
  description?: string
  formula_latex?: string
  inputs?: string[]
  assumptions?: string[]
  thresholds?: Record<string, unknown>
  outputs?: string[]
  graphs?: string[]
  map_layers?: string[]
  interpretation?: string[]
  limitations?: string[]
  doc_ref?: string
  corpus_support?: string
  status: string
  validation_note?: string
  missing_specification?: string
}

export interface Registry {
  methodologies: Methodology[]
  registry_in_sync_with_doc: boolean
  sync_warning?: string
  methodology_doc_sha?: string
}

export interface ApiError {
  error: string
  reason: string
  requirement?: string
  hint?: string
}
