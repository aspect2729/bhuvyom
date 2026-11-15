import type { EngineResult, Product } from '../lib/types'
import { Link } from 'react-router-dom'
import { Panel, TypeBadge } from './Panel'

const ENGINE_LABEL: Record<string, string> = { acquisition: 'Observations', analysis: 'Analysis', prediction: 'Prediction', simulation: 'Simulation' }

export function ProductPicker({ products, active, onPick }: { products: Product[]; active: string; onPick: (p: Product) => void }) {
  const groups = ['acquisition', 'analysis', 'prediction', 'simulation']
  return (
    <Panel title="Data & engines">
      <Link to="/prediction" className="mb-3 block rounded-lg border border-cyan-400/30 px-3 py-2 text-xs text-cyan-200">Prediction performance &amp; validation →</Link>
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g}>
            <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">{ENGINE_LABEL[g]}</div>
            <div className="space-y-1">
              {products.filter((p) => p.engine === g).map((p) => (
                <button key={p.id} disabled={!p.available} onClick={() => onPick(p)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition ${p.id === active ? 'bg-gradient-to-r from-indigo-500/25 to-cyan-500/10 text-white ring-1 ring-cyan-400/40' : 'text-slate-300 hover:bg-white/5'} disabled:cursor-not-allowed disabled:opacity-35`}>
                  <span>{p.label}</span>
                  {!p.available && <span className="text-[10px] text-slate-500">not acquired</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function FieldPicker({ result, field, onField }: { result: EngineResult; field: string; onField: (f: string) => void }) {
  const entries = Object.entries(result.grid.fields).filter(([, f]) => f.role !== 'uncertainty')
  return (
    <Panel title="Map layer" right={<TypeBadge type={result.data_type} />}>
      <div className="mb-2 text-[13px] font-medium leading-snug text-white">{result.title}</div>
      <select value={field} onChange={(e) => onField(e.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-[12.5px] text-slate-100 outline-none focus:border-cyan-400/60">
        {entries.map(([k, f]) => (
          <option key={k} value={k}>{f.label} ({f.unit})</option>
        ))}
      </select>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        <dt className="text-slate-500">Resolution</dt><dd className="text-slate-300">{result.effective_resolution}</dd>
        <dt className="text-slate-500">Time step</dt><dd className="text-slate-300">{result.temporal_resolution}</dd>
        <dt className="text-slate-500">Period</dt><dd className="text-slate-300">{result.temporal_coverage.start} – {result.temporal_coverage.end}</dd>
      </dl>
    </Panel>
  )
}

export interface ScenarioParams { baseline_impervious: number; scenario_impervious: number; soil_group: string; lam: number }

export function ScenarioControls({ params, onChange, onRun, busy }: { params: ScenarioParams; onChange: (p: ScenarioParams) => void; onRun: () => void; busy: boolean }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <Panel title="Scenario (hypothetical)">
      <label className="block text-[11.5px] text-slate-400">Baseline impervious fraction <span className="float-right font-mono text-slate-200">{pct(params.baseline_impervious)}</span></label>
      <input type="range" min={0} max={1} step={0.05} value={params.baseline_impervious} onChange={(e) => onChange({ ...params, baseline_impervious: +e.target.value })} className="w-full accent-cyan-400" />
      <label className="mt-1 block text-[11.5px] text-slate-400">Scenario impervious fraction <span className="float-right font-mono text-orange-300">{pct(params.scenario_impervious)}</span></label>
      <input type="range" min={0} max={1} step={0.05} value={params.scenario_impervious} onChange={(e) => onChange({ ...params, scenario_impervious: +e.target.value })} className="w-full accent-orange-400" />
      <div className="mt-2 flex gap-2 text-[11.5px]">
        <label className="flex-1 text-slate-400">Soil group
          <select value={params.soil_group} onChange={(e) => onChange({ ...params, soil_group: e.target.value })} className="mt-0.5 w-full rounded border border-white/10 bg-slate-900 px-1.5 py-1 text-slate-100">
            {['B', 'C', 'D'].map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="flex-1 text-slate-400">λ (Ia/S)
          <select value={params.lam} onChange={(e) => onChange({ ...params, lam: +e.target.value })} className="mt-0.5 w-full rounded border border-white/10 bg-slate-900 px-1.5 py-1 text-slate-100">
            {[0.2, 0.05].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
      </div>
      <button onClick={onRun} disabled={busy} className="mt-3 w-full rounded-lg bg-gradient-to-r from-orange-500/80 to-amber-500/70 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50">{busy ? 'Simulating…' : 'Run simulation'}</button>
      <p className="mt-2 text-[10.5px] leading-snug text-slate-500">Impervious fractions are user assumptions — no observed impervious-surface product is integrated.</p>
    </Panel>
  )
}
