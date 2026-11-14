#!/usr/bin/env python3
"""Real end-to-end BBMP acquisitions — no synthetic fallbacks.

Stops on the first HTTP/auth failure with the exact status and URL.
Subsets spatially wherever the service allows (GPM OPeNDAP; SRTM only the
two 1° tiles intersecting BBMP; MODIS windowed after native-tile download
because Harmony/OPeNDAP spatial CE failed for MOD11A1/MOD13Q1).
"""

from __future__ import annotations

import json
import math
import struct
import sys
import time
import zipfile
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
import numpy as np
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from acquisition.earthdata_auth import load_auth, require_earthdata  # noqa: E402
from data_sources.srtm_adapter import compute_slope_aspect  # noqa: E402
from processing.spatial_subset import load_region  # noqa: E402
from processing.unit_conversion import kelvin_to_celsius  # noqa: E402

REPORT: dict[str, Any] = {
    "started_at": datetime.now(timezone.utc).isoformat(),
    "region": "bengaluru_bbmp",
    "products": {},
    "errors": [],
}


class HttpAcquisitionError(RuntimeError):
    def __init__(self, status: int, url: str, body: str = ""):
        self.status = status
        self.url = url
        self.body = body[:800]
        super().__init__(f"HTTP {status} for {url}: {self.body}")


def _client(timeout: float = 180.0) -> httpx.Client:
    auth = require_earthdata()
    return httpx.Client(
        timeout=timeout,
        follow_redirects=True,
        headers=auth.bearer_headers(),
    )


def download_bytes(client: httpx.Client, url: str) -> bytes:
    r = client.get(url)
    if r.status_code != 200:
        raise HttpAcquisitionError(r.status_code, url, r.text)
    return r.content


def write_geotiff(
    path: Path,
    array: np.ndarray,
    *,
    west: float,
    north: float,
    res_x: float,
    res_y: float,
    nodata: float = np.nan,
    dtype: str = "float32",
    crs: str = "EPSG:4326",
    tags: Optional[dict[str, str]] = None,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.asarray(array, dtype=dtype)
    transform = from_origin(west, north, res_x, abs(res_y))
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype=dtype,
        crs=crs,
        transform=transform,
        nodata=nodata,
        compress="deflate",
    ) as dst:
        dst.write(data, 1)
        if tags:
            dst.update_tags(**tags)


def valid_pixel_pct(arr: np.ndarray) -> float:
    a = np.asarray(arr, dtype=float)
    if a.size == 0:
        return float("nan")
    return 100.0 * float(np.isfinite(a).sum()) / float(a.size)


# ---------------------------------------------------------------------------
# 1. SRTM
# ---------------------------------------------------------------------------

def _read_hgt(hgt_bytes: bytes) -> np.ndarray:
    # SRTMGL1 .hgt: 3601x3601 int16 big-endian, voids = -32768
    n = 3601
    expect = n * n * 2
    if len(hgt_bytes) != expect:
        raise RuntimeError(f"Unexpected HGT size {len(hgt_bytes)} (expected {expect})")
    arr = np.frombuffer(hgt_bytes, dtype=">i2").astype(np.float32).reshape(n, n)
    arr = np.where(arr == -32768, np.nan, arr)
    return arr


