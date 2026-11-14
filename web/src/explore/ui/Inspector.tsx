import { useMemo, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { EngineResult, Methodology, Registry } from '../lib/types'

function TeX({ src, block = true }: { src: string; block?: boolean }) {
  const html = useMemo(() => {
    try { return katex.renderToString(src, { displayMode: block, throwOnError: false }) } catch { return src }
  }, [src, block])
  return <div className="overflow-x-auto py-1 text-slate-100" dangerouslySetInnerHTML={{ __html: html }} />
}

const n = (v: unknown, d = 4) => (typeof v === 'number' ? (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(3) : v.toFixed(d)) : v == null ? 'null' : String(v))

function KV({ data }: { data: Record<string, unknown> }) {
  return (
    <table className="w-full text-[11.5px]"><tbody>
      {Object.entries(data).map(([k, v]) => (
        <tr key={k} className="border-b border-white/5 align-top">
          <td className="w-48 py-1 pr-3 font-mono text-slate-400">{k}</td>
          <td className="py-1 font-mono text-slate-100">{typeof v === 'object' && v !== null ? <pre className="whitespace-pre-wrap text-[10.5px]">{JSON.stringify(v, null, 1)}</pre> : n(v)}</td>
        </tr>
      ))}
    </tbody></table>
  )
}

function MathExecution({ result, cellId }: { result: EngineResult; cellId: string | null }) {
  if (!cellId) return <p className="text-slate-400">Select a cell on the map to see the computation executed for it.</p>
  const a = result.grid.cell_attributes[cellId] ?? {}
  if (result.methodology.id === 'analysis.trend_mk_sen') {
    if (a.status !== 'ok') return <p className="text-amber-300">Status: {String(a.status)} — {String(a.reason ?? '')}</p>
    const S = a.S as number, V = a.var_s as number, Z = a.Z as number
    return (
      <div className="space-y-2">
        <p className="text-slate-400">Values below are the backend's computed quantities for cell <span className="font-mono">{cellId}</span> (n = {String(a.n_used)} annual means, {String(a.years_first_last)}).</p>
        <TeX src={`r_1 = ${n(a.r1, 4)}\\quad\\text{bounds } [${n((a.r1_bounds as Record<string, number>)?.low, 3)},\\ ${n((a.r1_bounds as Record<string, number>)?.high, 3)}]\\ \\Rightarrow\\ \\text{correction: ${String(a.correction_applied)}}`} />
        <TeX src={`S=\\sum_{k<j}\\operatorname{sgn}(x_j-x_k) = ${S}`} />
        <TeX src={`\\operatorname{Var}(S)=\\frac{n(n-1)(2n+5)-\\sum_p t_p(t_p-1)(2t_p+5)}{18} = ${n(V, 2)}`} />
        <TeX src={`Z=\\frac{S-\\operatorname{sgn}(S)}{\\sqrt{\\operatorname{Var}(S)}}=\\frac{${S}-${S > 0 ? 1 : S < 0 ? -1 : 0}}{\\sqrt{${n(V, 2)}}} = ${n(Z, 4)}`} />
        <TeX src={`p = 2\\,(1-\\Phi(|Z|)) = ${n(a.p_value, 5)}\\qquad p_{BH} = ${n(a.p_bh, 5)}\\ (q=0.05)`} />
        <TeX src={`Q = \\operatorname{median}_{k<j}\\frac{x_j-x_k}{t_j-t_k} = ${n(a.slope_per_year, 5)}\\ \\text{${result.units.replace('/decade', '')}/yr} \\Rightarrow ${n(a.slope_per_decade, 4)}\\ \\text{/decade}`} />
        <TeX src={`\\text{95\\% CI (ordered-rank, }C_\\alpha=z_{0.975}\\sqrt{\\operatorname{Var}(S)}): [${n(a.ci_low_per_decade, 4)},\\ ${n(a.ci_high_per_decade, 4)}]\\ \\text{/decade}`} />
        <p className="text-[11px] text-slate-500">H₀: no monotonic trend · H₁: monotonic trend (two-sided) · α = 0.05 · METHODOLOGY_REFERENCE.md §5–§8, §11.3</p>
      </div>
    )
  }
  if (result.data_type === 'predicted') {
    const ph = (result.validation.per_horizon ?? {}) as Record<string, { selected_model: string; test: Record<string, { mae: number; rmse: number; bias: number; n: number }>; test_skill_vs_climatology: number; test_coverage_80: number; test_coverage_95: number; interval_quantiles_calibration: Record<string, number> }>
    return (
      <div>
        <TeX src={`\\hat y_{o+h} = \\bar y_{m(o+h)} + \\phi^h a_o \\quad\\text{(damped persistence)};\\qquad PI = \\hat y + [\\,q_{\\alpha/2}(r_h),\\ q_{1-\\alpha/2}(r_h)\\,]`} />
        <TeX src={`\\text{skill}_h = 1 - \\frac{MAE_{model}}{MAE_{climatology}}\\quad\\text{(held-out test origins 2018–2024)}`} />
        <table className="mt-2 w-full text-[11px]"><thead><tr className="text-slate-400"><th className="text-left">h</th><th className="text-left">selected</th><th>MAE</th><th>MAE clim</th><th>RMSE</th><th>bias</th><th>skill</th><th>cov80</th><th>cov95</th><th>n</th></tr></thead>
          <tbody className="font-mono">{Object.entries(ph).map(([h, v]) => { const t = v.test[v.selected_model]; return (
            <tr key={h} className="border-b border-white/5 text-center"><td className="text-left">{h}</td><td className="text-left">{v.selected_model}</td><td>{n(t.mae, 3)}</td><td>{n(v.test.climatology.mae, 3)}</td><td>{n(t.rmse, 3)}</td><td>{n(t.bias, 3)}</td><td>{n(v.test_skill_vs_climatology, 3)}</td><td>{n(v.test_coverage_80, 2)}</td><td>{n(v.test_coverage_95, 2)}</td><td>{t.n}</td></tr>) })}</tbody></table>
        <p className="mt-2 text-[11px] text-slate-500">Metrics pooled over 25 cells × rolling origins. Selection on calibration origins 2011–2017 only.</p>
      </div>
    )
  }
  if (result.data_type === 'simulated') {
    const p = (result.model?.parameters ?? {}) as Record<string, number>
    const st = result.grid.fields
    const v = (k: string) => (st[k]?.values[cellId] as number | null) ?? null
    return (
      <div>
        <TeX src={`CN = f\\cdot 98 + (1-f)\\,CN_p:\\quad CN_b = ${n(p.CN_baseline, 1)},\\ CN_s = ${n(p.CN_scenario, 1)}\\quad (CN_p=${p.CN_pervious})`} />
        <TeX src={`S = \\frac{25400}{CN} - 254:\\ S_b=${n(25400 / p.CN_baseline - 254, 2)}\\,\\text{mm},\\ S_s=${n(25400 / p.CN_scenario - 254, 2)}\\,\\text{mm};\\quad I_a=\\lambda S,\\ \\lambda=${p.lambda}`} />
        <TeX src={`Q=\\frac{(P-I_a)^2}{P-I_a+S}\\ (P>I_a):\\quad \\textstyle\\sum P = ${n(v('total_precip'), 1)},\\ \\sum Q_b=${n(v('total_runoff_baseline'), 1)},\\ \\sum Q_s=${n(v('total_runoff_scenario'), 1)}\\ \\text{mm}`} />
        <TeX src={`\\Delta Q = ${n(v('total_difference'), 1)}\\ \\text{mm}\\quad\\text{ensemble } [${n(v('diff_ens_low'), 1)},\\ ${n(v('diff_ens_high'), 1)}]`} />
        <p className="text-[11px] text-slate-500">S values shown are the documented closed form evaluated on the backend parameters; runoff totals are backend outputs. Not validated (no streamflow data).</p>
      </div>
    )
  }
  return <KV data={a} />
}

export function Inspector({ result, registry, cellId, onClose }: { result: EngineResult; registry: Registry | null; cellId: string | null; onClose: () => void }) {
  const [tab, setTab] = useState('method')
  const m: Methodology | undefined = registry?.methodologies.find((x) => x.id === result.methodology.id)
  const tabs = [['method', 'Methodology'], ['math', 'Mathematical execution'], ['data', 'Data diagnostics'], ['stats', 'Statistics & model'], ['trace', 'Execution trace'], ['registry', 'Registry']]
  return (
    <div className="pointer-events-auto absolute inset-x-3 bottom-3 z-40 max-h-[58vh] overflow-hidden rounded-xl border border-violet-400/40 bg-[#070a12]/96 shadow-[0_0_40px_rgba(139,92,246,0.25)] backdrop-blur">
      <div className="flex items-center gap-1 border-b border-white/10 px-3 py-1.5">
        <span className="mr-3 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300">Scientific Inspector</span>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded px-2 py-1 text-[11.5px] ${tab === k ? 'bg-violet-500/25 text-white' : 'text-slate-400 hover:text-white'}`}>{l}</button>
        ))}
        <span className="ml-auto font-mono text-[10.5px] text-slate-500">{result.result_id} · schema {result.schema_version} · {result.executed_at}</span>
        <button onClick={onClose} className="ml-3 text-slate-400 hover:text-white">✕</button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto p-4 text-[12px] text-slate-200">
        {tab === 'method' && (m ? (
          <div className="space-y-2">
            <div className="text-[14px] font-semibold text-white">{m.name} <span className="ml-2 rounded bg-white/10 px-1.5 font-mono text-[10.5px] text-slate-300">{m.id} · status: {m.status}</span></div>
            <p className="text-slate-300">{m.description}</p>
            {m.formula_latex && <TeX src={m.formula_latex} />}
            <KV data={{ reference: m.doc_ref, corpus_support: m.corpus_support, thresholds: m.thresholds ?? {}, assumptions: m.assumptions ?? [], interpretation_rules: m.interpretation ?? [], limitations: m.limitations ?? [], validation_note: m.validation_note ?? null }} />
            <KV data={result.methodology} />
          </div>
        ) : <p className="text-amber-300">No registry entry for methodology '{result.methodology.id}'.</p>)}
        {tab === 'math' && <MathExecution result={result} cellId={cellId} />}
        {tab === 'data' && <KV data={{ sources: result.sources, variable: result.variable, units: result.units, crs: result.crs, native_resolution: result.native_resolution, effective_resolution: result.effective_resolution, temporal_resolution: result.temporal_resolution, temporal_coverage: result.temporal_coverage, n_cells: result.grid.cells.length, n_times: result.grid.times.length, quality: result.quality }} />}
        {tab === 'stats' && <KV data={{ model: result.model, uncertainty: result.uncertainty, validation_status: result.validation.status, validation_scheme: result.validation.scheme ?? null, scenario: result.scenario, configuration: result.configuration, selected_cell_attributes: cellId ? result.grid.cell_attributes[cellId] ?? {} : 'select a cell' }} />}
        {tab === 'trace' && (
          <ol className="space-y-1">{result.trace.map((s, i) => (
            <li key={i} className="flex gap-3 font-mono text-[11.5px]"><span className="w-6 text-slate-500">{i + 1}.</span><span className={`w-40 ${s.status === 'ok' ? 'text-emerald-300' : 'text-amber-300'}`}>{s.step}</span><span className="w-20 text-right text-slate-500">{s.duration_ms ?? ''} ms</span><span className="flex-1 text-slate-200">{s.detail}</span></li>
          ))}<li className="flex gap-3 font-mono text-[11.5px]"><span className="w-6 text-slate-500">→</span><span className="w-40 text-cyan-300">map + graph render</span><span className="flex-1 text-slate-400">visualization engine (client) — no scientific computation</span></li></ol>
        )}
        {tab === 'registry' && registry && (
          <div>
            {!registry.registry_in_sync_with_doc && <p className="mb-2 text-amber-300">⚠ {registry.sync_warning}</p>}
            <table className="w-full text-[11.5px]"><tbody>{registry.methodologies.map((x) => (
              <tr key={x.id} className="border-b border-white/5 align-top"><td className="py-1 pr-3 font-mono text-slate-400">{x.id}</td><td className="py-1 pr-3">{x.name}</td><td className={`py-1 pr-3 font-mono ${x.status.startsWith('implemented_and') ? 'text-emerald-300' : x.status.startsWith('implemented') ? 'text-amber-200' : 'text-slate-500'}`}>{x.status}</td><td className="py-1 text-slate-400">{x.missing_specification ?? x.doc_ref}</td></tr>
            ))}</tbody></table>
          </div>
        )}
      </div>
    </div>
  )
}
