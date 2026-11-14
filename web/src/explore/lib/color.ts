import { scaleDiverging, scaleSequential } from 'd3-scale'
import { interpolateBlues, interpolateInferno, interpolateRdBu, interpolateViridis, interpolatePuBu, interpolateYlGn } from 'd3-scale-chromatic'
import { color as d3color } from 'd3-color'
import type { FieldSpec } from './types'

export type RGBA = [number, number, number, number]
export type ScaleKind = 'diverging' | 'temperature' | 'water' | 'quality' | 'generic'

export interface ColorScale {
  kind: ScaleKind
  domain: [number, number]
  toColor: (v: number | null | undefined) => RGBA
  ramp: (t: number) => string
}

const MISSING: RGBA = [90, 98, 110, 40]

function rgba(css: string, a = 200): RGBA {
  const c = d3color(css)?.rgb()
  return c ? [c.r, c.g, c.b, a] : MISSING
}

export function scaleKind(name: string, f: FieldSpec): ScaleKind {
  if (f.role === 'quality' && name === 'significance_class') return 'quality'
  if (/slope|anomaly|difference|diff_/.test(name)) return 'diverging'
  if (/°C|^C$/.test(f.unit)) return 'temperature'
  if (/mm/.test(f.unit)) return 'water'
  return 'generic'
}

/** Visual normalisation only: domain spans all values of the field (all times) so colours stay stable while animating. */
export function buildScale(name: string, f: FieldSpec): ColorScale {
  const kind = scaleKind(name, f)
  // loop instead of Math.min(...arr): LST has ~2×10^5 values (spread would overflow the call stack)
  let lo = Infinity, hi = -Infinity
  const see = (x: number | null | undefined) => { if (x != null) { if (x < lo) lo = x; if (x > hi) hi = x } }
  for (const v of Object.values(f.values)) {
    if (Array.isArray(v)) v.forEach(see)
    else see(v)
  }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1 }
  if (kind === 'quality') {
    const cols: Record<number, RGBA> = { 0: [70, 80, 100, 120], 1: [148, 163, 184, 190], 2: [125, 211, 252, 230] }
    return { kind, domain: [0, 2], toColor: (v) => (v == null ? MISSING : cols[v] ?? MISSING), ramp: (t) => (t < 0.33 ? '#465064' : t < 0.66 ? '#94a3b8' : '#7dd3fc') }
  }
  if (kind === 'diverging') {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1
    const s = scaleDiverging((t: number) => interpolateRdBu(1 - t)).domain([-m, 0, m])
    return { kind, domain: [-m, m], toColor: (v) => (v == null ? MISSING : rgba(s(v) as string)), ramp: (t) => interpolateRdBu(1 - t) }
  }
  const interp = kind === 'temperature' ? interpolateInferno : kind === 'water' ? interpolateBlues : name.includes('elev') ? interpolatePuBu : name.includes('ndvi') ? interpolateYlGn : interpolateViridis
  const s = scaleSequential(interp).domain([lo, hi === lo ? lo + 1 : hi])
  return { kind, domain: [lo, hi], toColor: (v) => (v == null ? MISSING : rgba(s(v) as string)), ramp: (t) => interp(kind === 'water' ? 0.15 + 0.85 * t : t) }
}

export function valueAt(f: FieldSpec, cellId: string, t: number): number | null {
  const v = f.values[cellId]
  if (Array.isArray(v)) return v[t] ?? null
  return (v as number | null | undefined) ?? null
}

export const TYPE_COLORS: Record<string, string> = {
  observed: '#22d3ee',
  analysed: '#818cf8',
  predicted: '#a78bfa',
  simulated: '#fb923c',
}
