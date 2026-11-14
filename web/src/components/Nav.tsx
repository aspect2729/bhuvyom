import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

export interface NavItem { label: string; to: string }

/** Floating glass pill (design §0). Links collapse into a menu button below 760 px. */
export function Nav({ items, right }: { items: NavItem[]; right: ReactNode }) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname, loc.hash])
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])
  const isCurrent = (to: string) => !to.includes('#') && to === loc.pathname
  return (
    <header className="absolute inset-x-0 top-[18px] z-30 px-5">
      <div className="glass-pill mx-auto box-border flex min-h-[68px] max-w-[1320px] flex-wrap items-center justify-between gap-6 py-2.5 pl-7 pr-3 max-[760px]:gap-2.5 max-[760px]:pl-[18px] max-[760px]:pr-2">
        <Link to="/" className="flex items-baseline gap-3.5 text-ink no-underline">
          <span className="font-display text-[15px] tracking-[0.22em] max-[760px]:text-[12px] max-[760px]:tracking-[0.12em]">BENGALURU FROM ORBIT</span>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-[3px] bg-amber" />
        </Link>
        <nav id="primary-nav" aria-label="Primary" className={`flex flex-wrap gap-1 max-[760px]:order-3 max-[760px]:w-full max-[760px]:flex-col max-[760px]:gap-0 ${open ? '' : 'max-[760px]:hidden'}`}>
          {items.map((it) => (
            <Link key={it.label} to={it.to} aria-current={isCurrent(it.to) ? 'page' : undefined}
              className="relative px-3.5 py-3 text-[13px] text-ink no-underline hover:text-cyan max-[760px]:border-t max-[760px]:border-white/[.08] max-[760px]:px-1.5">
              {it.label}
              {isCurrent(it.to) && <span aria-hidden="true" className="absolute inset-x-3.5 bottom-[5px] h-[2px] rounded-sm bg-amber max-[760px]:hidden" />}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="primary-nav" aria-label={open ? 'Close menu' : 'Open menu'}
            className="hidden h-11 w-11 cursor-pointer items-center justify-center rounded-[22px] border border-white/[.18] bg-white/[.06] max-[760px]:flex">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#F2F2F2" strokeWidth="1.6" strokeLinecap="round"><path d="M3 5h12M3 9h12M3 13h12" /></svg>
          </button>
          {right}
        </div>
      </div>
    </header>
  )
}
