"""Acquisition job endpoints (in-memory job store until Supabase is live)."""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from data_sources.base_adapter import AcquisitionRequest
from data_sources.registry import get_adapter, list_supported_datasets
from processing.spatial_subset import load_region

router = APIRouter(tags=["acquisition"])

_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()


class AcquisitionJobRequest(BaseModel):
    dataset_id: str = Field(..., description="Registry dataset id")
    region_id: str = Field("bengaluru_bbmp")
    start: str = Field(..., description="YYYY-MM-DD or YYYYMMDD")
    end: str = Field(...)
    variables: Optional[list[str]] = None
    temporal_mode: Optional[str] = None
    options: dict[str, Any] = Field(default_factory=dict)
    bbox: Optional[list[float]] = Field(
        default=None,
        description="Optional [west, south, east, north] overriding named region",
    )


def _run_job(job_id: str, body: AcquisitionJobRequest) -> None:
    with _LOCK:
        _JOBS[job_id]["status"] = "running"
        _JOBS[job_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        if body.dataset_id not in list_supported_datasets():
            raise KeyError(f"Unsupported dataset {body.dataset_id}")
        if body.bbox and len(body.bbox) == 4:
            region = load_region(bbox=(body.bbox[0], body.bbox[1], body.bbox[2], body.bbox[3]))
        else:
            region = load_region(body.region_id)
        adapter = get_adapter(body.dataset_id)
        result = adapter.acquire(
            AcquisitionRequest(
                dataset_id=body.dataset_id,
                region=region,
                start=body.start,
                end=body.end,
                variables=body.variables,
                temporal_mode=body.temporal_mode,
                options=body.options,
            )
        )
        with _LOCK:
            _JOBS[job_id]["status"] = result.status
            _JOBS[job_id]["result"] = result.to_dict()
            _JOBS[job_id]["updated_at"] = datetime.now(timezone.utc).isoformat()
    except Exception as exc:
        with _LOCK:
            _JOBS[job_id]["status"] = "error"
            _JOBS[job_id]["error"] = str(exc)
            _JOBS[job_id]["updated_at"] = datetime.now(timezone.utc).isoformat()


@router.post("/api/acquisition/jobs")
def create_acquisition_job(
    body: AcquisitionJobRequest,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    if body.dataset_id not in list_supported_datasets():
        raise HTTPException(
            status_code=422,
            detail=f"Unknown dataset_id. Supported: {list_supported_datasets()}",
        )
    job_id = str(uuid4())
    record = {
        "id": job_id,
        "status": "queued",
        "request": body.model_dump(),
        "result": None,
        "error": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    with _LOCK:
        _JOBS[job_id] = record
    background_tasks.add_task(_run_job, job_id, body)
    return {"id": job_id, "status": "queued"}


@router.get("/api/acquisition/jobs/{job_id}")
def get_acquisition_job(job_id: str) -> dict[str, Any]:
    with _LOCK:
        job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
