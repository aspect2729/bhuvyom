import { useEffect, useMemo, useRef, useState } from 'react'
import { Nav } from '../components/Nav'
import { SplitMap } from '../components/SplitMap'
import { Badge, CtaLink, Footer, Notice, RangeSlider } from '../components/ui'
import { EngineError, api, type LabResult } from '../lib/api'
import { RAMPS, fmtNum, ramp, rampCss } from '../lib/ramp'

type Mode = 'heat' | 'runoff' | 'air'
const MODES: [Mode, string, string][] = [['heat', 'Urban heat', 'Not modelled'], ['runoff', 'Rain runoff', 'Storms · ground cover'], ['air', 'Air flow', 'Not modelled']]
const SEASONS = [['summer', 'Summer'], ['monsoon', 'Monsoon'], ['winter', 'Winter']]
const START = { intensity: 40, duration: 3, permeable: 45 }
const TODAY_PERMEABLE = 40 // assumption — shown as such
const NAV = [{ label: 'Home', to: '/' }, { label: 'Simulation Lab', to: '/lab' }, { label: 'Future Earth', to: '/future' }]

export default function Lab() {
  const [mode, setMode] = useState<Mode>('runoff')
  const [v, setV] = useState(START)
  const [split, setSplit] = useState(50)
  const [res, setRes] = useState<LabResult | null>(null)
  const [boundary, setBoundary] = useState<GeoJSON.FeatureCollection | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [runs, setRuns] = useState(0)
  const [busy, setBusy] = useState(false)
  const t = useRef(0)

  useEffect(() => { api.boundary().then(setBoundary).catch(() => undefined) }, [])
  const run = (q = v) => {
    setBusy(true)
    api.lab({ intensity: q.intensity, duration: q.duration, permeable: q.permeable / 100 })
      .then((r) => { setRes(r); setErr(null) })
      .catch((e) => setErr(e instanceof EngineError ? e.detail.reason : String(e)))
      .finally(() => setBusy(false))
  }
  useEffect(() => { window.clearTimeout(t.current); t.current = window.setTimeout(() => run(v), 160); return () => window.clearTimeout(t.current) }, [v]) // eslint-disable-line react-hooks/exhaustive-deps

  const live = mode === 'runoff'
  const mx = useMemo(() => (res ? Math.max(1, ...res.cells.map((c) => Math.max(c.today_mm ?? 0, c.scenario_mm ?? 0))) : 1), [res])
  const col = (x: number | null) => { if (x == null) return '#1a1a1f'; const [r, g, b] = ramp(x / mx, RAMPS.rain); return `rgba(${r},${g},${b},0.92)` }
  const cells = res ? res.cells.map((c) => ({ id: c.id, polygon: c.polygon, before: live ? col(c.today_mm) : '#0d0d10', after: live ? col(c.scenario_mm) : '#0d0d10', title: `Rain ${c.rain_mm} mm · runoff today ${c.today_mm} mm · scenario ${c.scenario_mm} mm` })) : []
  const R = res?.results

  return (
    <div className="relative min-w-[320px] overflow-hidden bg-black font-sans text-ink">
      <div aria-hidden="true" className="planet-rim right-[-260px] top-[-300px] h-[760px] w-[760px]" />
      <Nav items={NAV} right={<span className="flex h-11 items-center gap-2.5 rounded-[22px] border border-white/[.18] bg-white/[.06] px-[18px] text-[12px] max-[760px]:hidden"><span aria-hidden="true" className="h-[7px] w-[7px] rounded bg-amber" />{err ? 'Model offline' : 'Rain runoff model connected · SCS-CN'}</span>} />

      <section aria-labelledby="simTitle" className="relative z-[1]">
        <div className="container-x pb-14 pt-[180px]">
          <p className="eyebrow">SIMULATION LAB</p>
          <h1 id="simTitle" className="mt-4 font-display text-[clamp(48px,7vw,104px)] font-light leading-[0.98] tracking-[0.05em]">ASK THE CITY<br />“WHAT IF?”</h1>
          <span aria-hidden="true" className="mt-[30px] block h-[2px] w-[72px] rounded-sm" style={{ background: 'linear-gradient(90deg,#7FE0F0,#5B8CFF,#9A86B8)' }} />
          <p className="mt-[26px] max-w-[560px] text-[15px] leading-[1.75] text-ink-2">Pick a scenario, move the levers, then drag the divider to compare Bengaluru before and after. Rain runoff runs the BhuVyom SCS-CN model on a real GPM storm footprint; urban heat and air flow are not modelled yet.</p>
        </div>
      </section>

      <section aria-label="Simulation workspace" className="relative z-[1]">
        <div className="container-x flex flex-wrap items-stretch gap-5 pb-10">
          {/* controls */}
          <div className="card box-border flex max-w-full flex-[1_1_300px] flex-col gap-[22px] p-[26px]">
            <div>
              <div className="text-[11px] tracking-[0.16em] text-ink-4">SCENARIO</div>
              <div role="group" aria-label="Scenario" className="mt-2.5 flex flex-col gap-1.5">
                {MODES.map(([k, label, hint]) => {
                  const on = k === mode
                  return (
                    <button key={k} type="button" aria-pressed={on} onClick={() => setMode(k)}
                      className="flex h-[52px] cursor-pointer items-center justify-between rounded-[14px] px-4 text-[14px]"
                      style={{ color: on ? '#000' : '#F2F2F2', border: `1px solid ${on ? 'transparent' : 'rgba(255,255,255,0.12)'}`, background: on ? 'linear-gradient(90deg,#7FE0F0,#5B8CFF,#9A86B8)' : 'transparent' }}>
                      <span>{label}</span><span className="text-[11px] opacity-80">{hint}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <div className="text-[11px] tracking-[0.16em] text-ink-4">SEASON</div>
              <div role="group" aria-label="Season" className="mt-2.5 flex gap-1.5">
                {SEASONS.map(([k, label]) => (
                  <button key={k} type="button" disabled aria-pressed={k === 'monsoon'} className="h-10 flex-1 cursor-not-allowed rounded-[20px] text-[12px] opacity-50"
                    style={{ color: k === 'monsoon' ? '#F2F2F2' : '#C9C9CE', border: `1px solid ${k === 'monsoon' ? '#7FE0F0' : 'rgba(255,255,255,0.12)'}`, background: k === 'monsoon' ? 'rgba(127,224,240,0.12)' : 'transparent' }}>{label}</button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-ink-4">Storm footprint is the wettest observed GPM day ({res?.storm_shape.date ?? '…'}, monsoon). Other seasons need more GPM years.</p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="text-[11px] tracking-[0.16em] text-ink-4">LEVERS</div>
              {mode === 'runoff' ? <>
                <RangeSlider id="lab-int" label="Storm intensity" display={`${v.intensity} mm/h`} min={5} max={120} step={5} value={v.intensity} onChange={(x) => setV({ ...v, intensity: x })} />
                <RangeSlider id="lab-dur" label="Storm duration" display={`${v.duration} h`} min={1} max={6} value={v.duration} onChange={(x) => setV({ ...v, duration: x })} />
                <RangeSlider id="lab-perm" label="Permeable ground" display={`${v.permeable} %`} value={v.permeable} todayPct={TODAY_PERMEABLE} onChange={(x) => setV({ ...v, permeable: x })} />
                <RangeSlider id="lab-drain" label="Drains desilted (needs drainage model)" display="n/a" value={0} disabled onChange={() => undefined} />
                <div className="flex items-center gap-2 text-[11px] text-ink-4"><span aria-hidden="true" className="h-2.5 w-[2px] bg-amber" />Amber tick = Bengaluru today (assumed {TODAY_PERMEABLE} % permeable — no observed map yet)</div>
              </> : (mode === 'heat'
                ? ['Tree canopy cover', 'Cool / white roofs', 'Built-up growth', 'Lake area restored']
                : ['Background wind', 'Wind direction', 'Average building height', 'Green wind corridors']).map((l, i) => (
                  <RangeSlider key={l} id={`lab-${mode}-${i}`} label={l} display="—" value={50} disabled onChange={() => undefined} />
                ))}
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 pt-1.5">
              <button type="button" onClick={() => setV(START)} disabled={!live} className="h-11 cursor-pointer rounded-[22px] border border-white/[.16] bg-transparent px-5 text-[13px] text-ink-2 disabled:opacity-40">Reset</button>
              <button type="button" onClick={() => { if (live) { setRuns((r) => r + 1); run() } }} disabled={!live} className="flex cursor-pointer items-center gap-3.5 border-0 bg-transparent py-2 text-[16px] font-medium text-ink disabled:opacity-40">
                <span className="relative pb-2">Run simulation<span aria-hidden="true" className="absolute bottom-0 left-0 h-[2px] w-[58px] rounded-sm" style={{ background: 'linear-gradient(90deg,#E9A15A,#D9783F)' }} /></span>
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#E9A15A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2l4 4-4 4" /></svg>
              </button>
            </div>
            <div className="text-[11px] text-ink-4">{!live ? 'This model is not built yet — nothing is computed.' : busy ? 'Running SCS-CN…' : runs ? `Run ${runs} complete · real model output` : 'Results update live as you move the levers'}</div>
          </div>

          {/* map */}
          <div className="flex min-w-0 flex-[999_1_620px] flex-col overflow-hidden rounded-[28px] border border-white/[.09] bg-surface-2">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[.07] px-5 py-4">
              <div className="font-display text-[16px] tracking-[0.12em]">BENGALURU · {MODES.find((m) => m[0] === mode)![1].toUpperCase()}</div>
              <div className="flex items-center gap-2.5 text-[12px] text-ink-3">{live ? `Storm ${fmtNum(v.intensity * v.duration, 0)} mm · GPM 0.1° cells` : 'Not modelled'} <Badge outline>{live ? 'SIMULATED' : 'NOT MODELLED'}</Badge></div>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-4 p-[18px]">
              {err && <Notice>{err}</Notice>}
              <div className="relative">
                {res ? <SplitMap cells={cells} boundary={boundary} split={split} onSplit={setSplit} /> : <div className="aspect-[16/12] rounded-xl bg-white/[.02]" />}
                {!live && <div className="absolute inset-0 flex items-center justify-center p-6"><div className="max-w-[420px] rounded-2xl border border-white/10 bg-black/85 p-5 text-center text-[13px] leading-relaxed text-ink-2">
                  <div className="mb-2 font-display text-[16px] tracking-[0.1em] text-amber">MODEL NOT BUILT YET</div>
                  {mode === 'heat' ? 'An urban-heat simulation needs a surface energy balance (albedo, emissivity, building materials, anthropogenic heat) calibrated to MODIS land surface temperature. None is connected, so no numbers are shown.' : 'An air-flow simulation needs an urban wind model with building heights and street geometry. None is connected, so no numbers are shown.'}
                </div></div>}
              </div>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="box-border w-[min(300px,100%)] rounded-2xl border border-white/10 bg-black/85 px-4 py-3.5">
                  <div className="text-[12px]">Direct runoff depth</div>
                  <div aria-hidden="true" className="mt-2.5 h-2 rounded" style={{ background: rampCss(RAMPS.rain) }} />
                  <div className="mt-1.5 flex justify-between text-[11px] text-ink-4"><span>0 mm</span><span>{fmtNum(mx, 0)} mm</span></div>
                </div>
                <div className="text-[12px] text-ink-4">Drag anywhere on the map to move the divider · amber line = BBMP boundary</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RESULTS */}
      <section aria-labelledby="resTitle" className="relative z-[1]">
        <div className="container-x pb-10 pt-5">
          <h2 id="resTitle" className="m-0 font-display text-[14px] font-normal tracking-[0.36em] text-cyan">RESULTS</h2>
          <div className="mt-[18px] grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))' }}>
            {(live && R ? [
              { label: 'Mean runoff depth', value: `${fmtNum(R.runoff_scenario_mm, 1)} mm`, note: `Today ${fmtNum(R.runoff_today_mm, 1)} mm · ${R.change_pct == null ? '' : `${R.change_pct > 0 ? '+' : '−'}${Math.abs(R.change_pct)} %`}` },
              { label: 'Rain that runs off', value: `${Math.round(R.runoff_coeff_scenario * 100)} %`, note: `Today ${Math.round(R.runoff_coeff_today * 100)} % · rest soaks in or is held` },
              { label: 'Runoff volume, BBMP area', value: `${fmtNum(R.volume_scenario_mcm, 1)} M m³`, note: `Today ${fmtNum(R.volume_today_mcm, 1)} M m³ over ${fmtNum(R.bbmp_area_km2, 0)} km²` },
              { label: 'Parameter range', value: `${fmtNum(R.scenario_ensemble_mm[0], 0)}–${fmtNum(R.scenario_ensemble_mm[1], 0)} mm`, note: 'Soil group B/C/D × λ 0.05/0.2 · not validated' },
            ] : [0, 1, 2, 3].map((i) => ({ label: ['Result 1', 'Result 2', 'Result 3', 'Result 4'][i], value: '—', note: live ? 'Waiting for the model…' : 'Not modelled' }))).map((r) => (
              <div key={r.label} className="card rounded-[20px] px-6 py-[22px]">
                <div className="text-[12px] text-ink-4">{r.label}</div>
                <div className="grad-text mt-1.5 font-display text-[40px]">{r.value}</div>
                <div className="mt-1 text-[12px] text-ink-3">{r.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CHART */}
      <section aria-labelledby="chartTitle" className="relative z-[1]">
        <div className="container-x pb-[100px] pt-5">
          <div className="card p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 id="chartTitle" className="m-0 font-display text-[24px] font-normal tracking-[0.06em]">RUNOFF RESPONSE · RAIN DEPTH → RUNOFF</h2>
              <div className="flex gap-[18px] text-[12px] text-ink-2">
                <span className="flex items-center gap-2"><span aria-hidden="true" className="w-[18px] border-t-2 border-dashed border-[#8E8E94]" />Today</span>
                <span className="flex items-center gap-2"><span aria-hidden="true" className="h-[3px] w-[18px] rounded-sm" style={{ background: 'linear-gradient(90deg,#7FE0F0,#5B8CFF,#9A86B8)' }} />Your scenario</span>
                <Badge>{live ? 'SCS-CN' : 'NOT MODELLED'}</Badge>
              </div>
            </div>
            {live && res ? <ResponseChart res={res} /> : <div className="mt-[18px] flex h-[260px] items-center justify-center text-[13px] text-ink-4">No model output for this scenario.</div>}
            <div className="mt-2 flex justify-between text-[11px] text-ink-4">{['0 mm', '50 mm', '100 mm', '150 mm', '200 mm'].map((t) => <span key={t}>{t}</span>)}</div>
          </div>
        </div>
      </section>

      {/* BEHIND THE LAB */}
      <section aria-labelledby="howTitle" className="relative z-[1]">
        <div className="container-x pb-[120px]">
          <p className="eyebrow">BEHIND THE LAB</p>
          <h2 id="howTitle" className="mt-3.5 font-display text-[clamp(36px,4.6vw,60px)] font-light leading-none tracking-[0.05em]">INPUTS → MODEL → MAP</h2>
          <div className="mt-12 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
            {[
              { n: '01', t: 'INPUTS', b: `Storm depth = intensity × duration, spread over the city with the footprint of the wettest observed GPM IMERG day (${res?.storm_shape.date ?? '…'}). Permeable share sets the curve number.`, g: 'linear-gradient(135deg,#7FE0F0,#5B8CFF)' },
              { n: '02', t: 'MODEL', b: `SCS Curve Number (USDA-NRCS): S = 25400/CN − 254, Iₐ = λS, Q = (P − Iₐ)² / (P − Iₐ + S). CN today ${res?.parameters.CN_today ?? '…'}, scenario ${res?.parameters.CN_scenario ?? '…'}. No drains, routing or lake storage; not validated against streamflow.`, g: 'linear-gradient(135deg,#5B8CFF,#9A86B8)' },
              { n: '03', t: 'MAP', b: 'Runoff depth is drawn on the real 0.1° GPM cells, compared with today using the divider, and summarised in the result cards and the response curve.', g: 'linear-gradient(135deg,#9A86B8,#E0905A)' },
            ].map((h) => (
              <article key={h.n} className="grad-border rounded-3xl p-7" style={{ ['--g' as string]: h.g }}>
                <div className="font-display text-[13px] tracking-[0.2em] text-cyan">{h.n}</div>
                <h3 className="mt-2.5 font-display text-[24px] font-normal tracking-[0.06em]">{h.t}</h3>
                <p className="mt-2.5 text-[13px] leading-[1.7] text-ink-3">{h.b}</p>
              </article>
            ))}
          </div>
          {res && <ul className="mt-6 list-disc pl-5 text-[12px] leading-relaxed text-ink-4">{res.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>}
          <div className="mt-10"><CtaLink to="/future" gradient>Next: Future Earth</CtaLink></div>
          <div className="mt-[100px]"><Footer credit={false} links={[{ label: 'Home', to: '/' }, { label: 'Future Earth', to: '/future' }, { label: 'Explorer app', to: '/explore' }]} /></div>
        </div>
      </section>
    </div>
  )
}

function ResponseChart({ res }: { res: LabResult }) {
  const { rain_mm: P, today_mm: A, scenario_mm: B } = res.curve
  const hi = Math.max(...A, ...B, 1) * 1.08
  const X = (p: number) => (p / 200) * 1200, Y = (q: number) => 240 - (q / hi) * 220
  const d = (arr: number[]) => arr.map((q, i) => `${i ? 'L' : 'M'}${X(P[i]).toFixed(1)} ${Y(q).toFixed(1)}`).join(' ')
  const gap = d(A) + ' ' + B.slice().reverse().map((q, i) => `L${X(P[P.length - 1 - i]).toFixed(1)} ${Y(q).toFixed(1)}`).join(' ') + ' Z'
  const storm = res.inputs.storm_depth_mm
  return (
    <svg role="img" aria-label="Runoff versus rain depth: today and your scenario" viewBox="0 0 1200 260" preserveAspectRatio="none" className="mt-[18px] block h-[260px] w-full">
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7FE0F0" /><stop offset="0.5" stopColor="#5B8CFF" /><stop offset="1" stopColor="#9A86B8" /></linearGradient>
        <linearGradient id="sgf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5B8CFF" stopOpacity="0.28" /><stop offset="1" stopColor="#5B8CFF" stopOpacity="0" /></linearGradient>
      </defs>
      <path d="M0 30H1200M0 100H1200M0 170H1200M0 240H1200" stroke="#141418" vectorEffect="non-scaling-stroke" />
      <path d={gap} fill="url(#sgf)" />
      <path d={d(A)} stroke="#8E8E94" strokeWidth="2" strokeDasharray="6 6" fill="none" vectorEffect="non-scaling-stroke" />
      <path d={d(B)} stroke="url(#sg)" strokeWidth="3" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {storm <= 200 && <path d={`M${X(storm)} 0V260`} stroke="rgba(233,161,90,0.7)" vectorEffect="non-scaling-stroke"><title>{`Your storm: ${storm} mm`}</title></path>}
    </svg>
  )
}
