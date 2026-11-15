import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Globe, heroLayout } from '../components/Globe'
import { Nav } from '../components/Nav'
import { SoundButton } from '../components/Sound'
import { SplitMap } from '../components/SplitMap'
import { Badge, CtaLink, Footer, Notice } from '../components/ui'
import { ExplorerMap } from '../home/ExplorerMap'
import { EngineError, api, type FutureData, type LabResult, type SiteSummary } from '../lib/api'
import { RAMPS, fmtVal, ramp } from '../lib/ramp'

const ICON = {
  thermo: 'M10 13.5V4a2 2 0 1 1 4 0v9.5a4 4 0 1 1-4 0z M12 9v6', surface: 'M3 15l9 5 9-5 M3 10l9 5 9-5-9-5z',
  rain: 'M7 14a5 5 0 1 1 9.6-2A4 4 0 1 1 17 20H8a4 4 0 0 1-1-6z M9 22l1-2 M13 22l1-2', drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z M9.5 16l5-5',
  wind: 'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h8', sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2',
  cloud: 'M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 11 3.5 3.5 0 0 1 18 18z', plus: 'M12 5v14 M5 12h14',
}
const LAYERS: { key: string; name: string; note: string; source: string; icon: string; grad: string; link?: string }[] = [
  { key: 'air', name: 'Air temperature', note: 'How warm the air is two metres above the ground.', source: 'NASA POWER · T2M', icon: ICON.thermo, grad: 'linear-gradient(135deg,#7FE0F0,#5B8CFF)' },
  { key: 'lst', name: 'Land surface temperature', note: 'How hot roofs, roads and fields get under the sun.', source: 'MODIS · MOD11A1', icon: ICON.surface, grad: 'linear-gradient(135deg,#9A86B8,#E0905A)' },
  { key: 'rain', name: 'Precipitation', note: 'Rain over the city, from passing showers to monsoon bursts.', source: 'GPM IMERG', icon: ICON.rain, grad: 'linear-gradient(135deg,#5FC4D8,#2F6BFF)' },
  { key: 'rh', name: 'Relative humidity', note: 'Moisture in the air at two metres.', source: 'NASA POWER · RH2M', icon: ICON.drop, grad: 'linear-gradient(135deg,#A9E8F5,#9A86B8)' },
  { key: 'wind', name: 'Wind speed', note: 'How fast air moves across the plateau.', source: 'NASA POWER · WS2M', icon: ICON.wind, grad: 'linear-gradient(135deg,#C8D6FF,#5FC4D8)' },
  { key: 'solar', name: 'Solar radiation', note: 'Sunlight reaching the ground through the sky.', source: 'NASA POWER · ALLSKY', icon: ICON.sun, grad: 'linear-gradient(135deg,#F4C27C,#E0905A)', link: '/explore' },
  { key: 'cloud', name: 'Cloud cover', note: 'Share of the sky covered by cloud.', source: 'NASA POWER · CLOUD_AMT', icon: ICON.cloud, grad: 'linear-gradient(135deg,#DDE6F2,#8EA2C0)', link: '/explore' },
  { key: 'next', name: 'Your next layer', note: 'The pipeline is modular — MODIS vegetation (NDVI, 250 m) is already in. Open it in the explorer app.', source: 'Explorer app', icon: ICON.plus, grad: 'linear-gradient(135deg,#3A3A42,#1A1A1F)', link: '/explore' },
]
const NAV = [{ label: 'Explorer', to: '#explorer' }, { label: 'Simulation Lab', to: '/lab' }, { label: 'Future Earth', to: '/future' }, { label: 'Prediction Engine', to: '/prediction' }, { label: 'Data', to: '#data' }]

function useData() {
  const [site, setSite] = useState<SiteSummary | null>(null)
  const [boundary, setBoundary] = useState<GeoJSON.FeatureCollection | null>(null)
  const [lab, setLab] = useState<LabResult | null>(null)
  const [future, setFuture] = useState<FutureData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.site().then(setSite).catch((e) => setError(e instanceof EngineError ? e.detail.reason : String(e)))
    api.boundary().then(setBoundary).catch(() => undefined)
    api.lab({ intensity: 40, duration: 3, permeable: 0.6 }).then(setLab).catch(() => undefined)
    api.future().then(setFuture).catch(() => undefined)
  }, [])
  return { site, boundary, lab, future, error }
}

