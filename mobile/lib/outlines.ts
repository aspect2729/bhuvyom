import blr from '../data/regions/bengaluru-urban.json';
import ka from '../data/regions/karnataka.json';
import { setOutline } from '@/lib/interpolate';
import type { Region } from '@/lib/geo';

type Gj = { features?: { geometry: { coordinates: number[][][] } }[]; geometry?: { coordinates: number[][][] } };

function ringOf(gj: Gj): number[][] {
  const g = gj.features?.[0]?.geometry ?? gj.geometry;
  const coords = g?.coordinates?.[0] ?? [];
  // GeoJSON: [lon, lat]
  return coords as number[][];
}

let ready = false;
export function ensureOutlines() {
  if (ready) return;
  setOutline('ka', ringOf(ka as Gj));
  setOutline('blr', ringOf(blr as Gj));
  ready = true;
}

export function outlineFor(_region: Region) {
  ensureOutlines();
}
