import { useMemo } from 'react'
import type { LngLat } from '../lib/api'

export interface SplitCell { id: string; polygon: LngLat[]; before: string; after: string; title?: string }

/** Before/after map drawn in SVG from real cell polygons (equirectangular with cos-lat scaling — fine for a 0.4° area).
 *  Left of the divider shows "before", right shows "after". The BBMP outline is drawn on top. */
export function SplitMap({ cells, boundary, split, onSplit, interactive = true, showLabels = true, height }: {
  cells: SplitCell[]; boundary: GeoJSON.FeatureCollection | null; split: number; onSplit?: (v: number) => void; interactive?: boolean; showLabels?: boolean; height?: number
}) {
  const geo = useMemo(() => {
    let W = 180, E = -180, S = 90, N = -90
    for (const c of cells) for (const [x, y] of c.polygon) { W = Math.min(W, x); E = Math.max(E, x); S = Math.min(S, y); N = Math.max(N, y) }
    const k = Math.cos(((S + N) / 2) * Math.PI / 180)
    const w = (E - W) * k, h = N - S
    const VW = 1000, VH = (VW * h) / w
    const P = ([x, y]: LngLat) => `${(((x - W) * k) / w) * VW},${((N - y) / h) * VH}`
    const ring = (r: LngLat[]) => 'M' + r.map(P).join('L') + 'Z'
    const outline: string[] = []
    for (const f of boundary?.features ?? []) {
      const g = f.geometry
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
      for (const p of polys) outline.push(ring(p[0] as LngLat[]))
    }
    return { VW, VH, ring, outline }
  }, [cells, boundary])
  const sx = (split / 100) * geo.VW
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${geo.VW} ${geo.VH}`} className="block w-full" style={height ? { height } : undefined} role="img" aria-label="Map of Bengaluru: before (left of divider) and after (right)">
        <defs>
          <clipPath id="clipL"><rect x="0" y="0" width={sx} height={geo.VH} /></clipPath>
          <clipPath id="clipR"><rect x={sx} y="0" width={geo.VW - sx} height={geo.VH} /></clipPath>
        </defs>
        <g clipPath="url(#clipL)">{cells.map((c) => <path key={c.id} d={geo.ring(c.polygon)} fill={c.before} stroke="#000" strokeWidth="3"><title>{c.title}</title></path>)}</g>
        <g clipPath="url(#clipR)">{cells.map((c) => <path key={c.id} d={geo.ring(c.polygon)} fill={c.after} stroke="#000" strokeWidth="3"><title>{c.title}</title></path>)}</g>
        {geo.outline.map((d, i) => <path key={i} d={d} fill="none" stroke="#E9A15A" strokeWidth="2.2" opacity="0.9" />)}
      </svg>
      <div aria-hidden="true" className="absolute -bottom-1.5 -top-1.5 -ml-px w-[2px] bg-ink shadow-[0_0_12px_rgba(0,0,0,0.6)]" style={{ left: `${split}%` }} />
      {interactive && (
        <span aria-hidden="true" className="absolute top-1/2 -ml-5 -mt-5 flex h-10 w-10 items-center justify-center rounded-full border border-ink bg-black/75 backdrop-blur" style={{ left: `${split}%` }}>
          <svg width="18" height="12" viewBox="0 0 18 12" fill="none" stroke="#F2F2F2" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L2 6l4 4M12 2l4 4-4 4" /></svg>
        </span>
      )}
      {showLabels && <>
        <span className="absolute left-3 top-3 rounded-[10px] bg-black/75 px-2.5 py-1 text-[10px] tracking-[0.14em]">BEFORE · TODAY</span>
        <span className="absolute right-3 top-3 rounded-[10px] bg-black/75 px-2.5 py-1 text-[10px] tracking-[0.14em] text-cyan">AFTER · YOUR SCENARIO</span>
      </>}
      {interactive && onSplit && (
        <input type="range" min={5} max={95} value={split} onChange={(e) => onSplit(Number(e.target.value))} aria-label="Move the before and after divider"
          className="absolute inset-0 m-0 h-full w-full cursor-ew-resize opacity-0" />
      )}
    </div>
  )
}
