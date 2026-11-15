/**
 * Region bounds and regular lat/lon grids — android-handoff docs/04 §1.
 */
import type { Region } from '@/lib/geo';

export const BLR = { lat: 12.9716, lon: 77.5946 } as const;

export const BOUNDS = {
  ka: { s: 11.5, n: 18.5, w: 74.0, e: 78.6 },
  blr: { s: 12.62, n: 13.27, w: 77.28, e: 77.87 },
} as const;

/** Simulate grid sizes (matches lib/geo GRID + trailing Bengaluru point). */
export const SIM_GRID = {
  ka: { rows: 11, cols: 9 },
  blr: { rows: 9, cols: 9 },
} as const;

/** Leaner Compare grid (docs/04). */
export const CMP_GRID = {
  ka: { rows: 9, cols: 7 },
  blr: { rows: 6, cols: 6 },
} as const;

export type GridSpec = { rows: number; cols: number };

export type LatLon = { lat: number; lon: number };

/** Regular grid + Bengaluru focal point appended last. */
export function buildPoints(region: Region, spec: GridSpec): LatLon[] {
  const b = BOUNDS[region];
  const { rows, cols } = spec;
  const out: LatLon[] = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const lat = +(b.s + (i * (b.n - b.s)) / (rows - 1)).toFixed(4);
      const lon = +(b.w + (j * (b.e - b.w)) / (cols - 1)).toFixed(4);
      out.push({ lat, lon });
    }
  }
  out.push({ lat: BLR.lat, lon: BLR.lon });
  return out;
}

export function lists(points: LatLon[]): { latitude: string; longitude: string } {
  return {
    latitude: points.map((p) => p.lat).join(','),
    longitude: points.map((p) => p.lon).join(','),
  };
}
