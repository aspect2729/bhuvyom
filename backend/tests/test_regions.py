from __future__ import annotations

from processing.spatial_subset import load_region, list_regions


def test_bbmp_boundary_is_polygon_not_bbox_only():
    region = load_region("bengaluru_bbmp")
    assert region.kind == "named"
    assert region.geometry.geom_type in {"Polygon", "MultiPolygon"}
    # Rough Bengaluru location checks
    assert region.contains(77.59, 12.97)
    assert not region.contains(72.87, 19.07)  # Mumbai
    bbox = region.bbox_dict()
    assert bbox["lon_min"] < 77.5 < bbox["lon_max"]
    assert bbox["lat_min"] < 13.0 < bbox["lat_max"]


def test_custom_bbox_and_grid_cell():
    bbox_region = load_region(bbox=(77.5, 12.9, 77.7, 13.1))
    assert bbox_region.kind == "bbox"
    cell = load_region(grid_cell={"lat": 12.97, "lon": 77.59, "half_lat": 0.05, "half_lon": 0.05})
    assert cell.kind == "grid_cell"
    assert cell.contains(77.59, 12.97)


def test_list_regions():
    regions = list_regions()
    ids = {r["id"] for r in regions if "id" in r}
    assert "bengaluru_bbmp" in ids
    assert "greater_bengaluru" in ids
