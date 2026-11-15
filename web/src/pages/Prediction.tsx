import { useEffect, useState, type ReactNode } from 'react'
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Nav } from '../components/Nav'
import { Badge, Footer, Notice } from '../components/ui'
import { getJson } from '../lib/api'
import type { CellGroup, ExperimentList, Group, Performance } from '../lib/prediction'

const NAV = [{ label: 'Home', to: '/' }, { label: 'Explorer', to: '/explore' }, { label: 'Prediction Engine', to: '/prediction' }]
const button = 'rounded-full border border-white/20 px-4 py-2 text-sm hover:border-cyan focus-visible:outline-2 focus-visible:outline-cyan disabled:opacity-40'
const field = 'mt-2 w-full rounded-xl border border-white/20 bg-[#101116] px-3 py-3 text-sm text-ink'
const tip = { background: '#101116', border: '1px solid #555', borderRadius: 12, color: '#eee' }
const fmt = (v: number | null | undefined, digits = 3) => v == null ? 'Unavailable' : v.toFixed(digits)

function useResource<T>(path: string | null, refresh: number) {
  const key = `${path}:${refresh}`
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key: '', data: null, error: null })
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    getJson<T>(path, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setState({ key, data, error: null }) })
      .catch((e: Error) => { if (!controller.signal.aborted) setState({ key, data: null, error: e.message }) })
    return () => controller.abort()
  }, [path, key])
  return { data: state.key === key ? state.data : null, error: state.key === key ? state.error : null, busy: !!path && state.key !== key }
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return <label className="block text-sm text-ink-2">{label}<select className={field} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select></label>
}

function Chart({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return <section className="card min-w-0 p-6"><h2 className="font-display text-xl">{title}</h2><p className="mb-6 mt-2 text-xs leading-relaxed text-ink-3">{note}</p><div className="h-72" role="img" aria-label={title}>{children}</div></section>
}

function GroupTable({ title, groups, unit }: { title: string; groups: Group[]; unit: string }) {
  return <section className="card min-w-0 overflow-x-auto p-6"><h2 className="mb-4 font-display text-xl">{title}</h2><table className="w-full text-left text-xs"><caption className="sr-only">MAE, RMSE and bias in {unit}; null metrics indicate insufficient support</caption><thead><tr className="border-b border-white/10 text-ink-3">{['Group', 'Pairs', 'MAE', 'RMSE', 'Bias'].map((h) => <th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead><tbody>{groups.map((g) => <tr key={g.group} className="border-b border-white/5"><th scope="row" className="p-2 font-normal">{g.group}</th><td className="p-2">{g.n}</td><td className="p-2">{fmt(g.mae)}</td><td className="p-2">{fmt(g.rmse)}</td><td className="p-2">{fmt(g.bias)}</td></tr>)}</tbody></table><p className="mt-4 text-xs text-ink-4">Units: {unit}. Small seasonal and monthly groups are descriptive; no significance claim is made.</p></section>
}

function ErrorMap({ cells, onPick, selected, metric }: { cells: CellGroup[]; onPick: (id: string) => void; selected: string; metric: 'mae' | 'bias' | 'mean_width_80' }) {
  const points = cells.flatMap((g) => g.cell.polygon)
  if (!points.length) return <Notice>No acquired grid geometry is available.</Notice>
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1])
  const minX = Math.min(...xs), maxY = Math.max(...ys)
  const dx = Math.max(...xs) - minX || 1, dy = maxY - Math.min(...ys) || 1
  const scale = Math.min(490 / dx, 240 / dy)
  const left = (550 - dx * scale) / 2, top = (300 - dy * scale) / 2
  const maximum = Math.max(...cells.map((g) => Math.abs(g[metric] ?? 0)), .001)
  return <svg viewBox="0 0 550 300" className="w-full" role="group" aria-label="Native NASA POWER grid error map; choose a cell to filter the dashboard">
    {cells.map((g) => {
      const v = g[metric], strength = Math.abs(v ?? 0) / maximum
      const color = v == null ? '#24242a' : metric === 'bias' && v < 0 ? `hsl(202 65% ${65 - strength * 30}%)` : `hsl(${190 - strength * 170} 65% 55%)`
      const choose = () => onPick(selected === g.group ? '' : g.group)
      return <g key={g.group} role="button" tabIndex={0} aria-label={`${g.group}, ${metric} ${fmt(v)}, ${g.n} matched pairs${v == null ? ', insufficient support' : ''}`} aria-pressed={selected === g.group} onClick={choose} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose() } }} className="cursor-pointer focus-visible:outline-2 focus-visible:outline-cyan">
        <title>{g.group}: {metric} {fmt(v)}; n={g.n}. No neighbourhood resolution.</title><polygon points={g.cell.polygon.map(([x, y]) => `${left + (x - minX) * scale},${top + (maxY - y) * scale}`).join(' ')} fill={color} stroke={selected === g.group ? '#fff' : '#555'} strokeWidth={selected === g.group ? 3 : 1} />
        <text x={left + (g.cell.center[0] - minX) * scale} y={top + (maxY - g.cell.center[1]) * scale} textAnchor="middle" fill="#fff" fontSize={12} pointerEvents="none">{fmt(v)}</text>
      </g>
    })}
  </svg>
}

