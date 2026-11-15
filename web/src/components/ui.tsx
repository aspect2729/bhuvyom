import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** Text call-to-action: label, 58×2 amber underline, amber chevron (Edge of Space reference). */
export function CtaLink({ to, children, gradient, className = '' }: { to: string; children: ReactNode; gradient?: boolean; className?: string }) {
  const inner = (
    <>
      <span className="relative pb-2">{children}<span aria-hidden="true" className="absolute bottom-0 left-0 h-[2px] w-[58px] rounded-sm" style={{ background: gradient ? 'linear-gradient(90deg,#E9A15A,#D9783F)' : '#E9A15A' }} /></span>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#E9A15A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2l4 4-4 4" /></svg>
    </>
  )
  const cls = `inline-flex items-center gap-3.5 py-2 text-[16px] font-medium text-ink no-underline hover:text-ink ${className}`
  return to.startsWith('#') ? <a href={to} className={cls}>{inner}</a> : <Link to={to} className={cls}>{inner}</Link>
}

export function Badge({ children, tone = 'amber', outline = false }: { children: ReactNode; tone?: 'amber' | 'cyan' | 'grey'; outline?: boolean }) {
  const c = tone === 'amber' ? '#E9A15A' : tone === 'cyan' ? '#7FE0F0' : '#A0A0A8'
  return <span className="whitespace-nowrap text-[10px] tracking-[0.1em]" style={{ color: c, ...(outline ? { padding: '4px 10px', borderRadius: 10, border: `1px solid ${c}80` } : {}) }}>{children}</span>
}

/** Design slider: 4px track, spectrum fill, black thumb with ring; real <input type=range> overlaid (keyboard accessible). */
export function RangeSlider({ id, label, display, value, onChange, todayPct, disabled, min = 0, max = 100, step = 1 }: {
  id: string; label: string; display: string; value: number; onChange: (v: number) => void; todayPct?: number; disabled?: boolean; min?: number; max?: number; step?: number
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ opacity: disabled ? 0.4 : 1 } as CSSProperties}>
      <div className="flex justify-between gap-3 text-[13px]"><label htmlFor={id} className="text-ink-2">{label}</label><span className="whitespace-nowrap font-medium">{display}</span></div>
      <div className="relative mt-1 h-[26px]">
        <div aria-hidden="true" className="absolute inset-x-0 top-[11px] h-1 rounded-sm bg-[#16161A]" />
        <div aria-hidden="true" className="absolute left-0 top-[11px] h-1 rounded-sm" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#7FE0F0,#5B8CFF,#9A86B8)' }} />
        {todayPct != null && <span aria-hidden="true" className="absolute top-2 -ml-px h-2.5 w-[2px] bg-amber" style={{ left: `${todayPct}%` }} />}
        <span aria-hidden="true" className="absolute top-[5px] -ml-2 box-border h-4 w-4 rounded-full border-2 border-ink bg-black" style={{ left: `${pct}%` }} />
        <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 m-0 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
      </div>
    </div>
  )
}

export function Footer({ links, credit = true }: { links: { label: string; to: string }[]; credit?: boolean }) {
  return (
    <footer className="flex flex-wrap justify-between gap-6 border-t border-white/[.08] pt-7 text-[12px] text-ink-4">
      <span>BhuVyom · NASA Hackathon project</span>
      {credit && <span>Earth imagery: NASA Blue Marble, Black Marble and cloud composite · Data: NASA POWER, MODIS, GPM IMERG, SRTM, NEX-GDDP-CMIP6 · Map © OpenStreetMap, CARTO</span>}
      <nav aria-label="Footer" className="flex flex-wrap gap-[18px]">
        {links.map((l) => (l.to.startsWith('#') ? <a key={l.label} href={l.to} className="text-ink-2">{l.label}</a> : <Link key={l.label} to={l.to} className="text-ink-2">{l.label}</Link>))}
      </nav>
    </footer>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-amber/40 bg-black/70 px-4 py-3 text-[12.5px] leading-relaxed text-amber/90">{children}</div>
}
