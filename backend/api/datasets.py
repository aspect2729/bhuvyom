"""Dataset catalog and region endpoints."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from config.dataset_registry import get_dataset, list_datasets
from processing.spatial_subset import list_regions, load_region

router = APIRouter(tags=["datasets"])


class BBoxModel(BaseModel):
    west: float
    south: float
    east: float
    north: float


@router.get("/api/datasets")
def api_list_datasets() -> dict[str, Any]:
    return {"count": len(list_datasets()), "datasets": list_datasets()}


@router.get("/api/datasets/{dataset_id}/metadata")
def api_dataset_metadata(dataset_id: str) -> dict[str, Any]:
    try:
        return get_dataset(dataset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/regions")
def api_regions() -> dict[str, Any]:
    return {"regions": list_regions()}


@router.get("/api/regions/{region_id}")
def api_region_detail(region_id: str) -> dict[str, Any]:
    try:
        return load_region(region_id).to_dict()
    except (KeyError, FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/api/observations")
def api_observations(
    dataset_id: Optional[str] = Query(None),
    region_id: str = Query("bengaluru_bbmp"),
) -> dict[str, Any]:
    """List local observation assets (filesystem index until Supabase is live)."""
    from pathlib import Path

    from config.settings import get_settings

    root = get_settings().raw_dir
    assets = []
    if root.exists():
        for path in root.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".json", ".nc", ".h5", ".tif", ".parquet"}:
                if dataset_id and dataset_id not in str(path):
                    continue
                assets.append(
                    {
                        "path": str(path),
                        "size_bytes": path.stat().st_size,
                        "region_id": region_id,
                    }
                )
    return {"count": len(assets), "assets": assets[:500]}


@router.get("/api/observations/grid")
def api_observations_grid(
    region_id: str = Query("bengaluru_bbmp"),
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> dict[str, Any]:
    region = load_region(region_id)
    if lat is not None and lon is not None:
        cell = load_region(grid_cell={"lat": lat, "lon": lon})
        return {
            "region": region.bbox_dict(),
            "grid_cell": cell.to_dict(),
            "contains": region.contains(lon, lat),
        }
    return {
        "region": region.to_dict(),
        "note": "Provide lat/lon for individual grid-cell extraction footprint",
    }


@router.get("/api/observations/timeseries")
def api_observations_timeseries(
    dataset_id: str = Query("nasa_power"),
    region_id: str = Query("bengaluru_bbmp"),
    start: str = Query(..., description="YYYY-MM-DD or YYYYMMDD"),
    end: str = Query(...),
    variable: Optional[str] = Query(None),
) -> dict[str, Any]:
    from data_sources.base_adapter import AcquisitionRequest
    from data_sources.registry import get_adapter

    try:
        adapter = get_adapter(dataset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    region = load_region(region_id)
    result = adapter.acquire(
        AcquisitionRequest(
            dataset_id=dataset_id,
            region=region,
            start=start,
            end=end,
            variables=[variable] if variable else None,
        )
    )
    payload = result.to_dict()
    if variable and result.data.get("variables"):
        payload["data"] = {
            "variables": {
                variable: result.data["variables"].get(variable)
            }
        }
    return payload