def acquire_srtm(client: httpx.Client, out_dir: Path, bbox: tuple[float, float, float, float]) -> dict[str, Any]:
    west, south, east, north = bbox
    # Tiles are named by SW corner integer degrees
    lat0 = math.floor(south)
    lat1 = math.floor(north)  # may equal lat0 or lat0+1
    lon0 = math.floor(west)
    lon1 = math.floor(east)
    tile_lats = sorted({lat0, lat1})
    tile_lons = sorted({lon0, lon1})
    tiles = []
    for la in tile_lats:
        for lo in tile_lons:
            tiles.append((la, lo))

    raw_dir = out_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    tile_arrays: dict[tuple[int, int], np.ndarray] = {}
    downloaded = []

    for la, lo in tiles:
        name = f"N{la:02d}E{lo:03d}"
        url = (
            f"https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/"
            f"SRTMGL1.003/{name}.SRTMGL1.hgt/{name}.SRTMGL1.hgt.zip"
        )
        zip_path = raw_dir / f"{name}.SRTMGL1.hgt.zip"
        print(f"[SRTM] GET {url}")
        content = download_bytes(client, url)
        zip_path.write_bytes(content)
        with zipfile.ZipFile(zip_path) as zf:
            hgt_name = [n for n in zf.namelist() if n.endswith(".hgt")][0]
            hgt = _read_hgt(zf.read(hgt_name))
        tile_arrays[(la, lo)] = hgt
        downloaded.append({"tile": name, "path": str(zip_path), "bytes": len(content), "url": url})

    # Mosaic in geographic coords at 1 arc-sec
    res = 1.0 / 3600.0
    mosaic_south = min(la for la, _ in tile_arrays)
    mosaic_north = max(la for la, _ in tile_arrays) + 1
    mosaic_west = min(lo for _, lo in tile_arrays)
    mosaic_east = max(lo for _, lo in tile_arrays) + 1
    n_lat = int(round((mosaic_north - mosaic_south) / res)) + 1
    n_lon = int(round((mosaic_east - mosaic_west) / res)) + 1
    # Overlapping edges: SRTM tiles share 1-pixel edges; build exclusive then paste
    mosaic = np.full((n_lat, n_lon), np.nan, dtype=np.float32)
    for (la, lo), arr in tile_arrays.items():
        # arr[0,0] is NW corner of tile at (la+1, lo); rows southward, cols eastward
        row0 = int(round((mosaic_north - (la + 1)) / res))
        col0 = int(round((lo - mosaic_west) / res))
        mosaic[row0 : row0 + 3601, col0 : col0 + 3601] = arr

    # Clip to BBMP bbox (pad 1 pixel)
    r0 = max(0, int(math.floor((mosaic_north - north) / res)) - 1)
    r1 = min(n_lat, int(math.ceil((mosaic_north - south) / res)) + 2)
    c0 = max(0, int(math.floor((west - mosaic_west) / res)) - 1)
    c1 = min(n_lon, int(math.ceil((east - mosaic_west) / res)) + 2)
    elev = mosaic[r0:r1, c0:c1]
    clip_north = mosaic_north - r0 * res
    clip_west = mosaic_west + c0 * res

    lat0 = 0.5 * (south + north)
    cell_y = res * 111_320.0
    cell_x = res * 111_320.0 * math.cos(math.radians(lat0))
    derived = compute_slope_aspect(elev, cellsize_x_m=cell_x, cellsize_y_m=cell_y)

    elev_path = out_dir / "srtm_elevation_m_bbmp.tif"
    slope_path = out_dir / "srtm_slope_deg_bbmp.tif"
    aspect_path = out_dir / "srtm_aspect_deg_bbmp.tif"
    tags = {
        "product": "SRTMGL1.003",
        "units": "m",
        "quantity_type": "Observed",
        "region": "bengaluru_bbmp",
    }
    write_geotiff(elev_path, elev, west=clip_west, north=clip_north, res_x=res, res_y=res, tags=tags)
    write_geotiff(
        slope_path,
        derived["slope_deg"],
        west=clip_west,
        north=clip_north,
        res_x=res,
        res_y=res,
        tags={**tags, "units": "degree", "derivation": "Horn-style numpy.gradient"},
    )
    write_geotiff(
        aspect_path,
        derived["aspect_deg"],
        west=clip_west,
        north=clip_north,
        res_x=res,
        res_y=res,
        tags={**tags, "units": "degree"},
    )

    return {
        "product": "SRTMGL1.003",
        "tiles": downloaded,
        "array_shape": list(elev.shape),
        "native_resolution": "1 arc-second (~30 m)",
        "pixel_size_deg": res,
        "valid_pixel_pct_elevation": valid_pixel_pct(elev),
        "units": {"elevation": "m", "slope": "degree", "aspect": "degree"},
        "bbox_used": {"west": west, "south": south, "east": east, "north": north},
        "geotiff_paths": {
            "elevation": str(elev_path),
            "slope": str(slope_path),
            "aspect": str(aspect_path),
        },
        "elevation_stats_m": {
            "min": float(np.nanmin(elev)),
            "max": float(np.nanmax(elev)),
            "mean": float(np.nanmean(elev)),
        },
    }


# ---------------------------------------------------------------------------
# MODIS helpers (sinusoidal window)
# ---------------------------------------------------------------------------

