import type { ColorScale } from '../lib/color'
import type { EngineResult } from '../lib/types'
import { Panel } from './Panel'

export function Legend({ result, field, scale }: { result: EngineResult; field: string; scale: ColorScale }) {
  const f = result.grid.fields[field]
  const stops = Array.from({ length: 24 }, (_, i) => scale.ramp(i / 23))
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2))
  const hasSig = !!result.grid.fields['significance_class'] && field !== 'significance_class'
  return (
    <Panel title="Legend">
      <div className="text-[12px] text-slate-200">{f.label}</div>
      {scale.kind === 'quality' ? (
        <div className="mt-2 space-y-1 text-[11px] text-slate-300">
          {[['#465064', 'Not significant'], ['#94a3b8', 'Raw p < 0.05 only'], ['#7dd3fc', 'Significant after BH-FDR (q ≤ 0.05)']].map(([c, l]) => (
            <div key={l} className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm" style={{ background: c }} />{l}</div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-2 h-2.5 rounded-sm" style={{ background: `linear-gradient(90deg, ${stops.join(',')})` }} />
          <div className="mt-1 flex justify-between font-mono text-[10.5px] text-slate-400">
            <span>{fmt(scale.domain[0])}</span>
            {scale.kind === 'diverging' && <span>0</span>}
            <span>{fmt(scale.domain[1])} {f.unit}</span>
          </div>
        </>
      )}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400"><span className="h-3 w-5 rounded-sm bg-[#5a626e]/40 ring-1 ring-white/10" />No data / QC-rejected</div>
      {hasSig && (
        <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-400">
          <div className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm ring-2 ring-sky-50" />Outline: BH-FDR significant</div>
          <div className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm ring-1 ring-slate-400" />Outline: raw p &lt; 0.05 only</div>
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400"><span className="h-3 w-5 rounded-sm ring-2 ring-sky-400" />BBMP boundary (243 wards)</div>
    </Panel>
  )
}
