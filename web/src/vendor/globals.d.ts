// Vanilla design-package modules (src/vendor/*.js) attach these to window.
interface EarthGlobeLayout { cx: number; cy: number; r: number; lat: number; sun: number[]; mark: number; clipTop: number; clipBottom: number }
interface EarthGlobeOptions {
  textures: Record<'day' | 'lights' | 'clouds' | 'ocean' | 'bump', string>
  atmosphere?: number[]; markerColor?: number[]; startLon?: number; spin?: number
  layout: (cw: number) => EarthGlobeLayout[]
}
interface EarthGlobeInstance { destroy?: () => void }
interface SpaceAmbienceInstance { toggle: () => boolean }
interface Window {
  EarthGlobe: new (canvas: HTMLCanvasElement, opts: EarthGlobeOptions) => EarthGlobeInstance
  SpaceAmbience: new () => SpaceAmbienceInstance
}