MODIS_R = 6371007.181


def lonlat_to_sinu(lon: float, lat: float) -> tuple[float, float]:
    lon_r = math.radians(lon)
    lat_r = math.radians(lat)
    return MODIS_R * lon_r * math.cos(lat_r), MODIS_R * lat_r


@dataclass
class ModisTileGrid:
    ulx: float
    uly: float
    lrx: float
    lry: float
    nx: int
    ny: int

    @property
    def res_x(self) -> float:
        return (self.lrx - self.ulx) / self.nx

    @property
    def res_y(self) -> float:
        return (self.uly - self.lry) / self.ny

    def window_for_bbox(self, bbox: tuple[float, float, float, float], pad: int = 2) -> tuple[int, int, int, int]:
        west, south, east, north = bbox
        xs, ys = [], []
        for lon, lat in ((west, south), (west, north), (east, south), (east, north)):
            x, y = lonlat_to_sinu(lon, lat)
            xs.append(x)
            ys.append(y)
        cols = [(x - self.ulx) / self.res_x for x in xs]
        rows = [(self.uly - y) / self.res_y for y in ys]
        c0 = max(0, int(math.floor(min(cols))) - pad)
        c1 = min(self.nx - 1, int(math.ceil(max(cols))) + pad)
        r0 = max(0, int(math.floor(min(rows))) - pad)
        r1 = min(self.ny - 1, int(math.ceil(max(rows))) + pad)
        return r0, r1, c0, c1


# h25v07 extents from HDF-EOS StructMetadata (verified against live DMR)
H25V07_1KM = ModisTileGrid(
    ulx=7783653.638366,
    uly=2223901.039533,
    lrx=8895604.158132,
    lry=1111950.519767,
    nx=1200,
    ny=1200,
)
# MOD13Q1 250 m grid is 4800x4800 over same tile extents
H25V07_250M = ModisTileGrid(
    ulx=7783653.638366,
    uly=2223901.039533,
    lrx=8895604.158132,
    lry=1111950.519767,
    nx=4800,
    ny=4800,
)


def cmr_granules(
    client: httpx.Client,
    short_name: str,
    version: str,
    bbox: tuple[float, float, float, float],
    start: str,
    end: str,
    page_size: int = 2000,
) -> list[dict[str, Any]]:
    west, south, east, north = bbox
    r = client.get(
        "https://cmr.earthdata.nasa.gov/search/granules.json",
        params={
            "short_name": short_name,
            "version": version,
            "bounding_box": f"{west},{south},{east},{north}",
            "temporal": f"{start}T00:00:00Z,{end}T23:59:59Z",
            "page_size": page_size,
            "sort_key": "start_date",
        },
    )
    if r.status_code != 200:
        raise HttpAcquisitionError(r.status_code, str(r.request.url), r.text)
    return (r.json().get("feed") or {}).get("entry") or []


def granule_data_url(entry: dict[str, Any], suffix: str = ".hdf") -> Optional[str]:
    for link in entry.get("links") or []:
        href = link.get("href") or ""
        rel = (link.get("rel") or "").lower()
        if href.lower().endswith(suffix) and ("data#" in rel or "/data/" in rel or "lp-prod-protected" in href):
            return href
    for link in entry.get("links") or []:
        href = link.get("href") or ""
        if href.lower().endswith(suffix) and href.startswith("https://"):
            return href
    return None


def qc_mandatory_good(qc: np.ndarray) -> np.ndarray:
    """MOD11A1 QC bits 0-1 == 00 → good quality."""
    return (np.asarray(qc, dtype=np.uint8) & 0b11) == 0


def write_window_geotiff_sinu(
    path: Path,
    array: np.ndarray,
    grid: ModisTileGrid,
    r0: int,
    c0: int,
    tags: Optional[dict[str, str]] = None,
) -> None:
    """Write GeoTIFF in MODIS sinusoidal metres for the extracted window."""
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.asarray(array, dtype=np.float32)
    # Pixel corners: UL of window
    west = grid.ulx + c0 * grid.res_x
    north = grid.uly - r0 * grid.res_y
    transform = from_origin(west, north, grid.res_x, grid.res_y)
    crs = '+proj=sinu +R=6371007.181 +nadgrids=@null +wktext +type=crs'
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=data.shape[0],
        width=data.shape[1],
        count=1,
        dtype="float32",
        crs=crs,
        transform=transform,
        nodata=np.nan,
        compress="deflate",
    ) as dst:
        dst.write(data, 1)
        if tags:
            dst.update_tags(**tags)


