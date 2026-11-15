import placesBlr from '../data/regions/places-bengaluru.json';
import placesKa from '../data/regions/places-karnataka.json';
import type { Region } from '@/lib/geo';

type Place = { name: string; lat: number; lon: number };

function normalize(raw: unknown): Place[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => {
      if (Array.isArray(p) && p.length >= 3) {
        return { name: String(p[0]), lat: Number(p[1]), lon: Number(p[2]) };
      }
      if (p && typeof p === 'object') {
        const o = p as Record<string, unknown>;
        const name = String(o.name ?? o.n ?? '');
        const lat = Number(o.lat ?? o.y);
        const lon = Number(o.lon ?? o.x);
        if (name && Number.isFinite(lat) && Number.isFinite(lon)) return { name, lat, lon };
      }
      return null;
    })
    .filter((p): p is Place => !!p);
}

const PLACES: Record<Region, Place[]> = {
  ka: normalize(placesKa),
  blr: normalize(placesBlr),
};

export function nearestPlace(region: Region, lat: number, lon: number): Place | null {
  const list = PLACES[region];
  if (!list.length) return null;
  let best: Place | null = null;
  let d0 = Infinity;
  for (const p of list) {
    const dy = p.lat - lat;
    const dx = (p.lon - lon) * 0.97;
    const d = dy * dy + dx * dx;
    if (d < d0) {
      d0 = d;
      best = p;
    }
  }
  return best;
}

export function windOctant(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
