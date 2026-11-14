import { useEffect, useMemo, useState } from 'react'
import { Globe, futureLayout } from '../components/Globe'
import { Nav } from '../components/Nav'
import { SoundButton } from '../components/Sound'
import { Badge, CtaLink, Footer, Notice } from '../components/ui'
import { EngineError, api, type FutureData, type FutureMetric } from '../lib/api'
import { fmtNum } from '../lib/ramp'

const NAV = [{ label: 'Home', to: '/' }, { label: 'Simulation Lab', to: '/lab' }, { label: 'Future Earth', to: '/future' }]
const SC = [{ id: 'ssp126', label: 'Sustainable', code: 'SSP1-2.6', dot: '#7FE0F0' }, { id: 'ssp245', label: 'Middle road', code: 'SSP2-4.5', dot: '#9A86B8' }, { id: 'ssp585', label: 'Fossil-fuelled', code: 'SSP5-8.5', dot: '#E0905A' }]
const YEARS = [2030, 2050, 2070, 2100]
const pill = (on: boolean) => ({ color: on ? '#000' : '#F2F2F2', border: `1px solid ${on ? 'transparent' : 'rgba(242,242,242,0.2)'}`, background: on ? '#F2F2F2' : 'rgba(0,0,0,0.35)' })

// How each driver in the design is (or is not) represented in NASA NEX-GDDP-CMIP6 projections.
const DRIVERS = {
  manmade: [
    ['Greenhouse emissions', 'Fuel, power and industry', 'Set by the pathway', true],
    ['Urban expansion', 'Concrete replacing soil and trees', 'Not in climate models', false],
    ['Tree cover loss', 'Felling for roads and buildings', 'Not in climate models', false],
    ['Lake encroachment', 'Lakes filled or polluted', 'Not in climate models', false],
    ['Groundwater pumping', 'Borewells drawing down aquifers', 'Not in climate models', false],
    ['Traffic & industry smoke', 'Particles in the air', 'Partly (aerosols in the pathway)', true],
  ],
  natural: [
    ['Monsoon strength', 'How much the southwest monsoon delivers', 'Simulated by each model', true],
    ['El Niño / La Niña', 'Pacific swings that shift heat and rain', 'Simulated by each model', true],
    ['Heatwave season', 'Long dry, hot spells before the monsoon', 'Simulated by each model', true],
    ['Drought cycles', 'Years when rain fails', 'Simulated by each model', true],
  ],
} as const

