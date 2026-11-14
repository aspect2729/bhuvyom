import { useEffect, useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer, PolygonLayer } from '@deck.gl/layers'
import { WebMercatorViewport, type MapViewState, type PickingInfo } from '@deck.gl/core'
import Map from 'react-map-gl/maplibre'
import type { Cell, EngineResult } from '../lib/types'
import { type ColorScale, valueAt } from '../lib/color'

const BASEMAP = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

interface Props {
  result: EngineResult | null
  field: string
  timeIndex: number
  scale: ColorScale | null
  selectedCell: string | null
  onSelectCell: (id: string | null) => void
  boundary: GeoJSON.FeatureCollection | null
}

type View = MapViewState

function fit(cells: Cell[], w: number, h: number): View {
  let W = 180, E = -180, S = 90, N = -90
  for (const c of cells) for (const [x, y] of c.polygon) { W = Math.min(W, x); E = Math.max(E, x); S = Math.min(S, y); N = Math.max(N, y) }
  const vp = new WebMercatorViewport({ width: Math.max(w, 400), height: Math.max(h, 300) })
  const { longitude, latitude, zoom } = vp.fitBounds([[W, S], [E, N]], { padding: { top: 80, bottom: 120, left: 360, right: 80 } })
  return { longitude, latitude, zoom, pitch: 0, bearing: 0 }
}

export function MapView({ result, field, timeIndex, scale, selectedCell, onSelectCell, boundary }: Props) {
  const [view, setView] = useState<View>({ longitude: 77.6, latitude: 12.97, zoom: 9, pitch: 0, bearing: 0 })
  const [hover, setHover] = useState<{ x: number; y: number; cell: Cell } | null>(null)

  useEffect(() => {
    setHover(null)
    if (result?.grid.cells.length) setView(fit(result.grid.cells, window.innerWidth, window.innerHeight))
  }, [result?.result_id, result?.grid.cells])

  const f = result?.grid.fields[field]
  const sig = result?.grid.fields['significance_class']
  const showSig = !!sig && field !== 'significance_class' && f?.role !== 'quality'

  const layers = useMemo(() => {
    const out = []
    if (result && f && scale) {
      out.push(
        new PolygonLayer<Cell>({
          id: `cells-${result.result_id}`,
          data: result.grid.cells,
          getPolygon: (c) => c.polygon,
          getFillColor: (c) => scale.toColor(valueAt(f, c.id, timeIndex)),
          getLineColor: (c) => {
            if (c.id === selectedCell) return [255, 255, 255, 255]
            if (showSig) { const s = valueAt(sig!, c.id, 0); return s === 2 ? [240, 249, 255, 235] : s === 1 ? [148, 163, 184, 200] : [0, 0, 0, 0] }
            return [15, 23, 42, result.grid.cells.length > 500 ? 0 : 160]
          },
          getLineWidth: (c) => (c.id === selectedCell ? 3 : showSig ? (valueAt(sig!, c.id, 0) === 2 ? 3 : 1.2) : 0.6),
          lineWidthUnits: 'pixels',
          stroked: true,
          filled: true,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 60],
          updateTriggers: { getFillColor: [field, timeIndex, scale], getLineColor: [selectedCell, field], getLineWidth: [selectedCell, field] },
          onHover: (i: PickingInfo<Cell>) => setHover(i.object ? { x: i.x, y: i.y, cell: i.object } : null),
          onClick: (i: PickingInfo<Cell>) => onSelectCell(i.object ? i.object.id : null),
        }),
      )
    }
    if (boundary) {
      out.push(new GeoJsonLayer({ id: 'bbmp', data: boundary, stroked: true, filled: false, getLineColor: [56, 189, 248, 230], getLineWidth: 2, lineWidthUnits: 'pixels', pickable: false }))
    }
    return out
  }, [result, f, scale, field, timeIndex, selectedCell, boundary, sig, showSig, onSelectCell])

  const hv = hover && f ? valueAt(f, hover.cell.id, timeIndex) : null
  const time = result?.grid.times.length && f?.kind === 'time_series' ? result.grid.times[timeIndex] : result?.temporal_coverage ? `${result.temporal_coverage.start} – ${result.temporal_coverage.end}` : ''
  return (
    <div className="absolute inset-0">
      <DeckGL viewState={view} onViewStateChange={(e) => setView(e.viewState as unknown as View)} controller layers={layers} getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}>
        <Map mapStyle={BASEMAP} attributionControl={{ compact: true }} />
      </DeckGL>
      {hover && f && result && (
        <div className="pointer-events-none absolute z-20 max-w-xs rounded-md border border-cyan-400/30 bg-slate-950/90 px-3 py-2 text-xs shadow-xl backdrop-blur" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="font-medium text-white">{f.label}</div>
          <div className="mt-0.5 font-mono text-base text-cyan-200">{hv == null ? 'no data' : `${hv.toFixed(Math.abs(hv) < 10 ? 2 : 1)} ${f.unit}`}</div>
          <div className="mt-1 text-white/55">{time}</div>
          <div className="text-white/55">{result.sources.map((s) => String(s.product ?? s.dataset_id)).join(' · ')}</div>
          <div className="text-white/55">Resolution: {result.effective_resolution}</div>
          <div className="text-white/40">cell {hover.cell.id} · {hover.cell.center[1].toFixed(3)}°N {hover.cell.center[0].toFixed(3)}°E</div>
        </div>
      )}
    </div>
  )
}