export default function Prediction() {
  const [variable, setVariable] = useState('T2M')
  const [runId, setRunId] = useState('')
  const [dataset, setDataset] = useState('validation')
  const [horizon, setHorizon] = useState('1')
  const [gridId, setGridId] = useState('')
  const [mapMetric, setMapMetric] = useState<'mae' | 'bias' | 'mean_width_80'>('mae')
  const [refresh, setRefresh] = useState(0)
  const [action, setAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const list = useResource<ExperimentList>(`/api/prediction/experiments?var=${variable}`, refresh)
  const run = list.data?.experiments.find((r) => r.run_id === runId) ?? list.data?.experiments[0]
  const query = new URLSearchParams({ dataset, horizon, ...(gridId ? { grid_id: gridId } : {}) })
  const performance = useResource<Performance>(run ? `/api/prediction/experiments/${run.run_id}/performance?${query}` : null, refresh)
  const data = performance.data
  const testOpened = !!run?.test_opened
  const champion = list.data?.promotion_events.at(-1)?.run_id
  const operate = async (label: string, path: string) => {
    setAction(label); setActionError(null)
    try { await getJson(path, { method: 'POST' }); setRefresh((r) => r + 1) } catch (e) { setActionError((e as Error).message) } finally { setAction(null) }
  }
  const exportRecords = async () => {
    if (!run) return
    setAction('Exporting records'); setActionError(null)
    try {
      const records: unknown[] = []
      let offset = 0, total = Infinity
      while (offset < total) {
        const page = await getJson<{ records: unknown[]; total: number }>(`/api/prediction/experiments/${run.run_id}/records?${query}&offset=${offset}&limit=5000`)
        total = page.total
        if (!page.records.length) break
        records.push(...page.records); offset += page.records.length
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify({ run_id: run.run_id, dataset, horizon, gridId, records }, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = `prediction-${variable}-${dataset}-h${horizon}.json`; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setActionError((e as Error).message) } finally { setAction(null) }
  }
  const forecast = data?.forecast.filter((r) => !gridId || r.grid_id === gridId) ?? []
  return <div className="min-w-[320px] overflow-hidden bg-black text-ink">
    <Nav items={NAV} right={<span className="hidden xl:block"><Badge outline>NASA POWER / MONTHLY</Badge></span>} />
    <main className="container-x space-y-8 pb-16 pt-[160px]">
      <header><p className="eyebrow">PREDICTION ENGINE</p><h1 className="h-section">FORECAST.<br />VERIFY. IMPROVE.</h1><p className="mt-6 max-w-3xl text-sm leading-relaxed text-ink-3">Every score comes from a saved forecast matched to a withheld NASA observation. Inspect development results, the sealed final test, regional errors and interval coverage separately.</p></header>
      <Notice>Retrospective NASA reanalysis backtesting with an assumed two-month input lag. Historical release vintages are unavailable, so these results do not establish real-time forecasting skill. Bengaluru is represented by one coarse grid cell in the current archive.</Notice>
      <div className="card grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <Select label="Environmental variable" value={variable} onChange={(v) => { setVariable(v); setRunId(''); setGridId(''); setDataset('validation') }}><option value="T2M">Air temperature - T2M</option><option value="PRECTOTCORR">Precipitation - PRECTOTCORR</option></Select>
        <Select label="Evaluation dataset" value={dataset} onChange={(v) => { setDataset(v); setMapMetric('mae') }}><option value="validation">Validation - used for selection</option><option value="calibration">Calibration - interval residuals</option><option value="independent_test" disabled={!testOpened}>Independent test{!testOpened ? ' - sealed' : ''}</option><option value="interval_repair" disabled={!run?.interval_repair_available}>Interval audit replay - not a fresh test</option></Select>
        <Select label="Forecast horizon" value={horizon} onChange={setHorizon}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} month{i ? 's' : ''}</option>)}</Select>
        <Select label="Experiment version" value={run?.run_id ?? ''} onChange={(id) => { setRunId(id); setDataset('validation'); setGridId('') }}>{!run && <option value="">No completed experiments</option>}{list.data?.experiments.map((r) => <option key={r.run_id} value={r.run_id}>{r.experiment_version} / {r.created_at.slice(0, 16)} / {r.run_id.slice(0, 8)}</option>)}</Select>
      </div>
      <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={!!action} onClick={() => operate('Training development run', `/api/prediction/experiments?var=${variable}`)}>Train development run</button>{run && <><button className={button} disabled={!!action || testOpened} onClick={() => operate('Evaluating sealed final test', `/api/prediction/experiments/${run.run_id}/test`)}>{testOpened ? 'Independent test recorded' : 'Evaluate sealed test once'}</button><button className={button} disabled={!!action || !testOpened} onClick={() => operate('Auditing archived interval timing', `/api/prediction/experiments/${run.run_id}/interval-audit`)}>Audit interval timing</button><button className={button} disabled={!!action || champion === run.run_id} onClick={() => operate('Checking promotion criteria', `/api/prediction/experiments/${run.run_id}/promote`)}>{champion === run.run_id ? 'Promoted model' : 'Check promotion criteria'}</button><button className={button} disabled={!!action || !data} onClick={exportRecords}>Download matched records</button></>}<button className={button} disabled={!!action} onClick={() => setRefresh((r) => r + 1)}>Refresh</button></div>
      <p className="text-xs leading-relaxed text-ink-4">Training does not open the test or replace the promoted model. Opening the final test locks that holdout against further model development. Promotion uses predefined validation improvement and regression checks.</p>
      <div aria-live="polite">{(list.busy || performance.busy || action) && <p className="text-sm text-cyan">{action ?? 'Loading recorded evaluations'}...</p>}{(list.error || performance.error || actionError) && <Notice>{list.error ?? performance.error ?? actionError}</Notice>}{!list.busy && !list.error && !run && <Notice>No experiment has been completed for this variable. Acquire NASA monthly observations and train a development run. Metrics remain blank until predictions have been saved and evaluated.</Notice>}</div>
      {run && <section className="grid gap-4 md:grid-cols-3">{Object.entries(run.periods).map(([name, period]) => <div key={name} className="card p-5"><p className="text-xs uppercase tracking-widest text-ink-3">{name.replaceAll('_', ' ')}</p><p className="mt-3 font-display text-xl">{period.start} to {period.end}</p><p className="mt-2 text-xs text-ink-4">{name === 'validation' ? 'Walk-forward model selection' : name === 'calibration' ? 'Separate residual interval calibration' : testOpened ? 'Fixed-origin test; selected model only' : 'Sealed; no metrics exposed'}</p></div>)}</section>}
      {data && run && <>
        {data.interval_audit.status === 'invalid_archived_interval_timing' && <Notice>The original archived test interval scores failed an availability audit and are suppressed. Point predictions are unchanged. Choose “Interval audit replay” for repaired coverage, labelled as retrospective rather than a fresh independent test.</Notice>}
        <section aria-label="Performance overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{[
          ['MAE', fmt(data.metrics.mae), data.unit], ['RMSE', fmt(data.metrics.rmse), data.unit], ['Bias', fmt(data.metrics.bias), 'prediction - observation'], ['R-squared', fmt(data.metrics.r2), 'may be negative; null for constant observations'], ['Matched pairs', String(data.metrics.n), `${dataset} / ${horizon} month horizon`], ['Selected model', run.selected_by_horizon[horizon]?.replaceAll('_', ' '), 'Chosen on validation only'],
        ].map(([label, value, note]) => <div key={label} className="card min-w-0 p-5"><p className="text-xs text-ink-3">{label}</p><p className="grad-text my-3 break-words font-display text-2xl">{value}</p><p className="text-xs leading-relaxed text-ink-4">{note}</p></div>)}</section>
        {data.metrics.n < 24 && <Notice>This selection has only {data.metrics.n} matched pairs. Overview metrics are descriptive; grid metrics require at least {data.minimum_grid_pairs} pairs. Counts across overlapping horizons and nearby cells are not independent samples.</Notice>}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card min-w-0 p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-xl">Geographical performance</h2><div className="flex gap-3"><button className={button} aria-pressed={mapMetric === 'mae'} onClick={() => setMapMetric('mae')}>MAE</button><button className={button} aria-pressed={mapMetric === 'bias'} onClick={() => setMapMetric('bias')}>Bias</button><button className={button} disabled={!data.metrics.interval_n} aria-pressed={mapMetric === 'mean_width_80'} onClick={() => setMapMetric('mean_width_80')}>Interval width</button></div></div><p className="my-3 text-xs leading-relaxed text-ink-3">Native NASA POWER cells / {data.unit}. One cell covers Bengaluru; the display does not resolve neighbourhood errors. Grey means insufficient support or unavailable intervals; width maps require at least 24 interval evaluation pairs. Select a cell to filter.</p><ErrorMap cells={data.cells} selected={gridId} onPick={setGridId} metric={mapMetric} />{gridId && <button className={button} onClick={() => setGridId('')}>Clear cell selection</button>}<p className="mt-4 text-xs text-ink-4">{data.notice}</p></section>
          <Chart title="Actual versus predicted" note={`Target month at the selected ${horizon}-month horizon. Mean across the selected acquired cells. Unit: ${data.unit}.`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.timeline}><CartesianGrid stroke="#24242a" /><XAxis dataKey="target" minTickGap={35} tick={{ fontSize: 10 }} /><YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} /><Tooltip contentStyle={tip} /><Legend /><Line dataKey="actual" name="NASA observation" stroke="#bbb" dot={false} /><Line dataKey="predicted" name="Saved prediction" stroke="#7FE0F0" dot={false} strokeWidth={2} /></ComposedChart></ResponsiveContainer></Chart>
          <Chart title="Signed error distribution" note={`Error = observation - prediction (${data.unit}). Negative means overprediction; bias uses the opposite sign.`}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.error_distribution}><CartesianGrid stroke="#24242a" /><XAxis dataKey="bin" hide /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip contentStyle={tip} /><Bar dataKey="count" name="Matched records" fill="#9A86B8" /></BarChart></ResponsiveContainer></Chart>
          <Chart title="Temporal error trend" note={`Mean absolute error at each target month, in ${data.unit}. Inspect seasons and years in the tables below.`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={data.timeline}><CartesianGrid stroke="#24242a" /><XAxis dataKey="target" minTickGap={35} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip contentStyle={tip} /><Legend /><Line dataKey="mae" name="Absolute error" stroke="#E9A15A" dot={false} /><Line dataKey="signed_error" name="Observation - prediction" stroke="#7FE0F0" dot={false} /><ReferenceLine y={0} stroke="#777" /></ComposedChart></ResponsiveContainer></Chart>
        </div>
        <Chart title="Performance across forecast horizons" note={`Same evaluation dataset, all acquired cells. RMSE and MAE in ${data.unit}. Each horizon shows its own sample count in the accompanying records; this chart ignores the cell filter.`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={[...data.horizons].sort((a, b) => Number(a.group) - Number(b.group))}><CartesianGrid stroke="#24242a" /><XAxis dataKey="group" label={{ value: 'Horizon (months)', position: 'insideBottom', offset: -2 }} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip contentStyle={tip} /><Legend /><Line dataKey="mae" name="MAE" stroke="#7FE0F0" /><Line dataKey="rmse" name="RMSE" stroke="#E9A15A" /></ComposedChart></ResponsiveContainer></Chart>
        <div className="grid gap-6 md:grid-cols-2"><GroupTable title="Regional bias and error" groups={data.regional} unit={data.unit} /><GroupTable title="Seasons - DJF / MAM / JJAS / ON" groups={data.seasons} unit={data.unit} /><GroupTable title="Calendar months" groups={data.months} unit={data.unit} /><GroupTable title="Environmental conditions" groups={data.conditions} unit={data.unit} /><GroupTable title="Error by evaluation year" groups={data.years} unit={data.unit} /><GroupTable title="Native grid cells" groups={data.cells} unit={data.unit} /></div>
        <section className="card space-y-5 p-6"><h2 className="font-display text-2xl">Uncertainty and calibration</h2><p className="text-sm leading-relaxed text-ink-3">{data.uncertainty} Residual intervals are empirical and have no guaranteed future coverage under changing climate or temporal dependence.</p><div className="grid gap-5 sm:grid-cols-4">{[['80% interval coverage', data.metrics.coverage_80 == null ? 'Unavailable' : `${fmt(data.metrics.coverage_80 * 100, 1)}%`], ['95% interval coverage', data.metrics.coverage_95 == null ? 'Unavailable' : `${fmt(data.metrics.coverage_95 * 100, 1)}%`], ['Interval evaluation pairs', String(data.metrics.interval_n)], ['Mean 80% interval width', `${fmt(data.metrics.mean_width_80)} ${data.unit}`]].map(([label, value]) => <div key={label}><p className="text-xs text-ink-4">{label}</p><p className="mt-2 font-display text-xl">{value}</p></div>)}</div><p className="text-xs text-ink-4">Pinball losses at 0.10 / 0.90: {fmt(data.metrics.pinball_10)} / {fmt(data.metrics.pinball_90)}. Interval calibration uses {run.interval_calibration_counts[horizon] ?? 0} residuals at this horizon. Measurement uncertainty and climate-scenario uncertainty are excluded.</p></section>
        <Chart title="Archived-origin forecast with residual intervals" note={`Issued ${forecast[0]?.forecast_origin ?? 'unavailable'} using the archived input snapshot. This is not a current weather forecast. For multiple acquired cells, the record export preserves individual outputs.`}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={forecast.filter((r) => r.grid_id === (gridId || forecast[0]?.grid_id)).map((r) => ({ ...r, range: r.pi80_low == null || r.pi80_high == null ? null : [r.pi80_low, r.pi80_high] }))}><CartesianGrid stroke="#24242a" /><XAxis dataKey="target_timestamp" minTickGap={30} tick={{ fontSize: 10 }} /><YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} /><Tooltip contentStyle={tip} /><Legend /><Area dataKey="range" name="Empirical 80% interval" fill="#7FE0F0" fillOpacity={.15} stroke="none" /><Line dataKey="predicted_value" name="Point forecast" stroke="#7FE0F0" dot /></ComposedChart></ResponsiveContainer></Chart>
        <section className="card overflow-x-auto p-6"><h2 className="mb-5 font-display text-2xl">Model evolution - validation comparison</h2><p className="mb-5 text-xs leading-relaxed text-ink-3">All candidates are compared on the same chronological validation partition at horizon {horizon}. Baselines, ridge feature engineering and gradient boosting retain their own versions and hyperparameters. A candidate must improve MAE by at least 2%, avoid more than 5% RMSE regression, and pass seasonal and bias checks. Test scores are excluded from selection.</p><table className="w-full text-left text-xs"><thead><tr className="border-b border-white/10">{['Candidate', 'Version', 'Pairs', 'MAE', 'RMSE', 'Bias', 'R-squared', 'Selection gates'].map((h) => <th key={h} scope="col" className="p-3">{h}</th>)}</tr></thead><tbody>{Object.entries(data.comparisons[horizon] ?? {}).map(([name, model]) => <tr key={name} className="border-b border-white/5"><th scope="row" className="p-3 font-normal">{name}{run.selected_by_horizon[horizon] === name ? ' - selected' : ''}</th><td className="p-3">{model.version}</td><td className="p-3">{model.n}</td><td className="p-3">{fmt(model.mae)}</td><td className="p-3">{fmt(model.rmse)}</td><td className="p-3">{fmt(model.bias)}</td><td className="p-3">{fmt(model.r2)}</td><td className="p-3">{name === 'climatology' ? 'Baseline fallback' : model.passes_validation_gates ? 'Passed' : 'Not passed'}</td></tr>)}</tbody></table></section>
        <details className="card space-y-4 p-6"><summary className="cursor-pointer text-sm text-cyan">Experiment provenance, features, preprocessing and limitations</summary><p className="break-all text-xs text-ink-3">Run {run.run_id} / Dataset SHA-256 {run.dataset_sha256} / {run.protocol}</p><p className="text-xs text-ink-3">Initial training: {run.training_period.start} to {run.training_period.end}. Every record also includes its actual refit cutoff, available-input cutoff, origin and target.</p><pre className="overflow-x-auto whitespace-pre-wrap text-xs text-ink-3">{JSON.stringify({ features: run.features, preprocessing: run.preprocessing, candidates_and_hyperparameters: run.candidates }, null, 2)}</pre><ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-ink-3">{run.limitations.map((l) => <li key={l}>{l}</li>)}</ul></details>
      </>}
      <Footer credit={false} links={NAV} />
    </main>
  </div>
}
