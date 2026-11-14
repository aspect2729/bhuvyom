import { useEffect, useRef } from 'react'
import '../vendor/earth-shader.js'
import '../vendor/earth-globe.js'

type Layout = (cw: number) => EarthGlobeLayout[]

const TEX = {
  day: '/assets/textures/earth_day_8k.jpg', lights: '/assets/textures/earth_lights_8k.jpg', clouds: '/assets/textures/earth_clouds_8k.jpg',
  ocean: '/assets/textures/earth_ocean_mask_4k.jpg', bump: '/assets/textures/earth_bump_4k.jpg',
}

/** Photoreal WebGL2 Earth (design package's ray-traced sphere), Bengaluru marker pulsing in amber. */
export function Globe({ height, layout, label }: { height: number; layout: Layout; label?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  useEffect(() => {
    // The canvas is created here (not in JSX): destroy() loses the WebGL context for good, so a remount
    // (React StrictMode, route changes) must get a fresh canvas.
    const el = host.current
    if (!el || !window.EarthGlobe) return
    const cv = document.createElement('canvas')
    cv.setAttribute('role', 'img')
    cv.setAttribute('aria-label', label ?? 'Rotating Earth rendered from NASA Blue Marble, Black Marble and cloud imagery')
    Object.assign(cv.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: `${height}px`, display: 'block', cursor: 'grab', touchAction: 'pan-y' })
    el.appendChild(cv)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let g: EarthGlobeInstance | null = null
    try {
      g = new window.EarthGlobe(cv, {
        textures: TEX, atmosphere: [0.36, 0.56, 0.95], markerColor: [0.92, 0.63, 0.35], startLon: 1.3542 + 0.5,
        spin: reduce ? 0 : 1, layout: (cw) => layoutRef.current(cw),
      })
    } catch (e) { console.warn('WebGL2 unavailable — globe disabled', e) }
    return () => { g?.destroy?.(); cv.remove() }
  }, [height, label])
  return <div ref={host} className="absolute inset-x-0 top-0" style={{ height }} />
}

export const heroLayout = (H: number): Layout => (cw) => {
  const mob = cw < 900
  const R = mob ? Math.max(200, cw * 0.62) : Math.min(cw * 0.37, 580)
  return [{ cx: mob ? cw * 0.62 : cw * 0.74, cy: mob ? H - R * 0.55 : 500, r: R, lat: 0.24, sun: [-0.72, 0.32, 0.62], mark: 1, clipTop: 0, clipBottom: H }]
}
export const futureLayout = (H: number): Layout => (cw) => {
  const mob = cw < 900
  const R = mob ? Math.max(190, cw * 0.55) : Math.min(cw * 0.3, 480)
  return [{ cx: mob ? cw * 0.66 : cw * 0.8, cy: mob ? 640 : 420, r: R, lat: 0.22, sun: [-0.62, 0.36, 0.7], mark: 1, clipTop: 0, clipBottom: H }]
}