# ---------------------------------------------------------------------------
# 2. MOD11A1 LST
# ---------------------------------------------------------------------------

def acquire_mod11a1(
    client: httpx.Client,
    out_dir: Path,
    bbox: tuple[float, float, float, float],
    start: str,
    end: str,
) -> dict[str, Any]:
    from pyhdf.SD import SD, SDC

    raw_dir = out_dir / "raw"
    proc_dir = out_dir / "processed"
    raw_dir.mkdir(parents=True, exist_ok=True)
    proc_dir.mkdir(parents=True, exist_ok=True)

    entries = cmr_granules(client, "MOD11A1", "061", bbox, start, end)
    # Prefer h25v07 (covers BBMP); skip other tiles if any
    entries = [e for e in entries if "h25v07" in (e.get("title") or "")]
    if not entries:
        raise RuntimeError("No MOD11A1 h25v07 granules found for BBMP / date range")

    grid = H25V07_1KM
    r0, r1, c0, c1 = grid.window_for_bbox(bbox)
    print(f"[MOD11A1] window rows {r0}:{r1} cols {c0}:{c1} from {len(entries)} granules")

    daily = []
    day_stack = []
    night_stack = []
    dates = []

    for i, entry in enumerate(entries):
        title = entry.get("title") or f"granule_{i}"
        url = granule_data_url(entry, ".hdf")
        if not url:
            raise RuntimeError(f"No HDF data URL for {title}")
        dest = raw_dir / f"{title}.hdf"
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"[MOD11A1] cache {dest.name}")
        else:
            print(f"[MOD11A1] GET ({i+1}/{len(entries)}) {url}")
            dest.write_bytes(download_bytes(client, url))

        sd = SD(str(dest), SDC.READ)
        try:
            lst_day = sd.select("LST_Day_1km").get()[r0 : r1 + 1, c0 : c1 + 1].astype(np.float32)
            qc_day = sd.select("QC_Day").get()[r0 : r1 + 1, c0 : c1 + 1]
            lst_night = sd.select("LST_Night_1km").get()[r0 : r1 + 1, c0 : c1 + 1].astype(np.float32)
            qc_night = sd.select("QC_Night").get()[r0 : r1 + 1, c0 : c1 + 1]
            fill = 0
            day_k = np.where(lst_day == fill, np.nan, lst_day * 0.02)
            night_k = np.where(lst_night == fill, np.nan, lst_night * 0.02)
            day_k = np.where(qc_mandatory_good(qc_day), day_k, np.nan)
            night_k = np.where(qc_mandatory_good(qc_night), night_k, np.nan)
            day_c = kelvin_to_celsius(day_k)
            night_c = kelvin_to_celsius(night_k)
        finally:
            sd.end()

        # date from title MOD11A1.A2024015....
        doy_token = title.split(".")[1]  # A2024015
        year = int(doy_token[1:5])
        doy = int(doy_token[5:8])
        d = date(year, 1, 1) + timedelta(days=doy - 1)
        dates.append(d.isoformat())

        n_pix = day_c.size
        clear_day = 100.0 * float(np.isfinite(day_c).sum()) / n_pix
        clear_night = 100.0 * float(np.isfinite(night_c).sum()) / n_pix
        daily.append(
            {
                "date": d.isoformat(),
                "granule": title,
                "hdf_path": str(dest),
                "hdf_bytes": dest.stat().st_size,
                "clear_sky_pct_day": clear_day,
                "clear_sky_pct_night": clear_night,
                "lst_day_C_mean": float(np.nanmean(day_c)) if np.isfinite(day_c).any() else None,
                "lst_night_C_mean": float(np.nanmean(night_c)) if np.isfinite(night_c).any() else None,
            }
        )
        day_stack.append(day_c)
        night_stack.append(night_c)

        # Write one example day geotiff (first + median-clear)
        if i == 0:
            write_window_geotiff_sinu(
                proc_dir / f"LST_Day_C_{d.isoformat()}.tif",
                day_c,
                grid,
                r0,
                c0,
                tags={
                    "product": "MOD11A1.061",
                    "units": "degree_Celsius",
                    "scale_applied": "DN*0.02 then K-273.15",
                    "qc": "mandatory_QA_bits_0_1_eq_00",
                },
            )
            write_window_geotiff_sinu(
                proc_dir / f"LST_Night_C_{d.isoformat()}.tif",
                night_c,
                grid,
                r0,
                c0,
                tags={
                    "product": "MOD11A1.061",
                    "units": "degree_Celsius",
                    "scale_applied": "DN*0.02 then K-273.15",
                    "qc": "mandatory_QA_bits_0_1_eq_00",
                },
            )

    day_arr = np.stack(day_stack, axis=0)
    night_arr = np.stack(night_stack, axis=0)
    npz_path = proc_dir / "mod11a1_lst_C_bbmp.npz"
    np.savez_compressed(
        npz_path,
        dates=np.array(dates),
        LST_Day_C=day_arr,
        LST_Night_C=night_arr,
        row0=r0,
        row1=r1,
        col0=c0,
        col1=c1,
    )
    summary_path = proc_dir / "mod11a1_daily_clearsky.json"
    summary_path.write_text(json.dumps(daily, indent=2), encoding="utf-8")

    return {
        "product": "MOD11A1.061",
        "n_days": len(dates),
        "date_start": dates[0],
        "date_end": dates[-1],
        "array_shape_day_stack": list(day_arr.shape),
        "native_resolution": "~1 km (0.928 km sinusoidal grid)",
        "window_indices": {"row0": r0, "row1": r1, "col0": c0, "col1": c1},
        "units_after_scale": "degree_Celsius (from K × 0.02 − 273.15)",
        "scale_factor": 0.02,
        "qc_filter": "QC bits 0-1 == 00 (mandatory QA good)",
        "mean_clear_sky_pct_day": float(np.mean([d["clear_sky_pct_day"] for d in daily])),
        "mean_clear_sky_pct_night": float(np.mean([d["clear_sky_pct_night"] for d in daily])),
        "npz_path": str(npz_path),
        "daily_clearsky_json": str(summary_path),
        "example_geotiffs": [
            str(proc_dir / f"LST_Day_C_{dates[0]}.tif"),
            str(proc_dir / f"LST_Night_C_{dates[0]}.tif"),
        ],
        "note": (
            "Native MOD11A1 HDF tiles (~4 MB/day) downloaded then windowed to BBMP "
            "indices; Harmony returned unsubsetted granules and DAP4 CE returned HTTP 400."
        ),
        "daily": daily,
    }


