import { Area, Bar, CartesianGrid, ComposedChart, Legend as RLegend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Fragment, type ReactElement, type ReactNode } from 'react'
import type { EngineResult, FieldSpec } from '../lib/types'
import { valueAt } from '../lib/color'
import { Panel, TypeBadge } from './Panel'

interface Props {
  result: EngineResult
  cellId: string
  field: string
  timeIndex: number
  onTime: (i: number) => void
  onClose: () => void
}

const AX = { stroke: '#64748b', fontSize: 10.5 }
const TT = { contentStyle: { background: '#0b1220', border: '1px solid #334155', fontSize: 11.5 }, labelStyle: { color: '#e2e8f0' } }

function series(f: FieldSpec | undefined, cid: string): (number | null)[] {
  const v = f?.values[cid]
  return Array.isArray(v) ? v : []
}

function fmt(v: unknown, d = 3): string {
  if (v == null) return '—'
  if (typeof v === 'number') return Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(2) : v.toFixed(d)
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  return String(v)
}

function exportCsv(result: EngineResult, cid: string) {
  const ts = Object.entries(result.grid.fields).filter(([, f]) => f.kind === 'time_series')
  const st = Object.entries(result.grid.fields).filter(([, f]) => f.kind === 'static')
  const head = [
    `# BhuVyom export — ${result.title}`, `# result_id ${result.result_id} · data_type ${result.data_type} · engine ${result.engine_name}`,
    `# cell ${cid}`, `# sources ${result.sources.map((s) => String(s.product ?? s.dataset_id)).join('; ')}`,
    `# methodology ${result.methodology.id} (${String(result.methodology.doc_ref ?? '')})`, `# resolution ${result.effective_resolution}`,
    ...result.limitations.map((l) => `# limitation: ${l}`),
    ...st.map(([k, f]) => `# ${k} [${f.unit}] = ${valueAt(f, cid, 0) ?? ''}`),
  ]
  const rows = [['time', ...ts.map(([k, f]) => `${k} [${f.unit}]`)].join(',')]
  result.grid.times.forEach((t, i) => rows.push([t, ...ts.map(([, f]) => series(f, cid)[i] ?? '')].join(',')))
  const blob = new Blob([[...head, ...rows].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `bhuvyom_${result.variable}_${cid}.csv`
  a.click()
}

export function CellPanel({ result, cellId, field, timeIndex, onTime, onClose }: Props) {
  const F = result.grid.fields
  const cell = result.grid.cells.find((c) => c.id === cellId)
  const attrs = result.grid.cell_attributes[cellId] ?? {}
  const times = result.grid.times
  const onClick = (e: unknown) => {
    const idx = (e as { activeTooltipIndex?: number | string } | null)?.activeTooltipIndex
    if (idx != null && Number.isFinite(+idx)) onTime(+idx)
  }
  let chart: ReactNode = null
  let title = ''

  if (result.data_type === 'predicted') {
    title = `Observed vs forecast · ${F.forecast.unit}`
    const d = times.map((t, i) => ({ t, observed: series(F.observed, cellId)[i], forecast: series(F.forecast, cellId)[i], climatology: series(F.climatology, cellId)[i],
      pi80: series(F.pi80_low, cellId)[i] == null ? null : [series(F.pi80_low, cellId)[i], series(F.pi80_high, cellId)[i]],
      pi95: series(F.pi95_low, cellId)[i] == null ? null : [series(F.pi95_low, cellId)[i], series(F.pi95_high, cellId)[i]] }))
    chart = (
      <ComposedChart data={d} onClick={onClick}>
        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="t" tick={AX} minTickGap={24} /><YAxis tick={AX} width={38} /><Tooltip {...TT} />
        <Area dataKey="pi95" stroke="none" fill="#a78bfa" fillOpacity={0.15} name="95% PI" isAnimationActive={false} />
        <Area dataKey="pi80" stroke="none" fill="#a78bfa" fillOpacity={0.3} name="80% PI" isAnimationActive={false} />
        <Line dataKey="climatology" stroke="#64748b" strokeDasharray="4 3" dot={false} name="Climatology" isAnimationActive={false} />
        <Line dataKey="observed" stroke="#22d3ee" dot={false} strokeWidth={1.6} name="Observed" connectNulls={false} isAnimationActive={false} />
        <Line dataKey="forecast" stroke="#c4b5fd" strokeWidth={2} dot={{ r: 2 }} name="Forecast" isAnimationActive={false} />
        <ReferenceLine x={times[timeIndex]} stroke="#f8fafc" strokeOpacity={0.5} /><RLegend wrapperStyle={{ fontSize: 11 }} />
      </ComposedChart>
    )
  } else if (result.data_type === 'simulated') {
    title = 'Rainfall forcing vs simulated runoff · mm/day'
    const d = times.map((t, i) => ({ t, P: series(F.precipitation, cellId)[i], baseline: series(F.runoff_baseline, cellId)[i], scenario: series(F.runoff_scenario, cellId)[i] }))
    chart = (
      <ComposedChart data={d} onClick={onClick}>
        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="t" tick={AX} minTickGap={30} /><YAxis tick={AX} width={34} /><Tooltip {...TT} />
        <Bar dataKey="P" fill="#38bdf8" fillOpacity={0.45} name="Precipitation (GPM, observed)" isAnimationActive={false} />
        <Line dataKey="baseline" stroke="#94a3b8" dot={false} name="Runoff baseline (simulated)" isAnimationActive={false} />
        <Line dataKey="scenario" stroke="#fb923c" dot={false} strokeWidth={1.8} name="Runoff scenario (simulated)" isAnimationActive={false} />
        <ReferenceLine x={times[timeIndex]} stroke="#f8fafc" strokeOpacity={0.5} /><RLegend wrapperStyle={{ fontSize: 11 }} />
      </ComposedChart>
    )
  } else if (F.annual_mean) {
    title = `Annual mean + Sen trend line · ${F.annual_mean.unit}`
    const d = times.map((t, i) => ({ t, annual: series(F.annual_mean, cellId)[i], trend: series(F.trend_line, cellId)[i] }))
    chart = (
      <ComposedChart data={d}>
        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="t" tick={AX} minTickGap={20} /><YAxis tick={AX} width={38} domain={['auto', 'auto']} /><Tooltip {...TT} />
        <Line dataKey="annual" stroke="#818cf8" dot={{ r: 1.8 }} name="Annual mean (MERRA-2)" isAnimationActive={false} />
        <Line dataKey="trend" stroke="#f472b6" strokeDasharray="6 3" dot={false} name="Sen slope line" isAnimationActive={false} /><RLegend wrapperStyle={{ fontSize: 11 }} />
      </ComposedChart>
    )
  } else if (F.lst_day) {
    title = 'Clear-sky LST · °C (gaps = cloud / QC-rejected)'
    const d = times.map((t, i) => ({ t, day: series(F.lst_day, cellId)[i], night: series(F.lst_night, cellId)[i] }))
    chart = (
      <ComposedChart data={d} onClick={onClick}>
        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="t" tick={AX} minTickGap={30} /><YAxis tick={AX} width={30} domain={['auto', 'auto']} /><Tooltip {...TT} />
        <Line dataKey="day" stroke="#f97316" dot={{ r: 1.5 }} connectNulls={false} name="Day LST" isAnimationActive={false} />
        <Line dataKey="night" stroke="#60a5fa" dot={{ r: 1.5 }} connectNulls={false} name="Night LST" isAnimationActive={false} />
        <ReferenceLine x={times[timeIndex]} stroke="#f8fafc" strokeOpacity={0.5} /><RLegend wrapperStyle={{ fontSize: 11 }} />
      </ComposedChart>
    )
  } else if (F.precipitation) {
    title = 'Daily precipitation · mm/day'
    const d = times.map((t, i) => ({ t, P: series(F.precipitation, cellId)[i] }))
    chart = (
      <ComposedChart data={d} onClick={onClick}>
        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="t" tick={AX} minTickGap={30} /><YAxis tick={AX} width={30} /><Tooltip {...TT} />
        <Bar dataKey="P" fill="#38bdf8" name="IMERG precipitation" isAnimationActive={false} />
        <ReferenceLine x={times[timeIndex]} stroke="#f8fafc" strokeOpacity={0.6} />
      </ComposedChart>
    )
  } else if (F[field]?.kind === 'time_series') {
    const f = F[field]
    title = `${f.label} · ${f.unit}`
    const d = times.map((t, i) => ({ t, v: series(f, cellId)[i] }))
    chart = (
      <ComposedChart data={d} onClick={onClick}>
        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="t" tick={AX} minTickGap={24} /><YAxis tick={AX} width={34} domain={['auto', 'auto']} /><Tooltip {...TT} />
        <Line dataKey="v" stroke="#34d399" dot={{ r: 2.5 }} connectNulls={false} name={f.label} isAnimationActive={false} />
        <ReferenceLine x={times[timeIndex]} stroke="#f8fafc" strokeOpacity={0.6} />
      </ComposedChart>
    )
  } else {
    // static field: distribution across all cells, selected cell marked
    const f = F[field]
    const vals = Object.values(f.values).filter((v): v is number => typeof v === 'number')
    const lo = Math.min(...vals), hi = Math.max(...vals), nb = 24, w = (hi - lo) / nb || 1
    const bins = Array.from({ length: nb }, (_, i) => ({ x: +(lo + (i + 0.5) * w).toFixed(2), n: 0 }))
    vals.forEach((v) => bins[Math.min(nb - 1, Math.floor((v - lo) / w))].n++)
    const sel = valueAt(f, cellId, 0)
    title = `Distribution across ${vals.length} cells · ${f.unit}`
    chart = (
      <ComposedChart data={bins}>
        <CartesianGrid stroke="#1e293b" /><XAxis dataKey="x" tick={AX} /><YAxis tick={AX} width={30} /><Tooltip {...TT} />
        <Bar dataKey="n" fill="#818cf8" name="cells" isAnimationActive={false} />
        {sel != null && <ReferenceLine x={bins[Math.min(nb - 1, Math.floor((sel - lo) / w))].x} stroke="#f8fafc" label={{ value: 'selected', fill: '#f8fafc', fontSize: 10 }} />}
      </ComposedChart>
    )
  }

  const statics = Object.entries(F).filter(([, f]) => f.kind === 'static')
  return (
    <Panel title="Selected cell" right={<div className="flex items-center gap-2"><TypeBadge type={result.data_type} /><button onClick={onClose} className="text-slate-400 hover:text-white">✕</button></div>}>
      <div className="text-[12px] text-slate-300">{cellId}{cell && <span className="text-slate-500"> · {cell.center[1].toFixed(3)}°N, {cell.center[0].toFixed(3)}°E</span>}{cell?.is_city_cell && <span className="ml-2 rounded bg-sky-500/20 px-1.5 text-[10.5px] text-sky-300">Bengaluru city cell</span>}</div>
      <div className="mt-2 text-[11px] text-slate-400">{title}</div>
      <div className="mt-1 h-56"><ResponsiveContainer>{chart as ReactElement}</ResponsiveContainer></div>
      {statics.length > 0 && (
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11.5px]">
          {statics.map(([k, f]) => (<Fragment key={k}><dt className="text-slate-400">{f.label}</dt><dd className="text-right font-mono text-slate-100">{fmt(valueAt(f, cellId, 0))} <span className="text-slate-500">{f.unit}</span></dd></Fragment>))}
          {'p_value' in attrs && (<><dt className="text-slate-400">MK p-value · BH-adjusted</dt><dd className="text-right font-mono text-slate-100">{fmt(attrs.p_value)} · {fmt(attrs.p_bh)}</dd></>)}
          {'correction_applied' in attrs && (<><dt className="text-slate-400">Autocorrelation treatment</dt><dd className="text-right font-mono text-slate-100">{String(attrs.correction_applied)}</dd></>)}
        </dl>
      )}
      <div className="mt-3 flex gap-2">
        <button onClick={() => exportCsv(result, cellId)} className="rounded-md border border-white/10 px-2.5 py-1 text-[11.5px] text-slate-300 hover:border-cyan-400/50 hover:text-white">Export CSV (with provenance)</button>
      </div>
    </Panel>
  )
}