export default function Home() {
  const { site, boundary, lab, future, error } = useData()
  const [chip, setChip] = useState('air')
  const goLayer = (key: string, link?: string) => {
    if (link) { window.location.assign(link); return }
    setChip(key); document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth' })
  }
  return (
    <div className="min-w-[320px] overflow-hidden bg-black font-sans text-ink">
      {/* HERO */}
      <div className="relative h-[960px]">
        <Globe height={960} layout={heroLayout(960)} />
        <Nav items={NAV} right={<SoundButton />} />
        <section id="top" aria-labelledby="heroTitle" className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-[960px]">
          <div className="container-x pt-[220px]">
            <div className="max-w-[560px]">
              <p className="m-0 font-display text-[14px] tracking-[0.4em] text-ink/80">NASA EARTH DATA</p>
              <h1 id="heroTitle" className="mt-5 font-display text-[clamp(52px,8vw,116px)] font-light leading-[0.98] tracking-[0.05em]">READ<br />THE CITY<br />FROM SPACE</h1>
              <span aria-hidden="true" className="mt-[34px] block h-[2px] w-[72px] bg-amber" />
              <p className="mt-7 max-w-[440px] text-[15px] leading-[1.75] text-ink/[.78]">Temperature, rainfall, humidity and wind over Bengaluru — from NASA satellites and models, on one map you can explore and simulate.</p>
              <div className="pointer-events-auto mt-[34px] flex flex-wrap items-center gap-[26px]">
                <CtaLink to="#explorer">Get Started</CtaLink>
                <Link to="/lab" className="box-border inline-flex h-12 items-center gap-3 rounded-3xl border border-ink/[.22] pl-2 pr-5 text-[14px] text-ink no-underline backdrop-blur-[14px]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.5))' }}>
                  <span aria-hidden="true" className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-amber"><svg width="10" height="12" viewBox="0 0 12 14"><path d="M2 1.5l9 5.5-9 5.5z" fill="#000" /></svg></span>Simulation Lab
                </Link>
                <Link to="/future" className="inline-flex items-center gap-2.5 py-3 text-[14px] text-ink/85 no-underline">Future Earth<svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#F2F2F2" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10L10 2M4 2h6v6" /></svg></Link>
              </div>
            </div>
          </div>
          <div className="absolute inset-x-0 bottom-10">
            <div className="container-x flex flex-wrap gap-10 font-display text-[13px] tracking-[0.24em] text-ink/75"><span>12.97° N</span><span>77.59° E</span><span>≈ 920 M</span><span className="text-amber">DRAG TO SPIN</span></div>
          </div>
        </section>
      </div>

      {error && <div className="container-x pt-10"><Notice>{error}</Notice></div>}

      {/* LAYERS */}
      <section id="layers" aria-labelledby="layersTitle" className="relative">
        <div className="container-x pb-[120px] pt-[140px]">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div><p className="eyebrow">DATA LAYERS</p><h2 id="layersTitle" className="h-section">SEVEN SIGNALS.<br />ONE MAP.</h2></div>
            <p className="m-0 max-w-[420px] text-[15px] leading-[1.7] text-ink-3">Each layer keeps its own source, unit and meaning. Air temperature and land surface temperature stay separate — they measure different things.</p>
          </div>
          <div className="mt-16 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' }}>
            {LAYERS.map((l) => {
              const r = site?.readings[l.key]
              return (
                <button key={l.key} type="button" onClick={() => goLayer(l.key, l.link)}
                  className="card box-border flex min-h-[220px] cursor-pointer flex-col gap-[18px] p-7 text-left text-ink transition hover:border-cyan/35">
                  <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: l.grad }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={l.key === 'next' ? '#F2F2F2' : '#000'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={l.icon} /></svg>
                  </span>
                  <div><h3 className="m-0 text-[17px] font-medium">{l.name}</h3><p className="mt-2 text-[13px] leading-[1.6] text-ink-3">{l.note}</p></div>
                  <div className="mt-auto w-full">
                    <div className="flex items-center justify-between border-t border-white/[.07] pt-4 text-[11px] tracking-[0.06em] text-ink-4">
                      <span>{l.source}</span>
                      <span className="font-display text-[13px] text-ink">{l.key === 'next' ? '→' : r ? fmtVal(r.value, r.unit === 'kWh/m²/day' ? 'kWh/m²' : r.unit) : site ? '—' : '…'}</span>
                    </div>
                    {r && <div className="mt-1.5 text-[11px] text-ink-4">{r.period} · {l.key === 'lst' || l.key === 'rain' ? 'Bengaluru mean' : 'Bengaluru cell'}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* EXPLORER */}
      <section id="explorer" aria-labelledby="explorerTitle">
        <div className="container-x pb-[120px] pt-[60px]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div><p className="eyebrow">THE EXPLORER</p><h2 id="explorerTitle" className="h-section">READ THE HEAT,<br />STREET BY STREET</h2></div>
            <CtaLink to="/explore" gradient>Open the full explorer app</CtaLink>
          </div>
          <div className="mt-14">
            {site ? <ExplorerMap data={site} boundary={boundary} active={chip} onActive={setChip} /> : <div className="flex aspect-[24/13] items-center justify-center rounded-[28px] border border-white/[.09] bg-surface-2 text-[13px] text-ink-4">{error ? 'Explorer unavailable — the BhuVyom API is offline' : 'Loading NASA data…'}</div>}
          </div>
        </div>
      </section>

      {/* TWO LABS */}
      <section id="labs" aria-labelledby="labsTitle">
        <div className="container-x pb-[120px] pt-[60px]">
          <div className="flex flex-wrap items-end justify-between gap-8">
            <div><p className="eyebrow">TWO LABS</p><h2 id="labsTitle" className="h-section">TEST TODAY.<br />SEE TOMORROW.</h2></div>
            <p className="m-0 max-w-[420px] text-[15px] leading-[1.7] text-ink-3">Each lab opens as its own page. Rain runoff runs a real model on GPM rainfall; Future Earth uses NASA’s downscaled climate projections.</p>
          </div>
          <div className="mt-16 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(520px, 100%), 1fr))' }}>
            <article className="grad-border box-border flex min-h-[440px] flex-col gap-[22px] rounded-[28px] p-9">
              <div className="flex items-center justify-between gap-4"><h3 className="m-0 font-display text-[30px] font-normal tracking-[0.06em]">SIMULATION LAB</h3><Badge>{lab ? 'SIMULATED · LIVE' : 'OFFLINE'}</Badge></div>
              <p className="m-0 max-w-[440px] text-[14px] leading-[1.7] text-ink-3">Change rain and ground cover — then compare the city before and after on the real storm footprint.</p>
              {lab ? (() => {
                const mx = Math.max(...lab.cells.map((c) => Math.max(c.today_mm ?? 0, c.scenario_mm ?? 0)), 1)
                const col = (v: number | null) => { if (v == null) return '#222'; const [r, g, b] = ramp(v / mx, RAMPS.rain); return `rgb(${r},${g},${b})` }
                return <SplitMap cells={lab.cells.map((c) => ({ id: c.id, polygon: c.polygon, before: col(c.today_mm), after: col(c.scenario_mm) }))} boundary={boundary} split={50} interactive={false} showLabels height={220} />
              })() : <div className="h-[220px] rounded-xl bg-white/[.02]" />}
              <div className="flex flex-wrap gap-2 text-[12px] text-ink-2">
                <span className="rounded-[14px] border border-white/[.12] px-3 py-1.5 opacity-50">Urban heat · not modelled</span>
                <span className="rounded-[14px] border border-cyan/40 px-3 py-1.5 text-cyan">Rain runoff</span>
                <span className="rounded-[14px] border border-white/[.12] px-3 py-1.5 opacity-50">Air flow · not modelled</span>
              </div>
              <CtaLink to="/lab" gradient className="mt-auto self-start">Open Simulation Lab</CtaLink>
            </article>
            <article className="grad-border box-border flex min-h-[440px] flex-col gap-[22px] rounded-[28px] p-9" style={{ ['--g' as string]: 'linear-gradient(135deg,#9A86B8,#E0905A,#F4C27C)' }}>
              <div className="flex items-center justify-between gap-4"><h3 className="m-0 font-display text-[30px] font-normal tracking-[0.06em]">FUTURE EARTH</h3><Badge>{future ? 'NASA CMIP6' : 'NOT ACQUIRED'}</Badge></div>
              <p className="m-0 max-w-[440px] text-[14px] leading-[1.7] text-ink-3">See how three emissions pathways could change heat and rain over Bengaluru by 2030, 2050, 2070 and 2100.</p>
              <FuturePreview data={future} />
              <div className="flex flex-wrap gap-2 text-[12px] text-ink-2">
                <span className="rounded-[14px] border border-white/[.12] px-3 py-1.5">3 climate pathways</span>
                <span className="rounded-[14px] border border-white/[.12] px-3 py-1.5">Manmade + natural drivers</span>
                <span className="rounded-[14px] border border-white/[.12] px-3 py-1.5">City metrics</span>
              </div>
              <CtaLink to="/future" gradient className="mt-auto self-start">Explore Future Earth</CtaLink>
            </article>
          </div>
        </div>
      </section>

      <Compare data={site} />

      {/* DATA SOURCES */}
      <section id="data" aria-labelledby="dataTitle">
        <div className="container-x pb-[120px] pt-[60px]">
          <p className="eyebrow">DATA SOURCES</p>
          <h2 id="dataTitle" className="h-section text-[clamp(40px,5.2vw,64px)]">BUILT ON NASA</h2>
          <div className="mt-14 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
            {[
              { name: 'NASA POWER', vars: 'Air temperature, humidity, wind, solar radiation, cloud amount and corrected precipitation from MERRA-2 and CERES.', cadence: 'Daily · monthly', res: '0.5° × 0.625°', g: 'linear-gradient(135deg,#7FE0F0,#5B8CFF)' },
              { name: 'MODIS · MOD11A1', vars: 'Land surface temperature and emissivity from the Terra satellite, day and night.', cadence: 'Daily · clear-sky', res: '1 km', g: 'linear-gradient(135deg,#9A86B8,#E0905A)' },
              { name: 'GPM IMERG', vars: 'Merged satellite precipitation estimates from the Global Precipitation Measurement mission.', cadence: 'Daily (V07 Final)', res: '0.1°', g: 'linear-gradient(135deg,#5FC4D8,#2F6BFF)' },
            ].map((d) => (
              <article key={d.name} className="grad-border rounded-3xl p-[30px]" style={{ ['--g' as string]: d.g }}>
                <h3 className="m-0 font-display text-[24px] font-normal tracking-[0.06em]">{d.name}</h3>
                <p className="mt-2.5 text-[13px] leading-[1.65] text-ink-3">{d.vars}</p>
                <div className="mt-[22px] flex gap-6 border-t border-white/[.07] pt-[18px] text-[12px]">
                  <div><div className="text-ink-4">Cadence</div><div className="mt-1">{d.cadence}</div></div>
                  <div><div className="text-ink-4">Resolution</div><div className="mt-1">{d.res}</div></div>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-[18px] text-[12px] text-ink-4">Confirmed: acquired by the BhuVyom pipeline, together with SRTM elevation (30 m), MODIS MOD13Q1 vegetation (250 m) and NASA NEX-GDDP-CMIP6 projections.</p>
        </div>
      </section>

      {/* HOW */}
      <section id="how" aria-labelledby="howTitle">
        <div className="container-x pb-[120px] pt-[60px]">
          <p className="eyebrow">HOW IT WORKS</p>
          <h2 id="howTitle" className="h-section text-[clamp(40px,5.2vw,64px)]">FROM ORBIT TO STREET</h2>
          <div aria-hidden="true" className="mt-14 h-[2px] rounded-sm" style={{ background: 'linear-gradient(90deg,#7FE0F0,#5B8CFF,#9A86B8,#E0905A)' }} />
          <ol className="m-0 grid list-none gap-6 p-0" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))' }}>
            {[['01', 'Retrieve', 'Pull each variable from NASA APIs for Bengaluru’s bounding box.'], ['02', 'Process', 'Parse, clean missing values and keep every unit explicit.'],
              ['03', 'Visualise', 'Grid the values onto a MapLibre base map with deck.gl layers.'], ['04', 'Simulate', 'Run what-if scenarios — rain runoff today; heat and air flow next.'],
              ['05', 'Validate', 'Check coordinates, units and API responses against the source.']].map(([n, t, b]) => (
              <li key={n} className="pt-6"><div className="font-display text-[13px] tracking-[0.2em] text-cyan">{n}</div><h3 className="mt-2.5 text-[17px] font-medium">{t}</h3><p className="mt-2 text-[13px] leading-[1.65] text-ink-3">{b}</p></li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA + FOOTER */}
      <section aria-labelledby="ctaTitle" className="relative overflow-hidden border-t border-white/[.07]">
        <div aria-hidden="true" className="planet-rim right-[-180px] top-[-120px] h-[640px] w-[640px]" />
        <div className="container-x relative pb-20 pt-[140px]">
          <h2 id="ctaTitle" className="m-0 font-display text-[clamp(48px,7.5vw,112px)] font-light leading-none tracking-[0.06em]">EDGE<br />OF THE<br />CITY</h2>
          <p className="mt-7 max-w-[420px] text-[15px] leading-[1.7] text-ink-2">Open the explorer and start with the latest temperature over Bengaluru.</p>
          <CtaLink to="#explorer" gradient className="mt-[30px]">Get Started</CtaLink>
          <div className="mt-[120px]"><Footer links={[{ label: 'Explorer', to: '#explorer' }, { label: 'Simulation Lab', to: '/lab' }, { label: 'Future Earth', to: '/future' }, { label: 'Data', to: '#data' }]} /></div>
        </div>
      </section>
    </div>
  )
}

function FuturePreview({ data }: { data: FutureData | null }) {
  const air = data?.metrics.find((m) => m.id === 'air' && m.available)
  if (!air?.scenarios) return <div className="flex h-[150px] items-center justify-center rounded-xl border border-dashed border-white/10 px-6 text-center text-[12px] text-ink-4">Real NASA CMIP6 pathways appear here once the projections are downloaded (backend/scripts/acquire_cmip6.py).</div>
  const series = ['ssp126', 'ssp245', 'ssp585'].map((s) => air.scenarios![s].trajectory.map((p) => p.median))
  const flat = series.flat().filter((v): v is number => v != null)
  const lo = Math.min(...flat), hi = Math.max(...flat)
  const X = (i: number) => 10 + (i * 460) / 15, Y = (v: number) => 130 - ((v - lo) / (hi - lo || 1)) * 110
  const d = (a: (number | null)[]) => a.map((v, i) => (v == null ? '' : `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)).join(' ')
  const cols = ['#7FE0F0', '#A0A0A8', '#E0905A']
  return (
    <svg role="img" aria-label="Bengaluru mean air temperature, 2025–2100, three NASA CMIP6 pathways (multi-model median)" viewBox="0 0 480 150" className="h-auto w-full">
      <path d="M0 40H480M0 85H480M0 130H480" stroke="#141418" />
      {series.map((s, i) => <path key={i} d={d(s)} stroke={cols[i]} strokeWidth={i === 1 ? 1.6 : 2.4} strokeDasharray={i === 1 ? '4 5' : undefined} fill="none" strokeLinecap="round" />)}
      <text x="10" y="148" fill="#6c6c74" fontSize="10">2025</text><text x="440" y="148" fill="#6c6c74" fontSize="10">2100</text>
    </svg>
  )
}

function Compare({ data }: { data: SiteSummary | null }) {
  const c = data?.compare
  const x = (i: number) => 24 + i * (512 / 11), y = (v: number) => 344 - 8 * v
  const path = (arr: (number | null)[]) => { let s = '', pen = false; arr.forEach((v, i) => { if (v == null) { pen = false; return } s += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; pen = true }); return s.trim() }
  const idx = c ? c.lst.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0) : []
  const area = c && idx.length > 1 ? `${idx.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(c.lst[i]!).toFixed(1)}`).join(' ')} L${x(idx[idx.length - 1]).toFixed(1)} 216 L${x(idx[0]).toFixed(1)} 216 Z` : ''
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return (
    <section aria-labelledby="cmpTitle">
      <div className="container-x grid items-center gap-12 pb-[120px] pt-[60px]" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))' }}>
        <div>
          <p className="eyebrow">HONEST DATA</p>
          <h2 id="cmpTitle" className="h-section text-[clamp(40px,5.2vw,64px)]">TWO TEMPERATURES.<br />NEVER MIXED.</h2>
          <p className="mt-[26px] max-w-[480px] text-[15px] leading-[1.75] text-ink-3">Air temperature is measured two metres above the ground. Land surface temperature is how hot the ground itself gets — roofs, roads and fields. They tell different stories, so they always appear as separate series.</p>
        </div>
        <div className="card p-7">
          <div className="flex flex-wrap gap-[18px] text-[12px] text-ink-2">
            <span className="flex items-center gap-2"><span aria-hidden="true" className="h-[3px] w-[18px] rounded-sm" style={{ background: 'linear-gradient(90deg,#5B8CFF,#7FE0F0)' }} />Air temperature · 2 m</span>
            <span className="flex items-center gap-2"><span aria-hidden="true" className="h-[3px] w-[18px] rounded-sm" style={{ background: 'linear-gradient(90deg,#9A86B8,#E0905A)' }} />Land surface temperature</span>
            <span className="ml-auto"><Badge>{c ? `NASA DATA · ${c.year}` : 'LOADING'}</Badge></span>
          </div>
          <svg role="img" aria-label={`Monthly air and land surface temperature over Bengaluru${c ? ` in ${c.year}` : ''}`} viewBox="0 0 560 240" className="mt-4 h-auto w-full">
            <defs>
              <linearGradient id="gA" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5B8CFF" /><stop offset="1" stopColor="#7FE0F0" /></linearGradient>
              <linearGradient id="gL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9A86B8" /><stop offset="1" stopColor="#E0905A" /></linearGradient>
              <linearGradient id="gLf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9A86B8" stopOpacity="0.25" /><stop offset="1" stopColor="#9A86B8" stopOpacity="0" /></linearGradient>
            </defs>
            <path d="M24 24H540M24 84H540M24 144H540M24 204H540" stroke="#141418" />
            <g fontSize="10" fill="#6c6c74"><text x="2" y="27">40°</text><text x="2" y="87">32.5°</text><text x="2" y="147">25°</text><text x="2" y="207">17.5°</text></g>
            {c && <>
              <path d={area} fill="url(#gLf)" />
              <path d={path(c.lst)} stroke="url(#gL)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d={path(c.air)} stroke="url(#gA)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {c.air.map((v, i) => v != null && <circle key={`a${i}`} cx={x(i)} cy={y(v)} r="3" fill="#7FE0F0"><title>{`Air ${M[i]} ${c.year}: ${v.toFixed(1)} °C`}</title></circle>)}
              {c.lst.map((v, i) => v != null && <circle key={`l${i}`} cx={x(i)} cy={y(v)} r="3" fill="#E0905A"><title>{`Land surface ${M[i]} ${c.year}: ${v.toFixed(1)} °C`}</title></circle>)}
            </>}
          </svg>
          <div className="flex justify-between pl-[4%] pr-[2%] text-[11px] text-ink-4">{'JFMAMJJASOND'.split('').map((m, i) => <span key={i}>{m}</span>)}</div>
          {c && <p className="mt-3 text-[11px] leading-[1.6] text-ink-4">{c.year} monthly means. Air: {c.air_source}. Land surface: {c.lst_source} — acquired for Jan–Mar {c.year} only, so the line stops there rather than being filled in.</p>}
        </div>
      </div>
    </section>
  )
}
