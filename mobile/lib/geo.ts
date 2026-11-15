import cmpgeo from '../data/cmpgeo.json';
import simgeo from '../data/simgeo.json';

export type Region = 'ka' | 'blr';

/** Live grid layout of /api/site/sim/live (backend/engines/site_sim.py REGIONS). */
export const GRID = {
  ka: { s: 11.5, n: 18.5, w: 74.0, e: 78.6, rows: 11, cols: 9 },
  blr: { s: 12.62, n: 13.27, w: 77.28, e: 77.87, rows: 9, cols: 9 },
} as const;

export function gridShape(region: Region) {
  return { rows: GRID[region].rows, cols: GRID[region].cols };
}

type Affine = { ax: number; bx: number; ay: number; by: number };

export type GeoFrame = {
  /** viewBox width / height (px in the handoff markup) */
  vw: number;
  vh: number;
  /** boundary path, already projected into the frame */
  d: string;
  places: { n: string; x: number; y: number }[];
  /** Bengaluru pin from the handoff */
  pin: [number, number];
  /** lat/lon → frame px. Linear fit of the handoff outline against data/outlines.json. */
  proj: Affine;
};

/** Fits derived from the outline vertices of data/outlines.json vs the projected `d` paths (max residual 0.05 px). */
const SIM_PROJ: Record<Region, Affine> = {
  ka: { ax: 55.1964, bx: -4032.488, ay: -57.1429, by: 1057.142 },
  blr: { ax: 599.7525, bx: -46346.806, ay: -615.4014, by: 8166.373 },
};
const CMP_PROJ: Record<Region, Affine> = {
  ka: { ax: 28.9796, bx: -2128.647, ay: -30.0002, by: 555.004 },
  blr: { ax: 279.6636, bx: -21612.405, ay: -286.9482, by: 3819.544 },
};

type RawGeo = { d: string; blr: number[]; places: { n: string; x: number; y: number }[] };
const SIM = simgeo as unknown as Record<Region, RawGeo>;
const CMP = cmpgeo as unknown as Record<Region, RawGeo>;

export const SIM_FRAME: Record<Region, GeoFrame> = {
  ka: { vw: 358, vh: 400, d: SIM.ka.d, places: SIM.ka.places, pin: [SIM.ka.blr[0], SIM.ka.blr[1]], proj: SIM_PROJ.ka },
  blr: { vw: 358, vh: 400, d: SIM.blr.d, places: SIM.blr.places, pin: [SIM.blr.blr[0], SIM.blr.blr[1]], proj: SIM_PROJ.blr },
};

export const CMP_FRAME: Record<Region, GeoFrame> = {
  ka: { vw: 165, vh: 210, d: CMP.ka.d, places: CMP.ka.places, pin: [CMP.ka.blr[0], CMP.ka.blr[1]], proj: CMP_PROJ.ka },
  blr: { vw: 165, vh: 210, d: CMP.blr.d, places: CMP.blr.places, pin: [CMP.blr.blr[0], CMP.blr.blr[1]], proj: CMP_PROJ.blr },
};

export type GridRect = { x: number; y: number; w: number; h: number; v: number | null };

/** One rectangle per live grid point, placed at its true lat/lon in the frame. */
export function gridRects(region: Region, frame: GeoFrame, values: (number | null)[]): GridRect[] {
  const g = GRID[region];
  const di = (g.n - g.s) / (g.rows - 1);
  const dj = (g.e - g.w) / (g.cols - 1);
  const w = Math.abs(frame.proj.ax) * dj;
  const h = Math.abs(frame.proj.ay) * di;
  const out: GridRect[] = [];
  for (let i = 0; i < g.rows; i++) {
    for (let j = 0; j < g.cols; j++) {
      const lat = g.s + i * di;
      const lon = g.w + j * dj;
      const raw = values[i * g.cols + j];
      out.push({
        x: frame.proj.ax * lon + frame.proj.bx - w / 2,
        y: frame.proj.ay * lat + frame.proj.by - h / 2,
        w,
        h,
        v: typeof raw === 'number' && Number.isFinite(raw) ? raw : null,
      });
    }
  }
  return out;
}

/** Bengaluru value = last element the API appends after the grid. */
export function focalValue(region: Region, values: (number | null)[] | undefined): number | null {
  if (!values) return null;
  const { rows, cols } = gridShape(region);
  if (values.length <= rows * cols) return null;
  const v = values[values.length - 1];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function gridValues(region: Region, values: (number | null)[] | undefined): (number | null)[] {
  const { rows, cols } = gridShape(region);
  return (values ?? []).slice(0, rows * cols);
}

export function hasAnyValue(values: (number | null)[]): boolean {
  return values.some((v) => typeof v === 'number' && Number.isFinite(v));
}
