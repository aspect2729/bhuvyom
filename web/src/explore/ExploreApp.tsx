import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapView } from './map/MapView'
import { EngineError, fetchBoundary, fetchCatalog, fetchRegistry, fetchResult } from './lib/api'
import { buildScale } from './lib/color'
import type { ApiError, EngineResult, Product, Registry } from './lib/types'
import { FieldPicker, ProductPicker, ScenarioControls, type ScenarioParams } from './ui/Controls'
import { Legend } from './ui/Legend'
import { TimeControl } from './ui/TimeControl'
import { CellPanel } from './ui/CellPanel'
import { Findings } from './ui/Findings'
import { Inspector } from './ui/Inspector'

// Default selection: the cell whose centre is nearest central Bengaluru (MG Road, 12.9716°N 77.5946°E)
function defaultCell(r: EngineResult): string | null {
  const city = r.grid.cells.find((x) => x.is_city_cell)
  if (city) return city.id
  let best: string | null = null, bd = Infinity
  for (const c of r.grid.cells) { const d = (c.center[0] - 77.5946) ** 2 + (c.center[1] - 12.9716) ** 2; if (d < bd) { bd = d; best = c.id } }
  return best
}

function validIndices(r: EngineResult | null, field: string): number[] {
  const f = r?.grid.fields[field]
  if (!r || !f || f.kind !== 'time_series') return []
  return r.grid.times.map((_, i) => i).filter((i) => Object.values(f.values).some((v) => Array.isArray(v) && v[i] != null))
}

export default function ExploreApp() {
  const [products, setProducts] = useState<Product[]>([])
  const [registry, setRegistry] = useState<Registry | null>(null)
  const [boundary, setBoundary] = useState<GeoJSON.FeatureCollection | null>(null)
  const [active, setActive] = useState<Product | null>(null)
  const [result, setResult] = useState<EngineResult | null>(null)
  const [field, setField] = useState('')
  const [timeIndex, setTimeIndex] = useState(0)
  const [cell, setCell] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [inspector, setInspector] = useState(() => new URLSearchParams(window.location.search).has('inspector'))
  const [scn, setScn] = useState<ScenarioParams>({ baseline_impervious: 0.6, scenario_impervious: 0.8, soil_group: 'C', lam: 0.2 })

  const load = useCallback(async (p: Product, params?: Record<string, string | number>) => {
    setActive(p); setLoading(true); setError(null)
    try {
      const r = await fetchResult(p.endpoint, params)
      setResult(r)
      setField(r.default_field)
      const vi = validIndices(r, r.default_field)
      setTimeIndex(vi.length ? vi[0] : 0)
      setCell((c) => (c && r.grid.cells.some((x) => x.id === c) ? c : defaultCell(r)))
    } catch (e) {
      setError(e instanceof EngineError ? e.detail : { error: 'unknown', reason: String(e) })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchCatalog().then((c) => {
      setProducts(c.products)
      const first = c.products.find((p) => p.id === 'ana_trend_T2M' && p.available) ?? c.products.find((p) => p.available)
      if (first) load(first)
    }).catch((e) => setError(e instanceof EngineError ? e.detail : { error: 'unknown', reason: String(e) }))
    fetchRegistry().then(setRegistry).catch(() => undefined)
    fetchBoundary().then(setBoundary).catch(() => undefined)
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.shiftKey && (e.key === 'I' || e.key === 'i') && !(e.target instanceof HTMLInputElement)) setInspector((v) => !v) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const scale = useMemo(() => (result && field && result.grid.fields[field] ? buildScale(field, result.grid.fields[field]) : null), [result, field])
  const valid = useMemo(() => validIndices(result, field), [result, field])
  const onField = (f: string) => { setField(f); const vi = validIndices(result, f); if (vi.length && !vi.includes(timeIndex)) setTimeIndex(vi[0]) }
  const runSim = () => active && load(active, { ...scn })

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#06080d]">
      <MapView result={result} field={field} timeIndex={timeIndex} scale={scale} selectedCell={cell} onSelectCell={setCell} boundary={boundary} />

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-h-[calc(100%-24px)] w-[310px] flex-col gap-2.5 overflow-y-auto pb-24">
        <div className="pointer-events-auto rounded-xl border border-white/8 bg-[#0b0f17]/88 px-4 py-3 backdrop-blur-md">
          <div className="bg-gradient-to-r from-cyan-300 via-indigo-300 to-violet-300 bg-clip-text text-[20px] font-bold tracking-tight text-transparent">BhuVyom</div>
          <div className="text-[11px] text-slate-400">Bengaluru environmental intelligence · NASA Space Apps</div>
        </div>
        {products.length > 0 && <ProductPicker products={products} active={active?.id ?? ''} onPick={(p) => load(p, p.engine === 'simulation' ? { ...scn } : undefined)} />}
        {result && <FieldPicker result={result} field={field} onField={onField} />}
        {active?.engine === 'simulation' && <ScenarioControls params={scn} onChange={setScn} onRun={runSim} busy={loading} />}
        {result && scale && <Legend result={result} field={field} scale={scale} />}
      </div>

      <div className="pointer-events-none absolute right-3 top-3 z-10 flex max-h-[calc(100%-24px)] w-[450px] flex-col gap-2.5 overflow-y-auto pb-24">
        {result && cell && <CellPanel result={result} cellId={cell} field={field} timeIndex={timeIndex} onTime={setTimeIndex} onClose={() => setCell(null)} />}
        {result && <Findings result={result} />}
      </div>

      {result && valid.length > 1 && !inspector && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2"><TimeControl times={result.grid.times} index={timeIndex} valid={valid} onIndex={setTimeIndex} /></div>
      )}

      {loading && <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full border border-cyan-400/40 bg-slate-950/90 px-4 py-1.5 text-[12px] text-cyan-200">Running {active?.engine} engine…</div>}
      {error && (
        <div className="absolute left-1/2 top-4 z-30 max-w-xl -translate-x-1/2 rounded-xl border border-amber-400/40 bg-slate-950/95 px-4 py-3 text-[12.5px] text-amber-100 shadow-xl">
          <div className="font-semibold text-amber-300">{error.error === 'infeasible_request' ? 'Request refused — scientifically infeasible' : 'Unavailable'}</div>
          <div className="mt-1">{error.reason}</div>
          {error.requirement && <div className="mt-1 text-slate-300">Requires: {error.requirement}</div>}
          {error.hint && <div className="mt-1 text-slate-400">{error.hint}</div>}
          <button onClick={() => setError(null)} className="mt-2 text-[11px] text-slate-400 underline">dismiss</button>
        </div>
      )}
      {inspector && result && <Inspector result={result} registry={registry} cellId={cell} onClose={() => setInspector(false)} />}
    </div>
  )
}
