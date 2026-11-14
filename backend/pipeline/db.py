"""Supabase REST helpers for the environmental pipeline.

Uses the service-role key server-side only. Application-level dedup via
source_record_id until migration 003 unique index is applied.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

import httpx

from config.settings import get_settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 400


class SupabaseREST:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.has_supabase:
            raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required")
        self.base = settings.supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    def get(self, table: str, *, params: dict | None = None, count: bool = False) -> Any:
        headers = dict(self.headers)
        if count:
            headers["Prefer"] = "count=exact"
        r = httpx.get(f"{self.base}/{table}", headers=headers, params=params or {}, timeout=120)
        r.raise_for_status()
        if count:
            return r.json(), r.headers.get("content-range")
        return r.json()

    def post(self, table: str, rows: list[dict], *, prefer: str = "return=minimal") -> httpx.Response:
        headers = {**self.headers, "Prefer": prefer}
        r = httpx.post(f"{self.base}/{table}", headers=headers, json=rows, timeout=180)
        if r.status_code >= 400:
            logger.error("POST %s failed %s: %s", table, r.status_code, r.text[:800])
        r.raise_for_status()
        return r

    def patch(self, table: str, params: dict, body: dict) -> httpx.Response:
        r = httpx.patch(f"{self.base}/{table}", headers=self.headers, params=params, json=body, timeout=120)
        r.raise_for_status()
        return r

    def ensure_data_source(
        self,
        *,
        source_code: str,
        source_name: str,
        organization: str,
        homepage_url: str | None = None,
        access_type: str = "open",
        api_endpoint: str | None = None,
    ) -> int:
        rows = self.get("data_sources", params={"source_code": f"eq.{source_code}", "select": "source_id"})
        if rows:
            return int(rows[0]["source_id"])
        self.post(
            "data_sources",
            [
                {
                    "source_code": source_code,
                    "source_name": source_name,
                    "organization": organization,
                    "homepage_url": homepage_url,
                    "access_type": access_type,
                    "api_endpoint": api_endpoint,
                    "is_trusted": True,
                    "metadata": {},
                }
            ],
        )
        rows = self.get("data_sources", params={"source_code": f"eq.{source_code}", "select": "source_id"})
        return int(rows[0]["source_id"])

    def ensure_dataset(
        self,
        *,
        source_id: int,
        dataset_code: str,
        dataset_name: str,
        description: str,
        spatial_resolution: str,
        temporal_resolution: str,
        metadata: dict | None = None,
        product_version: str | None = None,
        landing_page_url: str | None = None,
    ) -> int:
        rows = self.get("datasets", params={"dataset_code": f"eq.{dataset_code}", "select": "dataset_id"})
        if rows:
            return int(rows[0]["dataset_id"])
        self.post(
            "datasets",
            [
                {
                    "source_id": source_id,
                    "dataset_code": dataset_code,
                    "dataset_name": dataset_name,
                    "description": description,
                    "product_version": product_version,
                    "spatial_resolution": spatial_resolution,
                    "temporal_resolution": temporal_resolution,
                    "landing_page_url": landing_page_url,
                    "status": "catalogued",
                    "metadata": metadata or {},
                }
            ],
        )
        rows = self.get("datasets", params={"dataset_code": f"eq.{dataset_code}", "select": "dataset_id"})
        return int(rows[0]["dataset_id"])

    def ensure_unit(self, unit_code: str, unit_name: str, symbol: str, dimension: str) -> int:
        rows = self.get("ref_units", params={"unit_code": f"eq.{unit_code}", "select": "unit_id"})
        if rows:
            return int(rows[0]["unit_id"])
        self.post(
            "ref_units",
            [{"unit_code": unit_code, "unit_name": unit_name, "symbol": symbol, "dimension": dimension}],
        )
        rows = self.get("ref_units", params={"unit_code": f"eq.{unit_code}", "select": "unit_id"})
        return int(rows[0]["unit_id"])

    def lookup_maps(self) -> dict[str, Any]:
        variables = self.get(
            "ref_environmental_variables",
            params={"select": "variable_id,variable_code", "limit": "500"},
        )
        units = self.get("ref_units", params={"select": "unit_id,unit_code", "limit": "100"})
        datasets = self.get("datasets", params={"select": "dataset_id,dataset_code", "limit": "200"})
        regions = self.get("geo_regions", params={"select": "region_id,region_code", "limit": "50"})
        return {
            "variable_by_code": {r["variable_code"]: r["variable_id"] for r in variables},
            "unit_by_code": {r["unit_code"]: r["unit_id"] for r in units},
            "dataset_by_code": {r["dataset_code"]: r["dataset_id"] for r in datasets},
            "region_by_code": {r["region_code"]: r["region_id"] for r in regions},
        }

    def existing_source_record_ids(self, ids: Iterable[str]) -> set[str]:
        """Fetch which source_record_ids already exist (chunked)."""
        found: set[str] = set()
        chunk: list[str] = []
        for sid in ids:
            chunk.append(sid)
            if len(chunk) >= 80:
                found |= self._fetch_ids(chunk)
                chunk = []
        if chunk:
            found |= self._fetch_ids(chunk)
        return found

    def _fetch_ids(self, chunk: list[str]) -> set[str]:
        # PostgREST: source_record_id=in.("a","b") — quote because IDs contain ':'
        quoted = ",".join('"' + sid.replace('\\', '\\\\').replace('"', '\\"') + '"' for sid in chunk)
        rows = self.get(
            "environmental_observations",
            params={"source_record_id": f"in.({quoted})", "select": "source_record_id"},
        )
        return {r["source_record_id"] for r in rows if r.get("source_record_id")}

    def insert_observations(self, rows: list[dict], *, skip_existing: bool = True) -> dict[str, int]:
        if not rows:
            return {"attempted": 0, "inserted": 0, "skipped": 0}
        skipped = 0
        if skip_existing:
            existing = self.existing_source_record_ids(
                r["source_record_id"] for r in rows if r.get("source_record_id")
            )
            filtered = []
            for r in rows:
                sid = r.get("source_record_id")
                if sid and sid in existing:
                    skipped += 1
                else:
                    filtered.append(r)
            rows = filtered
        inserted = 0
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            self.post("environmental_observations", batch)
            inserted += len(batch)
            logger.info("inserted observations batch %s–%s", i, i + len(batch))
        return {"attempted": inserted + skipped, "inserted": inserted, "skipped": skipped}

    def start_job(self, *, dataset_id: int, job_type: str, parameters: dict) -> Optional[str]:
        """Create a processing_jobs row.

        Live DB check constraints currently allow job_type in
        {model_training, feature_engineering, harmonization, …} and status in
        {queued, running, failed, cancelled, succeeded}. We store the logical
        pipeline step name inside parameters.pipeline_step.
        """
        job_id = str(uuid.uuid4())
        # Live CHECK allows: aggregation, download, feature_engineering,
        # harmonization, model_training, validation (discovered 2026-11-14).
        constrained_type = "download"
        try:
            self.post(
                "processing_jobs",
                [
                    {
                        "job_id": job_id,
                        "dataset_id": dataset_id,
                        "job_type": constrained_type,
                        "status": "running",
                        "started_at": datetime.now(timezone.utc).isoformat(),
                        "parameters": {**parameters, "pipeline_step": job_type},
                        "output_metadata": {},
                    }
                ],
            )
            return job_id
        except Exception as exc:
            logger.warning("processing_jobs insert skipped (%s); continuing without job row", exc)
            return None

    def finish_job(
        self,
        job_id: Optional[str],
        *,
        status: str,
        records_processed: int = 0,
        output_metadata: dict | None = None,
        error_message: str | None = None,
    ) -> None:
        if not job_id:
            return
        # Map pipeline statuses onto allowed CHECK values.
        status_map = {
            "completed": "succeeded",
            "success": "succeeded",
            "ok": "succeeded",
            "failed": "failed",
            "error": "failed",
            "cancelled": "cancelled",
            "running": "running",
            "queued": "queued",
            "succeeded": "succeeded",
        }
        body: dict[str, Any] = {
            "status": status_map.get(status, "succeeded" if status not in ("failed", "cancelled") else status),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "records_processed": records_processed,
            "output_metadata": output_metadata or {},
        }
        if error_message:
            body["error_message"] = error_message
        try:
            self.patch("processing_jobs", {"job_id": f"eq.{job_id}"}, body)
        except Exception as exc:
            logger.warning("processing_jobs finish skipped: %s", exc)

    def create_dataset_version(self, dataset_id: int, version_label: str, metadata: dict) -> int:
        existing = self.get(
            "dataset_versions",
            params={
                "dataset_id": f"eq.{dataset_id}",
                "version_label": f"eq.{version_label}",
                "select": "dataset_version_id",
                "limit": "1",
            },
        )
        if existing:
            return int(existing[0]["dataset_version_id"])
        try:
            self.post(
                "dataset_versions",
                [
                    {
                        "dataset_id": dataset_id,
                        "version_label": version_label,
                        "retrieved_at": datetime.now(timezone.utc).isoformat(),
                        "metadata": metadata,
                    }
                ],
            )
        except httpx.HTTPStatusError as exc:
            if exc.response is None or exc.response.status_code != 409:
                raise
        rows = self.get(
            "dataset_versions",
            params={
                "dataset_id": f"eq.{dataset_id}",
                "version_label": f"eq.{version_label}",
                "select": "dataset_version_id",
                "order": "dataset_version_id.desc",
                "limit": "1",
            },
        )
        return int(rows[0]["dataset_version_id"])


def observation_row(
    *,
    variable_id: int,
    dataset_id: int,
    observed_at: str,
    value: float,
    unit_id: Optional[int],
    lat: float,
    lon: float,
    grid_id: str,
    source_record_id: str,
    quality_flag: str,
    region_id: Optional[int],
    spatial_resolution_m: Optional[float],
    metadata: dict,
    dataset_version_id: Optional[int] = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "variable_id": variable_id,
        "dataset_id": dataset_id,
        "observed_at": observed_at,
        "value_numeric": value,
        "unit_id": unit_id,
        "location": f"POINT({lon} {lat})",
        "grid_id": grid_id,
        "source_record_id": source_record_id,
        "quality_flag": quality_flag,
        "region_id": region_id,
        "spatial_resolution_m": spatial_resolution_m,
        "metadata": metadata,
    }
    if dataset_version_id is not None:
        row["dataset_version_id"] = dataset_version_id
    return row
