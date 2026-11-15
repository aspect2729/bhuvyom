"""RETIRED — Open-Meteo is prohibited under NASA GES DISC exclusivity.

Do not import this module for ingestion. Use pipeline.ingest_gesdisc_merra2
and pipeline.ingest_gesdisc_gpm instead.
"""

from __future__ import annotations

from typing import Any

from pipeline.source_policy import SourcePolicyError


def _retired(*_a: Any, **_k: Any) -> dict[str, Any]:
    raise SourcePolicyError(
        "Open-Meteo ingestion is permanently disabled. "
        "Use NASA GES DISC MERRA-2 / GPM IMERG ingest only."
    )


ingest_open_meteo_archive_async = _retired
ingest_open_meteo_forecast_async = _retired
ingest_open_meteo_archive_recent = _retired
ingest_open_meteo_forecast = _retired
