import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { Deck, WebMercatorViewport, type MapViewState, type PickingInfo } from '@deck.gl/core'
import { GeoJsonLayer, PolygonLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { LngLat, SiteCell, SiteSummary } from '../lib/api'
import { RAMPS, fmtVal, ramp, rampCss } from '../lib/ramp'

// Approximate locality centres — used ONLY to name the selected point, never in a calculation.
const PLACES: [string, number, number][] = [
  ['Shivajinagar', 12.99, 77.6], ['Malleshwaram', 13.003, 77.57], ['Rajajinagar', 12.991, 77.554], ['Indiranagar', 12.978, 77.64],
  ['Koramangala', 12.935, 77.624], ['Jayanagar', 12.925, 77.583], ['BTM Layout', 12.917, 77.61], ['Banashankari', 12.925, 77.546],
  ['Hebbal', 13.035, 77.597], ['Yelahanka', 13.1, 77.596], ['Whitefield', 12.97, 77.75], ['Marathahalli', 12.959, 77.697],
  ['Electronic City', 12.845, 77.66], ['Kengeri', 12.9, 77.483], ['Yeshwanthpur', 13.023, 77.55], ['KR Puram', 13.007, 77.696],
  ['HSR Layout', 12.912, 77.638], ['Bellandur', 12.926, 77.676], ['Vijayanagar', 12.971, 77.537], ['Peenya', 13.03, 77.52],
]
const placeName = (lat: number, lon: number) => {
  let best = '', bd = Infinity
  for (const [n, a, o] of PLACES) { const d = Math.hypot((a - lat) * 111, (o - lon) * 108); if (d < bd) { bd = d; best = n } }
  return bd < 2.5 ? best.toUpperCase() : bd < 6 ? `NEAR ${best.toUpperCase()}` : 'BENGALURU REGION'
}
const inPoly = (pt: LngLat, poly: LngLat[]) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export const CHIPS: [string, string][] = [['air', 'Air temperature'], ['lst', 'Land surface'], ['rain', 'Precipitation'], ['rh', 'Humidity'], ['wind', 'Wind']]

/** The Explorer frame (design §3) on a real MapLibre + deck.gl map of NASA data. */
export function ExplorerMap({ data, boundary, active, onActive }: { data: SiteSummary; boundary: GeoJSON.FeatureCollection | null; active: string; onActive: (k: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const deckRef = useRef<Deck | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [point, setPoint] = useState<LngLat>([77.6, 12.99]) // Shivajinagar
  const lay = data.layers[active]

  useEffect(() => {
    const el = host.current!
    const map = new maplibregl.Map({ container: el, style: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json', interactive: false, attributionControl: { compact: true }, center: [77.59, 12.97], zoom: 9.5 })
    const deck = new Deck({
      parent: el, style: { position: 'absolute', inset: '0', zIndex: '1' } as Partial<CSSStyleDeclaration>,
      initialViewState: { longitude: 77.59, latitude: 12.97, zoom: 9.5 }, controller: { scrollZoom: false, dragRotate: false }, layers: [],
      onViewStateChange: ({ viewState }) => { const v = viewState as MapViewState; map.jumpTo({ center: [v.longitude, v.latitude], zoom: v.zoom }); deck.setProps({ viewState: v }) },
      onClick: (info: PickingInfo) => { if (info.coordinate) setPoint([info.coordinate[0], info.coordinate[1]]) },
      getCursor: ({ isDragging }) => (isDragging ? 'grabbing' : 'crosshair'),
    })
    mapRef.current = map; deckRef.current = deck
    return () => { deck.finalize(); map.remove() }
  }, [])

  // fit to the active layer
  useEffect(() => {
    const el = host.current, deck = deckRef.current, map = mapRef.current
    if (!el || !deck || !map) return
    const fit = () => {
      let W = 180, E = -180, S = 90, N = -90
      for (const c of lay.cells) for (const [x, y] of c.polygon) { W = Math.min(W, x); E = Math.max(E, x); S = Math.min(S, y); N = Math.max(N, y) }
      const f = new WebMercatorViewport({ width: el.clientWidth || 800, height: el.clientHeight || 430 }).fitBounds([[W, S], [E, N]], { padding: 24 })
      const v: MapViewState = { longitude: f.longitude, latitude: f.latitude, zoom: f.zoom, pitch: 0, bearing: 0 }
      map.jumpTo({ center: [v.longitude, v.latitude], zoom: v.zoom }); deck.setProps({ viewState: v })
    }
    fit()
    const ro = new ResizeObserver(fit); ro.observe(el)
    return () => ro.disconnect()
  }, [lay])

  const stops = RAMPS[active]
  const lo = lay.lo ?? 0, span = (lay.hi ?? 1) - lo || 1
  const sel = lay.cells.find((c) => inPoly(point, c.polygon)) ?? null
  useEffect(() => {
    deckRef.current?.setProps({
      layers: [
        new PolygonLayer<SiteCell>({
          id: `cells-${active}`, data: lay.cells, getPolygon: (c) => c.polygon, stroked: true,
          getFillColor: (c) => (c.v == null ? [60, 60, 70, 40] : [...ramp((c.v - lo) / span, stops), 205] as [number, number, number, number]),
          getLineColor: (c) => (sel && c.id === sel.id ? [242, 242, 242, 255] : [0, 0, 0, lay.cells.length > 200 ? 0 : 140]),
          getLineWidth: (c) => (sel && c.id === sel.id ? 2.5 : 1), lineWidthUnits: 'pixels', updateTriggers: { getLineColor: [sel?.id], getLineWidth: [sel?.id] },
        }),
        ...(boundary ? [new GeoJsonLayer({ id: 'bbmp', data: boundary, stroked: true, filled: false, getLineColor: [233, 161, 90, 230], getLineWidth: 1.6, lineWidthUnits: 'pixels' })] : []),
        new ScatterplotLayer<LngLat>({ id: 'pt', data: [point], getPosition: (d) => d, getRadius: 5, radiusUnits: 'pixels', getFillColor: [233, 161, 90, 255], getLineColor: [0, 0, 0, 255], stroked: true, lineWidthMinPixels: 1.5 }),
      ],
    })
  }, [lay, active, boundary, point, sel, lo, span, stops])

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/[.09] bg-surface-2">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[.07] px-5 py-3.5">
        <div className="flex flex-wrap gap-2">
          {CHIPS.map(([k, label]) => {
            const on = k === active
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => onActive(k)}
                className="h-9 cursor-pointer rounded-[18px] px-3.5 text-[12px]"
                style={{ color: on ? '#000' : '#C9C9CE', border: `1px solid ${on ? 'transparent' : 'rgba(255,255,255,0.14)'}`, background: on ? 'linear-gradient(90deg,#7FE0F0,#5B8CFF)' : 'transparent' }}>{label}</button>
            )
          })}
        </div>
        <div className="flex items-center gap-2.5 text-[12px] text-ink-3">{lay.period}
          <span className="rounded-[10px] border border-amber/50 px-2.5 py-1 text-[10px] tracking-[0.1em] text-amber">NASA DATA</span>
        </div>
      </div>
      <div className="relative p-[18px]">
        <div ref={host} role="application" aria-label="Map of Bengaluru with the selected NASA data layer. Click to read a value."
          className="relative min-h-[360px] w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '24 / 13' }} />
        <div className="pointer-events-none absolute left-[46%] top-[30%] z-[2] min-w-[200px] rounded-2xl px-4 py-3.5 max-[640px]:left-6 max-[640px]:top-6"
          style={{ border: '1px solid transparent', background: 'linear-gradient(rgba(5,5,6,0.94),rgba(5,5,6,0.94)) padding-box, linear-gradient(135deg,#7FE0F0,#5B8CFF,#9A86B8) border-box' }}>
          <div className="font-display text-[16px] tracking-[0.08em]">{placeName(point[1], point[0])}</div>
          <div className="mt-0.5 text-[11px] text-ink-4">{point[1].toFixed(2)}° N · {point[0].toFixed(2)}° E</div>
          <div className="mt-2.5 flex justify-between gap-6 text-[12px]"><span className="text-ink-2">{lay.label}</span><span className="font-medium">{fmtVal(sel?.v ?? null, lay.unit)}</span></div>
        </div>
        <div className="pointer-events-none absolute bottom-[34px] left-[34px] z-[2] box-border w-[min(280px,70%)] rounded-2xl border border-white/10 bg-black/85 px-4 py-3.5">
          <div className="text-[12px]">{lay.label}</div>
          <div aria-hidden="true" className="mt-2.5 h-2 rounded" style={{ background: rampCss(stops) }} />
          <div className="mt-1.5 flex justify-between text-[11px] text-ink-4"><span>{fmtVal(lay.lo, lay.unit)}</span><span>{fmtVal(lay.hi, lay.unit)}</span></div>
          <div className="mt-1.5 text-[10px] leading-normal text-ink-4">{lay.source}<br />Resolution: {lay.resolution}</div>
        </div>
      </div>
    </div>
  )
}
