import type { EngineResult } from '../lib/types'
import { Panel } from './Panel'

const CAT: Record<string, string> = { observation: '#22d3ee', statistical: '#818cf8', modelled: '#a78bfa', simulated: '#fb923c', no_conclusion: '#94a3b8' }
const CAT_LABEL: Record<string, string> = { observation: 'Direct observation', statistical: 'Statistical finding', modelled: 'Modelled result', simulated: 'Simulated outcome', no_conclusion: 'No reliable conclusion' }

export function Findings({ result }: { result: EngineResult }) {
  return (
    <Panel title="Scientific findings">
      <div className="space-y-2.5">
        {result.findings.map((f, i) => (
          <div key={i} className="rounded-lg border-l-2 bg-white/[0.02] py-1.5 pl-2.5 pr-1" style={{ borderColor: CAT[f.category] }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: CAT[f.category] }}>{CAT_LABEL[f.category]}</div>
            <p className="mt-0.5 text-[12px] leading-snug text-slate-200">{f.statement}</p>
            {f.rule && <p className="mt-1 text-[10.5px] text-slate-500">Rule: {f.rule}</p>}
            {f.limitations.map((l) => <p key={l} className="text-[10.5px] text-amber-200/70">⚠ {l}</p>)}
          </div>
        ))}
        {result.findings.length === 0 && <p className="text-[12px] text-slate-400">No findings generated for this result.</p>}
      </div>
      <details className="mt-3 text-[11px] text-slate-400">
        <summary className="cursor-pointer text-slate-300">Limitations & assumptions ({result.limitations.length + result.assumptions.length})</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">{[...result.limitations, ...result.assumptions].map((l) => <li key={l}>{l}</li>)}</ul>
      </details>
    </Panel>
  )
}
