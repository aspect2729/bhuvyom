/**
 * Google satellite (Earth) tiles for the Simulation basemap.
 * Tiles are placed in the same lat/lon frame as the outline so they stay aligned.
 */
import type { GeoFrame, Region } from '@/lib/geo';
import { BOUNDS } from '@/lib/regions';

type TileSpec = {
  key: string;
  uri: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

const ZOOM: Record<Region, number> = {
  ka: 7, // ~6 Google Earth tiles for Karnataka
  blr: 11, // ~16 tiles for Bengaluru Urban — sharp enough on phone
};

function lon2tile(lon: number, z: number) {
  return ((lon + 180) / 360) * 2 ** z;
}

function lat2tile(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

function tile2lon(x: number, z: number) {
  return (x / 2 ** z) * 360 - 180;
}

function tile2lat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Google Maps / Earth satellite raster tile. */
export function googleSatUri(x: number, y: number, z: number): string {
  const host = x % 4;
  return `https://mt${host}.google.com/vt/lyrs=s&hl=en&x=${x}&y=${y}&z=${z}`;
}

/** NASA Black Marble (night) — GoogleMapsCompatible WMTS. */
export function blackMarbleUri(x: number, y: number, z: number): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/${z}/${y}/${x}.png`;
}

/**
 * Mosaic of satellite tiles covering the region, projected into frame pixels.
 */
export function basemapTiles(
  region: Region,
  frame: GeoFrame,
  mode: 'day' | 'night',
): TileSpec[] {
  const b = BOUNDS[region];
  // Black Marble max native zoom is 8; Google sat uses region zoom.
  const z = mode === 'night' ? Math.min(ZOOM[region], 8) : ZOOM[region];
  const x0 = Math.floor(lon2tile(b.w, z));
  const x1 = Math.floor(lon2tile(b.e, z));
  const y0 = Math.floor(lat2tile(b.n, z)); // north → smaller y
  const y1 = Math.floor(lat2tile(b.s, z));
  const out: TileSpec[] = [];
  const { ax, bx, ay, by } = frame.proj;

  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const west = tile2lon(x, z);
      const east = tile2lon(x + 1, z);
      const north = tile2lat(y, z);
      const south = tile2lat(y + 1, z);
      const left = ax * west + bx;
      const right = ax * east + bx;
      const top = ay * north + by;
      const bottom = ay * south + by;
      out.push({
        key: `${mode}-${z}-${x}-${y}`,
        uri: mode === 'day' ? googleSatUri(x, y, z) : blackMarbleUri(x, y, z),
        x: Math.min(left, right),
        y: Math.min(top, bottom),
        w: Math.abs(right - left),
        h: Math.abs(bottom - top),
      });
    }
  }
  return out;
}

export const BASEMAP_CREDIT = {
  day: 'Google Earth / Maps',
  night: 'NASA Black Marble (VIIRS)',
} as const;
