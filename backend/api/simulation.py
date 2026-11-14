"""Simulation input preparation endpoints (not the physics engine)."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config.settings import get_settings
from processing.spatial_subset import load_region
from simulation.simulation_inputs import prepare_simulation_inputs

router = APIRouter(tags=["simulation"])


class PrepareInputsRequest(BaseModel):
    region_id: str = Field("bengaluru_bbmp")
    start: str
    end: str
    scenario: Literal["urban_heat", "rainfall_runoff", "generic"] = "generic"
    bbox: Optional[list[float]] = Field(
        default=None, description="Optional [west, south, east, north]"
    )
    acquire: bool = True


@router.post("/api/simulation/prepare-inputs")
def prepare_inputs(body: PrepareInputsRequest) -> dict[str, Any]:
    try:
        if body.bbox and len(body.bbox) == 4:
            region = load_region(bbox=(body.bbox[0], body.bbox[1], body.bbox[2], body.bbox[3]))
        else:
            region = load_region(body.region_id)
    except (KeyError, ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    bundle = prepare_simulation_inputs(
        region=region,
        region_id=body.region_id,
        start=body.start,
        end=body.end,
        scenario=body.scenario,
        acquire=body.acquire,
    )
    return bundle


@router.get("/api/simulation/inputs")
def list_simulation_inputs() -> dict[str, Any]:
    root = get_settings().simulation_dir
    items = []
    if root.exists():
        for path in sorted(root.glob("bundle_*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            items.append(
                {
                    "path": str(path),
                    "bundle_id": path.stem.replace("bundle_", ""),
                    "size_bytes": path.stat().st_size,
                    "modified": path.stat().st_mtime,
                }
            )
    return {"count": len(items), "inputs": items}


@router.get("/api/simulation/inputs/{bundle_id}")
def get_simulation_input(bundle_id: str) -> dict[str, Any]:
    import json

    path = get_settings().simulation_dir / f"bundle_{bundle_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Bundle not found")
    return json.loads(path.read_text(encoding="utf-8"))
