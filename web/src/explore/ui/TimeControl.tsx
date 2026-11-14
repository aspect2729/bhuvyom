import { useEffect, useState } from 'react'

export function TimeControl({ times, index, valid, onIndex }: { times: string[]; index: number; valid: number[]; onIndex: (i: number) => void }) {
  const [playing, setPlaying] = useState(false)
  const pos = Math.max(0, valid.indexOf(index))
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      const next = valid[(valid.indexOf(index) + 1) % valid.length]
      onIndex(next)
    }, 450)
    return () => window.clearInterval(id)
  }, [playing, index, valid, onIndex])
  if (valid.length < 2) return null
  const step = (d: number) => onIndex(valid[Math.min(valid.length - 1, Math.max(0, pos + d))])
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/8 bg-[#0b0f17]/90 px-4 py-2.5 shadow-xl backdrop-blur-md">
      <button onClick={() => step(-1)} className="rounded px-1.5 text-slate-300 hover:text-white" aria-label="previous">◀</button>
      <button onClick={() => setPlaying((p) => !p)} className="w-16 rounded-md bg-gradient-to-r from-cyan-500/30 to-indigo-500/30 py-1 text-[12px] font-semibold text-white ring-1 ring-cyan-400/40">{playing ? 'Pause' : 'Play'}</button>
      <button onClick={() => step(1)} className="rounded px-1.5 text-slate-300 hover:text-white" aria-label="next">▶</button>
      <input type="range" min={0} max={valid.length - 1} value={pos} onChange={(e) => onIndex(valid[+e.target.value])} className="w-[420px] accent-cyan-400" />
      <div className="min-w-[96px] text-right font-mono text-[13px] text-cyan-200">{times[index]}</div>
      <div className="text-[10.5px] text-slate-500">{valid.length} actual timesteps</div>
    </div>
  )
}