# ---------------------------------------------------------------------------
# 3. GPM IMERG daily via OPeNDAP spatial subset
# ---------------------------------------------------------------------------

def _gpm_indices(bbox: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    west, south, east, north = bbox
    # Grid centres: lon -179.95..179.95, lat -89.95..89.95, step 0.1
    def lon_i(lon: float) -> int:
        return int(round((lon + 179.95) / 0.1))

    def lat_i(lat: float) -> int:
        return int(round((lat + 89.95) / 0.1))

    return lon_i(west), lon_i(east), lat_i(south), lat_i(north)


def acquire_gpm_imerg(
    client: httpx.Client,
    out_dir: Path,
    bbox: tuple[float, float, float, float],
    start: str,
    end: str,
) -> dict[str, Any]:
    raw_dir = out_dir / "raw_ascii"
    proc_dir = out_dir / "processed"
    raw_dir.mkdir(parents=True, exist_ok=True)
    proc_dir.mkdir(parents=True, exist_ok=True)

    lo0, lo1, la0, la1 = _gpm_indices(bbox)
    print(f"[GPM] OPeNDAP indices lon {lo0}:{lo1} lat {la0}:{la1}")

    entries = cmr_granules(client, "GPM_3IMERGDF", "07", bbox, start, end)
    if not entries:
        raise RuntimeError("No GPM_3IMERGDF.07 granules for date range")

    precip_stack = []
    dates = []
    daily_meta = []

    for i, entry in enumerate(entries):
        title = entry.get("title") or ""
        # title like GPM_3IMERGDF.07:3B-DAY.MS.MRG.3IMERG.20240601-S000000-E235959.V07B.nc4
        fname = title.split(":", 1)[-1]
        # parse date
        # 3B-DAY.MS.MRG.3IMERG.20240601-S000000-E235959.V07B.nc4
        parts = fname.split(".")
        ymd = None
        for p in parts:
            if len(p) >= 8 and p[:8].isdigit():
                ymd = p[:8]
                break
        if not ymd:
            raise RuntimeError(f"Cannot parse date from {title}")
        d = date(int(ymd[:4]), int(ymd[4:6]), int(ymd[6:8]))
        year, month = d.year, d.month
        hyrax = (
            f"https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDF.07/"
            f"{year}/{month:02d}/{fname}"
        )
        # DAP2 ASCII spatial subset — precipitation[time][lon][lat]
        url = (
            f"{hyrax}.ascii?"
            f"precipitation[0:0][{lo0}:{lo1}][{la0}:{la1}],"
            f"lon[{lo0}:{lo1}],lat[{la0}:{la1}]"
        )
        ascii_path = raw_dir / f"{ymd}_precip_subset.ascii"
        if ascii_path.exists() and ascii_path.stat().st_size > 50:
            text = ascii_path.read_text(encoding="utf-8", errors="replace")
            print(f"[GPM] cache {ascii_path.name}")
        else:
            print(f"[GPM] GET ({i+1}/{len(entries)}) subset {ymd}")
            r = client.get(url)
            if r.status_code != 200:
                raise HttpAcquisitionError(r.status_code, url, r.text)
            text = r.text
            ascii_path.write_text(text, encoding="utf-8")

        # Parse ASCII
        lons, lats, rows = [], [], []
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("lon,"):
                lons = [float(x) for x in line.split(",")[1:]]
            elif line.startswith("lat,"):
                lats = [float(x) for x in line.split(",")[1:]]
            elif line.startswith("precipitation.precipitation["):
                # precipitation.precipitation[time=..][lon=xx], v1, v2, ...
                vals = [float(x) for x in line.split("],", 1)[1].split(",") if x.strip()]
                rows.append(vals)
        if not rows or not lons or not lats:
            raise RuntimeError(f"Failed to parse GPM ASCII for {ymd}: {text[:300]}")
        # rows are along lon; each row length = n_lat
        arr = np.array(rows, dtype=np.float32)  # (n_lon, n_lat)
        arr = arr.T  # (n_lat, n_lon) south→? check lat order
        # lat list ascending in sample (12.85..) so row0 = southernmost
        # GeoTIFF expects north-up → flip
        arr_north_up = np.flipud(arr)
        fill = -9999.9
        arr_north_up = np.where(arr_north_up <= -9990, np.nan, arr_north_up)

        precip_stack.append(arr_north_up)
        dates.append(d.isoformat())
        daily_meta.append(
            {
                "date": d.isoformat(),
                "ascii_path": str(ascii_path),
                "mean_mm_day": float(np.nanmean(arr_north_up)) if np.isfinite(arr_north_up).any() else None,
                "valid_pixel_pct": valid_pixel_pct(arr_north_up),
            }
        )

        if i == 0:
            # lats ascending; after flipud, north is first row
            res = 0.1
            north_edge = max(lats) + res / 2
            west_edge = min(lons) - res / 2
            write_geotiff(
                proc_dir / f"gpm_precip_mm_day_{d.isoformat()}.tif",
                arr_north_up,
                west=west_edge,
                north=north_edge,
                res_x=res,
                res_y=res,
                tags={
                    "product": "GPM_3IMERGDF.07",
                    "units": "mm/day",
                    "variable": "precipitation",
                    "access": "OPeNDAP_spatial_subset",
                },
            )

    stack = np.stack(precip_stack, axis=0)
    npz_path = proc_dir / "gpm_imerg_daily_mm_bbmp.npz"
    np.savez_compressed(npz_path, dates=np.array(dates), precipitation_mm_day=stack, lon0=lo0, lon1=lo1, lat0=la0, lat1=la1)
    meta_path = proc_dir / "gpm_daily_meta.json"
    meta_path.write_text(json.dumps(daily_meta, indent=2), encoding="utf-8")

    return {
        "product": "GPM_3IMERGDF.07",
        "n_days": len(dates),
        "date_start": dates[0],
        "date_end": dates[-1],
        "array_shape_stack": list(stack.shape),
        "native_resolution": "0.1° (~11 km)",
        "units": "mm/day",
        "valid_pixel_pct_mean": float(np.mean([d["valid_pixel_pct"] for d in daily_meta])),
        "subset_method": "GES DISC Hyrax OPeNDAP DAP2 ASCII hyperslab (lon/lat indices)",
        "opendap_indices": {"lon0": lo0, "lon1": lo1, "lat0": la0, "lat1": la1},
        "npz_path": str(npz_path),
        "daily_meta_json": str(meta_path),
        "example_geotiff": str(proc_dir / f"gpm_precip_mm_day_{dates[0]}.tif"),
        "total_precip_mean_grid_mm": float(np.nansum(np.nanmean(stack, axis=(1, 2)))),
    }


# ---------------------------------------------------------------------------
# 4. MOD13Q1 NDVI
# ---------------------------------------------------------------------------

def acquire_mod13q1(
    client: httpx.Client,
    out_dir: Path,
    bbox: tuple[float, float, float, float],
    start: str,
    end: str,
) -> dict[str, Any]:
    from pyhdf.SD import SD, SDC

    raw_dir = out_dir / "raw"
    proc_dir = out_dir / "processed"
    raw_dir.mkdir(parents=True, exist_ok=True)
    proc_dir.mkdir(parents=True, exist_ok=True)

    entries = cmr_granules(client, "MOD13Q1", "061", bbox, start, end)
    entries = [e for e in entries if "h25v07" in (e.get("title") or "")]
    if not entries:
        raise RuntimeError("No MOD13Q1 h25v07 granules found")

    grid = H25V07_250M
    r0, r1, c0, c1 = grid.window_for_bbox(bbox)
    print(f"[MOD13Q1] window rows {r0}:{r1} cols {c0}:{c1} from {len(entries)} granules")

    stack = []
    dates = []
    records = []

    for i, entry in enumerate(entries):
        title = entry.get("title") or f"granule_{i}"
        url = granule_data_url(entry, ".hdf")
        if not url:
            raise RuntimeError(f"No HDF data URL for {title}")
        dest = raw_dir / f"{title}.hdf"
        if dest.exists() and dest.stat().st_size > 1000:
            print(f"[MOD13Q1] cache {dest.name}")
        else:
            print(f"[MOD13Q1] GET ({i+1}/{len(entries)}) {url}")
            dest.write_bytes(download_bytes(client, url))

        sd = SD(str(dest), SDC.READ)
        try:
            # Dataset names in MOD13Q1
            names = list(sd.datasets().keys())
            ndvi_name = next(n for n in names if n.endswith("NDVI") or n == "250m 16 days NDVI")
            qa_name = next(
                (n for n in names if "pixel reliability" in n.lower() or n.endswith("pixel_reliability")),
                None,
            )
            ndvi_raw = sd.select(ndvi_name).get()[r0 : r1 + 1, c0 : c1 + 1].astype(np.float32)
            fill = -3000
            ndvi = np.where(ndvi_raw == fill, np.nan, ndvi_raw * 0.0001)
            if qa_name:
                qa = sd.select(qa_name).get()[r0 : r1 + 1, c0 : c1 + 1]
                # Pixel reliability: 0=Good, 1=Marginal, 2=Snow/Ice, 3=Cloudy — keep 0 and 1
                ndvi = np.where(np.isin(qa, [0, 1]), ndvi, np.nan)
        finally:
            sd.end()

        doy_token = title.split(".")[1]
        year = int(doy_token[1:5])
        doy = int(doy_token[5:8])
        d = date(year, 1, 1) + timedelta(days=doy - 1)
        dates.append(d.isoformat())
        stack.append(ndvi)
        records.append(
            {
                "date": d.isoformat(),
                "granule": title,
                "hdf_path": str(dest),
                "hdf_bytes": dest.stat().st_size,
                "valid_pixel_pct": valid_pixel_pct(ndvi),
                "ndvi_mean": float(np.nanmean(ndvi)) if np.isfinite(ndvi).any() else None,
                "dataset_name": ndvi_name,
            }
        )
        write_window_geotiff_sinu(
            proc_dir / f"NDVI_{d.isoformat()}.tif",
            ndvi,
            grid,
            r0,
            c0,
            tags={
                "product": "MOD13Q1.061",
                "units": "1",
                "scale_applied": "DN*0.0001",
                "qc": "pixel_reliability in {0,1}",
            },
        )

    arr = np.stack(stack, axis=0)
    npz_path = proc_dir / "mod13q1_ndvi_bbmp.npz"
    np.savez_compressed(npz_path, dates=np.array(dates), NDVI=arr, row0=r0, row1=r1, col0=c0, col1=c1)
    meta_path = proc_dir / "mod13q1_meta.json"
    meta_path.write_text(json.dumps(records, indent=2), encoding="utf-8")

    return {
        "product": "MOD13Q1.061",
        "n_composites": len(dates),
        "dates": dates,
        "array_shape_stack": list(arr.shape),
        "native_resolution": "250 m",
        "units_after_scale": "1 (dimensionless NDVI)",
        "scale_factor": 0.0001,
        "valid_pixel_pct_mean": float(np.mean([r["valid_pixel_pct"] for r in records])),
        "npz_path": str(npz_path),
        "meta_json": str(meta_path),
        "geotiff_paths": [str(proc_dir / f"NDVI_{d}.tif") for d in dates],
        "period_note": "Aligned with MOD11A1 dry-season window (2024-01-01 to 2024-03-31)",
        "composites": records,
    }


def main() -> int:
    settings_auth = load_auth()
    if not settings_auth.available:
        print("ERROR: EARTHDATA_TOKEN not configured", file=sys.stderr)
        return 2

    region = load_region("bengaluru_bbmp")
    bbox = region.bbox_wsen()
    REPORT["bbox"] = {
        "west": bbox[0],
        "south": bbox[1],
        "east": bbox[2],
        "north": bbox[3],
    }
    data_root = BACKEND_ROOT / "data"
    processed = data_root / "processed"
    report_path = processed / "bbmp_e2e_acquisition_report.json"

    try:
        with _client() as client:
            # 1 SRTM
            print("=== 1/4 SRTM ===")
            srtm = acquire_srtm(client, processed / "srtm", bbox)
            REPORT["products"]["srtm"] = srtm
            report_path.write_text(json.dumps(REPORT, indent=2, default=str), encoding="utf-8")

            # 2 MOD11A1
            print("=== 2/4 MOD11A1 ===")
            lst = acquire_mod11a1(
                client,
                processed / "modis_lst_mod11a1",
                bbox,
                "2024-01-01",
                "2024-03-31",
            )
            REPORT["products"]["modis_lst_mod11a1"] = lst
            report_path.write_text(json.dumps(REPORT, indent=2, default=str), encoding="utf-8")

            # 3 GPM
            print("=== 3/4 GPM IMERG ===")
            gpm = acquire_gpm_imerg(
                client,
                processed / "gpm_imerg_v07_daily",
                bbox,
                "2024-06-01",
                "2024-10-31",
            )
            REPORT["products"]["gpm_imerg_v07_daily"] = gpm
            report_path.write_text(json.dumps(REPORT, indent=2, default=str), encoding="utf-8")

            # 4 MOD13Q1
            print("=== 4/4 MOD13Q1 ===")
            ndvi = acquire_mod13q1(
                client,
                processed / "modis_vi_mod13q1",
                bbox,
                "2024-01-01",
                "2024-03-31",
            )
            REPORT["products"]["modis_vi_mod13q1"] = ndvi

    except HttpAcquisitionError as exc:
        REPORT["errors"].append({"http_status": exc.status, "url": exc.url, "body": exc.body})
        REPORT["failed_at"] = datetime.now(timezone.utc).isoformat()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(REPORT, indent=2, default=str), encoding="utf-8")
        print(f"\nSTOPPED on HTTP error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        REPORT["errors"].append({"error": str(exc)})
        REPORT["failed_at"] = datetime.now(timezone.utc).isoformat()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(REPORT, indent=2, default=str), encoding="utf-8")
        print(f"\nSTOPPED: {exc}", file=sys.stderr)
        raise

    REPORT["finished_at"] = datetime.now(timezone.utc).isoformat()
    report_path.write_text(json.dumps(REPORT, indent=2, default=str), encoding="utf-8")
    print("\n=== DONE ===")
    print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk not in {"daily", "composites"}}
                      for k, v in REPORT["products"].items()}, indent=2, default=str))
    print(f"Full report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
