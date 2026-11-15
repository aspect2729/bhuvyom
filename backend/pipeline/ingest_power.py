"""RETIRED — NASA POWER (LaRC) is not NASA GES DISC distribution.

Do not import this module for ingestion. MERRA-2 must be accessed via GES DISC
OPeNDAP (pipeline.ingest_gesdisc_merra2), not the POWER community API.
"""

from __future__ import annotations

from typing import Any

from pipeline.source_policy import SourcePolicyError


def _retired(*_a: Any, **_k: Any) -> dict[str, Any]:
    raise SourcePolicyError(
        "NASA POWER ingestion is disabled under GES DISC exclusivity. "
        "Use pipeline.ingest_gesdisc_merra2 instead."
    )


ingest_power_daily_latest = _retired
ingest_power_monthly_historical = _retired
ingest_power_range = _retired
