"""Shared, versioned result contract for all BhuVyom engines (schema 1.0).

Every engine (acquisition, analysis, prediction, simulation) returns an
``EngineResult``. The visualization engine renders any result from this
contract without knowing how it was computed. See scientific/DATA_CONTRACT.md.

Spatial payload ("grid"):
    cells:      [{id, polygon: [[lon, lat], ...] closed ring (EPSG:4326, GeoJSON order), center: [lon, lat]}]
    times:      ISO timestamps / periods shared by every time-varying field
    fields:     {field_name: {unit, label, kind: "time_series"|"static", values: {cell_id: [v per time] | v}}}
    cell_attributes: {cell_id: {...}}  per-cell diagnostics (e.g. MK S, Var(S), Z)
Missing values are JSON null — never 0.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, model_validator

SCHEMA_VERSION = "1.0"

EngineName = Literal["acquisition", "analysis", "prediction", "simulation"]
DataType = Literal["observed", "analysed", "predicted", "simulated"]

_ENGINE_TO_TYPE = {
    "acquisition": "observed",
    "analysis": "analysed",
    "prediction": "predicted",
    "simulation": "simulated",
}


class TraceStep(BaseModel):
    step: str
    status: Literal["ok", "skipped", "failed", "warning"] = "ok"
    detail: str = ""
    duration_ms: Optional[float] = None


class FieldSpec(BaseModel):
    unit: str
    label: str
    kind: Literal["time_series", "static"]
    role: Literal["value", "uncertainty", "diagnostic", "quality"] = "value"
    values: dict[str, Any]


class GridPayload(BaseModel):
    cells: list[dict[str, Any]]
    times: list[str] = Field(default_factory=list)
    fields: dict[str, FieldSpec]
    cell_attributes: dict[str, dict[str, Any]] = Field(default_factory=dict)


class Finding(BaseModel):
    statement: str
    category: Literal["observation", "statistical", "modelled", "simulated", "no_conclusion"]
    evidence: dict[str, Any] = Field(default_factory=dict)
    rule: str = ""
    limitations: list[str] = Field(default_factory=list)


class EngineResult(BaseModel):
    result_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:16])
    schema_version: str = SCHEMA_VERSION
    engine_name: EngineName
    data_type: DataType
    title: str
    variable: str
    units: str
    crs: str = "EPSG:4326"
    native_resolution: str
    effective_resolution: str
    temporal_resolution: str
    temporal_coverage: dict[str, Optional[str]]
    grid: GridPayload
    default_field: str
    sources: list[dict[str, Any]]
    methodology: dict[str, Any]
    model: Optional[dict[str, Any]] = None
    quality: dict[str, Any] = Field(default_factory=dict)
    uncertainty: dict[str, Any] = Field(default_factory=dict)
    validation: dict[str, Any] = Field(default_factory=dict)
    configuration: dict[str, Any] = Field(default_factory=dict)
    scenario: Optional[dict[str, Any]] = None
    assumptions: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    trace: list[TraceStep] = Field(default_factory=list)
    executed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @model_validator(mode="after")
    def _rules(self) -> "EngineResult":
        if _ENGINE_TO_TYPE[self.engine_name] != self.data_type:
            raise ValueError(f"engine {self.engine_name} must emit data_type {_ENGINE_TO_TYPE[self.engine_name]}")
        if self.default_field not in self.grid.fields:
            raise ValueError("default_field must be one of grid.fields")
        if not self.sources:
            raise ValueError("every result must name its source datasets")
        if self.data_type == "predicted":
            if not self.model or "uncertainty" not in self.__dict__ or not self.validation:
                raise ValueError("predicted results require model, uncertainty and validation blocks")
            if "status" not in self.validation:
                raise ValueError("predicted results require validation.status")
        if self.data_type == "simulated":
            if not self.scenario or not self.assumptions:
                raise ValueError("simulated results require a scenario and explicit assumptions")
        n_times = len(self.grid.times)
        cell_ids = {c["id"] for c in self.grid.cells}
        for name, f in self.grid.fields.items():
            if f.kind == "time_series":
                for cid, arr in f.values.items():
                    if cid not in cell_ids:
                        raise ValueError(f"field {name}: unknown cell {cid}")
                    if len(arr) != n_times:
                        raise ValueError(f"field {name} cell {cid}: {len(arr)} values for {n_times} times")
        return self


class Tracer:
    """Records real execution steps for the Scientific Inspector."""

    def __init__(self) -> None:
        self.steps: list[TraceStep] = []
        self._t = time.perf_counter()

    def add(self, step: str, detail: str = "", status: str = "ok") -> None:
        now = time.perf_counter()
        self.steps.append(TraceStep(step=step, status=status, detail=detail, duration_ms=round((now - self._t) * 1000, 2)))
        self._t = now


def clean(v: Any, nd: int = 4) -> Any:
    """float/NaN → rounded float or None (missing stays missing)."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return v
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return round(f, nd)


class FeasibilityError(Exception):
    """Raised when an engine must refuse a request rather than mislead."""

    def __init__(self, reason: str, *, requirement: str = "", hint: str = "") -> None:
        super().__init__(reason)
        self.reason, self.requirement, self.hint = reason, requirement, hint

    def to_dict(self) -> dict[str, str]:
        return {"error": "infeasible_request", "reason": self.reason, "requirement": self.requirement, "hint": self.hint}
