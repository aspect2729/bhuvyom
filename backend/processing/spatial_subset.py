"""Bengaluru study regions: polygon boundaries, custom bboxes, grid cells."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Optional

from shapely.geometry import Point, box, mapping, shape
from shapely.geometry.base import BaseGeometry

from config.settings import get_settings

RegionKind = Literal["named", "bbox", "polygon", "grid_cell"]


@dataclass
class RegionSpec:
    """Configurable geographic region for acquisition and simulation prep."""

    id: str
    name: str
    kind: RegionKind
    geometry: BaseGeometry
    properties: dict[str, Any] = field(default_factory=dict)

    def bbox_wsen(self) -> tuple[float, float, float, float]:
        minx, miny, maxx, maxy = self.geometry.bounds
        return (minx, miny, maxx, maxy)

    def bbox_dict(self) -> dict[str, float]:
        west, south, east, north = self.bbox_wsen()
        return {
            "west": west,
            "south": south,
            "north": north,
            "east": east,
            "lat_min": south,
            "lat_max": north,
            "lon_min": west,
            "lon_max": east,
        }

    def contains(self, lon: float, lat: float) -> bool:
        return self.geometry.covers(Point(lon, lat))

    def to_geojson_feature(self) -> dict[str, Any]:
        return {
            "type": "Feature",
            "properties": {
                "id": self.id,
                "name": self.name,
                "kind": self.kind,
                **self.properties,
            },
            "geometry": mapping(self.geometry),
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "kind": self.kind,
            "bbox": self.bbox_dict(),
            "properties": self.properties,
            "geometry": mapping(self.geometry),
        }


def _load_geojson_region(path: Path, region_id: str) -> RegionSpec:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("type") == "FeatureCollection":
        features = data["features"]
        if not features:
            raise ValueError(f"Empty FeatureCollection: {path}")
        feat = features[0]
        geom = shape(feat["geometry"])
        props = dict(feat.get("properties") or {})
        name = props.get("name") or region_id
        return RegionSpec(
            id=region_id,
            name=name,
            kind="named",
            geometry=geom,
            properties={**props, "boundary_path": str(path)},
        )
    if data.get("type") == "Feature":
        geom = shape(data["geometry"])
        props = dict(data.get("properties") or {})
        return RegionSpec(
            id=region_id,
            name=props.get("name") or region_id,
            kind="named",
            geometry=geom,
            properties={**props, "boundary_path": str(path)},
        )
    raise ValueError(f"Unsupported GeoJSON root type in {path}")


NAMED_REGIONS = {
    "bengaluru_bbmp": "bengaluru_bbmp.geojson",
    "greater_bengaluru": "greater_bengaluru.geojson",
}


def load_region(
    region_id: str | None = None,
    *,
    bbox: tuple[float, float, float, float] | None = None,
    polygon_geojson: dict[str, Any] | None = None,
    grid_cell: dict[str, float] | None = None,
    clip_to_named: str | None = None,
) -> RegionSpec:
    """Load a named Bengaluru boundary, custom bbox, polygon, or grid cell.

    bbox is (west, south, east, north).
    grid_cell expects lat/lon centre plus optional half_lat/half_lon degrees.
    """
    settings = get_settings()

    if bbox is not None:
        west, south, east, north = bbox
        if west >= east or south >= north:
            raise ValueError("Invalid bbox: require west<east and south<north")
        geom: BaseGeometry = box(west, south, east, north)
        if clip_to_named:
            named = load_region(clip_to_named)
            geom = geom.intersection(named.geometry)
            if geom.is_empty:
                raise ValueError("Custom bbox does not intersect named region")
        return RegionSpec(
            id="custom_bbox",
            name="Custom bounding box",
            kind="bbox",
            geometry=geom,
            properties={"note": "User-defined bbox; not the city administrative boundary"},
        )

    if polygon_geojson is not None:
        if polygon_geojson.get("type") == "Feature":
            geom = shape(polygon_geojson["geometry"])
            props = dict(polygon_geojson.get("properties") or {})
        elif polygon_geojson.get("type") == "FeatureCollection":
            geom = shape(polygon_geojson["features"][0]["geometry"])
            props = dict(polygon_geojson["features"][0].get("properties") or {})
        else:
            geom = shape(polygon_geojson)
            props = {}
        return RegionSpec(
            id="custom_polygon",
            name=props.get("name") or "Custom polygon",
            kind="polygon",
            geometry=geom,
            properties=props,
        )

    if grid_cell is not None:
        lat = float(grid_cell["lat"])
        lon = float(grid_cell["lon"])
        half_lat = float(grid_cell.get("half_lat", 0.05))
        half_lon = float(grid_cell.get("half_lon", 0.05))
        geom = box(lon - half_lon, lat - half_lat, lon + half_lon, lat + half_lat)
        return RegionSpec(
            id=f"grid_cell_{lat:.5f}_{lon:.5f}",
            name=f"Grid cell ({lat}, {lon})",
            kind="grid_cell",
            geometry=geom,
            properties={"lat": lat, "lon": lon, "half_lat": half_lat, "half_lon": half_lon},
        )

    rid = region_id or settings.default_region
    if rid == "greater_bengaluru":
        path = settings.greater_boundary_path
    elif rid in NAMED_REGIONS:
        path = settings.data_root / "boundaries" / NAMED_REGIONS[rid]
        if rid == "bengaluru_bbmp":
            path = settings.boundary_path
    else:
        # Allow absolute/relative path override as region id
        candidate = Path(rid)
        if candidate.exists():
            return _load_geojson_region(candidate, candidate.stem)
        raise KeyError(
            f"Unknown region {rid!r}. Known: {sorted(NAMED_REGIONS)} or provide bbox/polygon."
        )

    if not path.exists():
        raise FileNotFoundError(f"Boundary file missing: {path}")
    return _load_geojson_region(path, rid)


def list_regions() -> list[dict[str, Any]]:
    out = []
    for rid in NAMED_REGIONS:
        try:
            region = load_region(rid)
            out.append(
                {
                    "id": region.id,
                    "name": region.name,
                    "kind": region.kind,
                    "bbox": region.bbox_dict(),
                    "properties": {
                        k: v
                        for k, v in region.properties.items()
                        if k not in {"geometry"}
                    },
                }
            )
        except Exception as exc:  # pragma: no cover - defensive
            out.append({"id": rid, "error": str(exc)})
    return out


def mask_points_to_region(
    lons: list[float],
    lats: list[float],
    region: RegionSpec,
) -> list[bool]:
    return [region.contains(lon, lat) for lon, lat in zip(lons, lats)]
