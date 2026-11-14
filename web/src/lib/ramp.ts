export type Stop = [number, [number, number, number]]
export const RAMPS: Record<string, Stop[]> = {
  air: [[0, [24, 40, 90]], [0.3, [91, 140, 255]], [0.6, [127, 224, 240]], [0.85, [224, 144, 90]], [1, [244, 194, 124]]],
  lst: [[0, [40, 30, 70]], [0.35, [154, 134, 184]], [0.7, [224, 144, 90]], [1, [250, 214, 150]]],
  rain: [[0, [6, 12, 24]], [0.4, [47, 107, 255]], [0.8, [127, 224, 240]], [1, [230, 250, 255]]],
  rh: [[0, [20, 20, 40]], [0.5, [95, 196, 216]], [1, [200, 214, 255]]],
  wind: [[0, [20, 16, 40]], [0.5, [154, 134, 184]], [1, [169, 232, 245]]],
}
export function ramp(t: number, stops: Stop[]): [number, number, number] {
  t = Math.max(0, Math.min(1, t))
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const a = stops[i - 1], b = stops[i], k = (t - a[0]) / (b[0] - a[0])
    return a[1].map((v, j) => Math.round(v + (b[1][j] - v) * k)) as [number, number, number]
  }
  return stops[stops.length - 1][1]
}
export const rampCss = (stops: Stop[]) => 'linear-gradient(90deg,' + stops.map((s) => `rgb(${s[1].join(',')}) ${Math.round(s[0] * 100)}%`).join(',') + ')'
export const fmtNum = (v: number | null | undefined, dp = 1) => (v == null ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }).replace('-', '−'))
export const fmtVal = (v: number | null | undefined, unit: string) => (v == null ? 'No data' : `${fmtNum(v, Math.abs(v) >= 100 ? 0 : 1)} ${unit}`)
