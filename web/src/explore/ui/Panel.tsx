import type { ReactNode } from 'react'
import { TYPE_COLORS } from '../lib/color'

export function Panel({ title, children, className = '', right }: { title?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`pointer-events-auto rounded-xl border border-white/8 bg-[#0b0f17]/88 shadow-[0_8px_30px_rgba(0,0,0,0.45)] backdrop-blur-md ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-white/6 px-3.5 py-2">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</h2>
          {right}
        </header>
      )}
      <div className="p-3.5">{children}</div>
    </section>
  )
}

export function TypeBadge({ type }: { type: string }) {
  const c = TYPE_COLORS[type] ?? '#94a3b8'
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: c, background: `${c}1f`, border: `1px solid ${c}55` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {type}
    </span>
  )
}