export default function Future() {
  const [data, setData] = useState<FutureData | null>(null)
  const [err, setErr] = useState<{ reason: string; hint?: string } | null>(null)
  const [scen, setScen] = useState(1)
  const [year, setYear] = useState(2050)
  const [scale, setScale] = useState<'city' | 'planet'>('city')
  const [sel, setSel] = useState('air')
  useEffect(() => { api.future().then(setData).catch((e) => setErr(e instanceof EngineError ? { reason: e.detail.reason, hint: e.detail.hint } : { reason: String(e) })) }, [])

  const ssp = SC[scen].id
  const metrics: FutureMetric[] = data?.metrics ?? []
  const val = (m: FutureMetric | undefined, y = year, s = ssp) => m?.scenarios?.[s]?.windows[String(y)]
  const head = ['air', 'hot', 'rain'].map((id) => metrics.find((m) => m.id === id))
  const selM = metrics.find((m) => m.id === sel && m.available) ?? metrics.find((m) => m.available)

  return (
    <div className="min-w-[320px] overflow-hidden bg-black font-sans text-ink">
      {/* HERO */}
      <div className="relative h-[900px]">
        <Globe height={900} layout={futureLayout(900)} />
        <Nav items={NAV} right={<SoundButton />} />
        <section aria-labelledby="futTitle" className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[900px]">
          <div className="container-x pt-[190px]">
            <div className="max-w-[600px]">
              <p className="m-0 font-display text-[14px] tracking-[0.4em] text-ink/80">FUTURE EARTH</p>
              <h1 id="futTitle" className="mt-5 font-display text-[clamp(52px,7vw,100px)] font-light leading-[0.98] tracking-[0.05em]">{scale === 'city' ? 'BENGALURU' : 'EARTH'}<br />IN {year}</h1>
              <span aria-hidden="true" className="mt-[30px] block h-[2px] w-[72px] bg-amber" />
              <p className="mt-[26px] max-w-[460px] text-[15px] leading-[1.75] text-ink/[.78]">How three emissions pathways could change heat and rain over Bengaluru in the decades ahead — from NASA’s downscaled CMIP6 climate projections.</p>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-9 px-5">
            <div className="pointer-events-auto mx-auto box-border flex max-w-[1320px] flex-wrap items-center gap-x-7 gap-y-[18px] rounded-[26px] border border-white/[.14] px-[22px] py-[18px] backdrop-blur-[22px]"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(10,12,16,0.55) 50%, rgba(4,5,8,0.7) 100%)' }}>
              <div>
                <div className="text-[11px] tracking-[0.16em] text-ink/70">PATHWAY</div>
                <div role="group" aria-label="Climate pathway" className="mt-2 flex flex-wrap gap-1.5">
                  {SC.map((s, i) => <button key={s.id} type="button" aria-pressed={scen === i} onClick={() => setScen(i)} className="flex h-11 cursor-pointer items-center gap-2 rounded-[22px] px-3.5 text-[12px]" style={pill(scen === i)}><span aria-hidden="true" className="h-2 w-2 rounded" style={{ background: s.dot }} />{s.label}<span className="text-[11px] opacity-70">{s.code}</span></button>)}
                </div>
              </div>
              <div>
                <div className="text-[11px] tracking-[0.16em] text-ink/70">YEAR</div>
                <div role="group" aria-label="Year" className="mt-2 flex gap-1.5">
                  {YEARS.map((y) => <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)} className="h-11 min-w-16 cursor-pointer rounded-[22px] px-3 font-display text-[15px]" style={pill(year === y)}>{y}</button>)}
                </div>
              </div>
              <div>
                <div className="text-[11px] tracking-[0.16em] text-ink/70">SCALE</div>
                <div role="group" aria-label="Scale" className="mt-2 flex gap-1.5">
                  {([['city', 'Bengaluru'], ['planet', 'Planet']] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={scale === k} onClick={() => setScale(k)} className="h-11 cursor-pointer rounded-[22px] px-4 text-[12px]" style={pill(scale === k)}>{l}</button>)}
                </div>
              </div>
              <div className="ml-auto flex flex-wrap gap-[22px]">
                {head.map((m, i) => {
                  const w = scale === 'city' ? val(m) : undefined
                  return <div key={i}><div className="text-[11px] text-ink/70">{m?.label ?? ['Mean air temperature', 'Hot days (max ≥ 35 °C)', 'Annual rainfall'][i]}</div><div className="mt-0.5 font-display text-[26px]">{w?.value.median != null ? `${fmtNum(w.value.median, m!.decimals ?? 1)} ${m!.unit}` : '—'}</div></div>
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      {err && <div className="container-x pt-10"><Notice><strong>Projections not loaded.</strong> {err.reason}{err.hint && <><br />{err.hint}</>}</Notice></div>}

      {/* DRIVERS */}
      <section id="drivers" aria-labelledby="drvTitle">
        <div className="container-x pb-[60px] pt-[120px]">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div><p className="eyebrow">WHAT’S PUSHING</p><h2 id="drvTitle" className="h-section">MANMADE<br />&amp; NATURAL</h2></div>
            <p className="m-0 max-w-[440px] text-[15px] leading-[1.7] text-ink-3">Climate projections change one thing on purpose — the emissions pathway. Natural swings are inside every model run; local changes like lakes and trees are not in them at all. Here is which is which.</p>
          </div>
          <div className="mt-14 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(480px, 100%), 1fr))' }}>
            {(['manmade', 'natural'] as const).map((k) => (
              <div key={k} className="card rounded-[26px] p-[30px]">
                <div className="flex items-center justify-between"><h3 className="m-0 font-display text-[24px] font-normal tracking-[0.08em]">{k === 'manmade' ? 'MANMADE' : 'NATURAL'}</h3><span className="text-[12px] text-ink-4">{k === 'manmade' ? 'What people do' : 'What the planet does'}</span></div>
                <div className="mt-3.5 flex flex-col">
                  {DRIVERS[k].map(([name, note, how, inModel]) => (
                    <div key={name} className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[.07] py-3.5">
                      <div className="min-w-[180px] flex-1"><div className="text-[14px] font-medium">{name}</div><div className="mt-0.5 text-[12px] text-ink-4">{note}</div></div>
                      <span className="rounded-[17px] px-3 py-2 text-[12px]" style={inModel ? { color: '#000', background: 'linear-gradient(90deg,#7FE0F0,#5B8CFF)' } : { color: '#C9C9CE', border: '1px solid rgba(255,255,255,0.14)' }}>{how}</span>
                    </div>
                  ))}
                </div>
                {k === 'natural' && <div className="mt-[18px] rounded-2xl border border-white/[.07] bg-[#0A0A0C] px-[18px] py-4 text-[12px] leading-[1.6] text-ink-3">Natural cycles don’t follow a pathway — they swing from year to year on top of the long-term trend. Their spread shows up as the range between models.</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* METRICS */}
      <section id="metrics" aria-labelledby="metTitle">
        <div className="container-x pb-[60px] pt-10">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div><p className="eyebrow">WHAT CHANGES · {scale === 'city' ? 'BENGALURU' : 'PLANET'}</p><h2 id="metTitle" className="h-section">{scale === 'city' ? 'THE CITY IN NUMBERS' : 'THE PLANET IN NUMBERS'}</h2></div>
            <div className="flex items-center gap-2.5 text-[12px] text-ink-3">{SC[scen].label} · {SC[scen].code} · {data?.windows[String(year)] ?? year} <Badge outline>{data ? 'NASA CMIP6' : 'NOT LOADED'}</Badge></div>
          </div>
          {scale === 'planet' ? (
            <div className="mt-10"><Notice>Planet-scale figures (global warming, sea level, CO₂, sea ice, ocean pH) would come from the IPCC AR6 assessment tables. They are not wired into BhuVyom yet, so nothing is shown rather than placeholders. Switch to Bengaluru for real projections.</Notice></div>
          ) : (
            <div className="mt-10 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))' }}>
              {(metrics.length ? metrics : []).map((m) => m.available ? (
                <MetricCard key={m.id} m={m} ssp={ssp} year={year} selected={m.id === selM?.id} onPick={() => setSel(m.id)} dot={SC[scen].dot} />
              ) : (
                <div key={m.id} className="card flex flex-col gap-2.5 rounded-[22px] p-6 opacity-70">
                  <span className="text-[12px] text-ink-3">{m.label}</span>
                  <span className="font-display text-[30px] text-ink-4">—</span>
                  <span className="text-[11px] tracking-[0.08em] text-amber">NO PROJECTION SOURCE</span>
                  <span className="text-[12px] leading-[1.55] text-ink-4">{m.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* TRAJECTORY */}
      <section aria-labelledby="trajTitle">
        <div className="container-x pb-[100px] pt-5">
          <div className="card rounded-[26px] p-[30px]">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><div className="text-[11px] tracking-[0.16em] text-ink-4">TRAJECTORY 2025 → 2100 · MULTI-MODEL MEDIAN</div><h2 id="trajTitle" className="mt-2 font-display text-[30px] font-normal tracking-[0.05em]">{selM ? `${selM.label} (${selM.unit})` : 'No projection loaded'}</h2></div>
              <div className="flex flex-wrap gap-4 text-[12px] text-ink-2">{SC.map((s) => <span key={s.id} className="flex items-center gap-2"><span aria-hidden="true" className="h-[3px] w-[18px] rounded-sm" style={{ background: s.dot }} />{s.label} · {s.code}</span>)}</div>
            </div>
            {selM && scale === 'city' ? <Trajectory m={selM} active={scen} year={year} /> : <div className="flex h-[300px] items-center justify-center text-[13px] text-ink-4">{scale === 'planet' ? 'Planet-scale trajectories are not wired yet.' : 'Run the CMIP6 acquisition to draw real pathways.'}</div>}
            <div className="mt-2 flex justify-between pl-12 text-[11px] text-ink-4">{[2025, 2040, 2055, 2070, 2085, 2100].map((y) => <span key={y}>{y}</span>)}</div>
            <p className="mt-5 text-[12px] leading-[1.6] text-ink-4">{selM?.why} Lines are the multi-model median of ~20-year window means; the shaded band is the min–max range across models for the selected pathway. {data ? `Models: ${data.source.models.join(', ')}. Baseline ${data.baseline_period}. Grid cell ${data.source.grid_cell ? `${data.source.grid_cell.lat.toFixed(3)}° N, ${data.source.grid_cell.lon.toFixed(3)}° E` : ''} (${data.source.resolution}).` : ''}</p>
          </div>
        </div>
      </section>

      {/* CHAINS */}
      <section aria-labelledby="chainTitle">
        <div className="container-x pb-[100px]">
          <p className="eyebrow">CAUSE → EFFECT</p>
          <h2 id="chainTitle" className="mt-3.5 font-display text-[clamp(36px,4.6vw,60px)] font-light leading-none tracking-[0.05em]">HOW ONE CHANGE<br />LEADS TO THE NEXT</h2>
          <p className="mt-4 max-w-[560px] text-[13px] text-ink-4">Explanatory chains — concepts, not model output.</p>
          <div className="mt-10 flex flex-col gap-3">
            {[
              ['MANMADE', '#E0905A', ['Urban expansion', 'Less soil and trees', 'Hotter roofs and roads', 'More air-conditioning', 'More emissions']],
              ['MANMADE', '#E0905A', ['Lakes filled in', 'Less water storage', 'Faster runoff', 'Flooded streets']],
              ['NATURAL', '#7FE0F0', ['El Niño year', 'Weaker monsoon', 'Less recharge', 'Falling groundwater', 'More borewells']],
              ['BOTH', '#9A86B8', ['Warmer air holds more water', 'Heavier rain bursts', 'Blocked drains overflow', 'Flood-prone area grows']],
            ].map(([tag, c, steps], i) => (
              <div key={i} className="card flex flex-wrap items-center gap-3 rounded-[20px] px-5 py-4">
                <span className="rounded-[10px] px-2.5 py-1 text-[10px] tracking-[0.12em] text-black" style={{ background: c as string }}>{tag as string}</span>
                {(steps as string[]).map((s, j, a) => (
                  <span key={s} className="flex items-center gap-3 text-[13px] text-ink-2">{s}{j < a.length - 1 && <svg aria-hidden="true" width="18" height="10" viewBox="0 0 18 10" fill="none" stroke="#7FE0F0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 5h15M12 1l4 4-4 4" /></svg>}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DATA */}
      <section aria-labelledby="fdataTitle">
        <div className="container-x pb-[60px]">
          <p className="eyebrow">DATA BEHIND IT</p>
          <h2 id="fdataTitle" className="mt-3.5 font-display text-[clamp(36px,4.6vw,60px)] font-light leading-none tracking-[0.05em]">PAST FROM SATELLITES.<br />FUTURE FROM MODELS.</h2>
          <div className="mt-12 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
            {[
              ['FUTURE · CLIMATE MODELS', 'NASA NEX-GDDP-CMIP6', 'Daily temperature, rainfall, humidity and wind for each SSP pathway, bias-corrected and downscaled to ~25 km (Thrasher et al. 2022).', 'linear-gradient(135deg,#9A86B8,#E0905A)', !!data],
              ['PAST · TEMPERATURE', 'MODIS · MOD11A1', 'Daily clear-sky land surface temperature at 1 km — the baseline for surface heat.', 'linear-gradient(135deg,#7FE0F0,#5B8CFF)', true],
              ['PAST · GREEN COVER', 'MODIS · MOD13Q1', 'Vegetation index (NDVI) every 16 days at 250 m.', 'linear-gradient(135deg,#5FC4D8,#2F6BFF)', true],
              ['PAST · LAND USE', 'Landsat 8 / 9', '30 m imagery to map how built-up area and lakes have changed since the 1980s.', 'linear-gradient(135deg,#A9E8F5,#9A86B8)', false],
              ['PAST · WATER', 'GRACE-FO', 'Satellite gravity measurements of changing groundwater and total water storage.', 'linear-gradient(135deg,#C8D6FF,#5FC4D8)', false],
              ['PAST · RAIN & AIR', 'GPM IMERG · NASA POWER', 'Rainfall, humidity, wind and sunlight records that anchor today’s values.', 'linear-gradient(135deg,#F4C27C,#E0905A)', true],
            ].map(([kind, name, body, g, ok]) => (
              <article key={name as string} className="grad-border rounded-3xl p-7" style={{ ['--g' as string]: g as string }}>
                <div className="flex items-center justify-between gap-3"><div className="text-[11px] tracking-[0.14em] text-ink-4">{kind as string}</div><Badge tone={ok ? 'cyan' : 'grey'}>{ok ? 'CONNECTED' : 'NOT CONNECTED'}</Badge></div>
                <h3 className="mt-2 font-display text-[22px] font-normal tracking-[0.05em]">{name as string}</h3>
                <p className="mt-2.5 text-[13px] leading-[1.65] text-ink-3">{body as string}</p>
              </article>
            ))}
          </div>
          <p className="mt-5 text-[12px] leading-[1.6] text-ink-4">Pathway names follow the IPCC Shared Socioeconomic Pathways. {data?.limitations.join(' ')}</p>
          <div className="mt-10"><CtaLink to="/lab" gradient>Try the Simulation Lab</CtaLink></div>
          <div className="mt-[100px] pb-10"><Footer links={[{ label: 'Home', to: '/' }, { label: 'Simulation Lab', to: '/lab' }, { label: 'Explorer app', to: '/explore' }]} /></div>
        </div>
      </section>
    </div>
  )
}

function MetricCard({ m, ssp, year, selected, onPick, dot }: { m: FutureMetric; ssp: string; year: number; selected: boolean; onPick: () => void; dot: string }) {
  const w = m.scenarios?.[ssp]?.windows[String(year)]
  const dp = m.decimals ?? 1
  const d = w?.delta.median
  const traj = m.scenarios?.[ssp]?.trajectory ?? []
  const vals = traj.map((p) => p.median).filter((v): v is number => v != null)
  const lo = Math.min(...vals), hi = Math.max(...vals) + 1e-6
  const spark = traj.map((p, i) => (p.median == null ? '' : `${i ? 'L' : 'M'}${(i * 16).toFixed(1)} ${(40 - ((p.median - lo) / (hi - lo)) * 36).toFixed(1)}`)).join(' ')
  const yi = traj.findIndex((p) => p.year >= year)
  const worseUp = !['wind'].includes(m.id)
  return (
    <button type="button" aria-pressed={selected} onClick={onPick} className="flex cursor-pointer flex-col gap-2.5 rounded-[22px] p-6 text-left font-sans text-ink"
      style={{ border: `1px solid ${selected ? 'transparent' : 'rgba(255,255,255,0.08)'}`, background: selected ? 'linear-gradient(#08080A,#08080A) padding-box, linear-gradient(135deg,#7FE0F0,#5B8CFF,#9A86B8) border-box' : '#050506' }}>
      <span className="flex justify-between gap-2 text-[12px] text-ink-3"><span>{m.label}</span><span>{m.unit}</span></span>
      <span className="font-display text-[34px]" style={{ background: d != null && d * (worseUp ? 1 : -1) > 0 ? 'linear-gradient(90deg,#F2F2F2,#F4C27C 60%,#E0905A)' : 'linear-gradient(90deg,#F2F2F2,#7FE0F0 60%,#5B8CFF)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{fmtNum(w?.value.median, dp)}</span>
      <span className="text-[12px] text-ink-3">{d == null ? '—' : `${d >= 0 ? '+' : '−'}${fmtNum(Math.abs(d), dp)}`} vs 1995–2014 ({fmtNum(m.baseline?.median, dp)}) · range {fmtNum(w?.value.min, dp)}–{fmtNum(w?.value.max, dp)}</span>
      <svg aria-hidden="true" viewBox="0 0 240 44" preserveAspectRatio="none" className="h-11 w-full">
        <path d={spark} stroke={dot} strokeWidth="2" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {yi >= 0 && traj[yi]?.median != null && <circle cx={yi * 16} cy={40 - ((traj[yi].median! - lo) / (hi - lo)) * 36} r="4" fill="#F2F2F2" />}
      </svg>
      <span className="text-[12px] leading-[1.55] text-ink-4">{m.why} n = {w?.value.n_models ?? 0} models</span>
    </button>
  )
}

function Trajectory({ m, active, year }: { m: FutureMetric; active: number; year: number }) {
  const series = SC.map((s) => m.scenarios?.[s.id]?.trajectory ?? [])
  const all = series.flat().flatMap((p) => [p.min, p.max, p.median]).filter((v): v is number => v != null).concat(m.baseline?.median ?? [])
  const g = useMemo(() => { let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.08 || 1; return { lo: lo - pad, hi: hi + pad } }, [all])
  const X = (i: number) => i * (1100 / 15), Y = (v: number) => 14 + (1 - (v - g.lo) / (g.hi - g.lo)) * 272
  const line = (pts: (number | null)[]) => pts.map((v, i) => (v == null ? '' : `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).join(' ')
  const a = series[active]
  const band = a.length ? `${a.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.max ?? 0).toFixed(1)}`).join(' ')} ${a.slice().reverse().map((p, i) => `L${X(a.length - 1 - i).toFixed(1)} ${Y(p.min ?? 0).toFixed(1)}`).join(' ')} Z` : ''
  const dp = m.decimals ?? 1
  return (
    <div className="mt-6 flex gap-3">
      <div className="flex h-[300px] w-10 flex-col justify-between text-right text-[11px] text-ink-4"><span>{fmtNum(g.hi, dp)}</span><span>{fmtNum((g.hi + g.lo) / 2, dp)}</span><span>{fmtNum(g.lo, dp)}</span></div>
      <svg role="img" aria-label={`${m.label} under three pathways, NASA CMIP6 multi-model median`} viewBox="0 0 1100 300" preserveAspectRatio="none" className="block h-[300px] min-w-0 flex-1">
        <path d="M0 14H1100M0 150H1100M0 286H1100" stroke="#141418" vectorEffect="non-scaling-stroke" />
        {m.baseline?.median != null && <path d={`M0 ${Y(m.baseline.median).toFixed(1)}H1100`} stroke="#2A2A30" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />}
        <path d={`M${X((year - 2025) / 5).toFixed(1)} 0V300`} stroke="rgba(233,161,90,0.6)" vectorEffect="non-scaling-stroke" />
        <path d={band} fill={SC[active].dot} opacity="0.12" />
        {series.map((s, k) => <path key={k} d={line(s.map((p) => p.median))} stroke={SC[k].dot} strokeWidth={k === active ? 3.5 : 1.6} opacity={k === active ? 1 : 0.45} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
      </svg>
    </div>
  )
}
