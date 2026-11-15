"""NASA GES DISC exclusivity — reject prohibited environmental providers."""

from __future__ import annotations

from typing import Any

# Only these dataset_code values may write into environmental_observations.
ALLOWED_DATASET_CODES = frozenset(
    {
        "merra2_assim",
        "gpm_imerg_v07_daily",
        "gpm_imerg_v07_half_hourly",
        # Future GES DISC products explicitly registered with NASA GES DISC provenance:
        # "smap_spl3smp_e" is NSIDC, not GES DISC — excluded
        # MODIS is LP DAAC — excluded unless accessed via GES DISC (it is not)
    }
)

ALLOWED_PROVIDER_MARKERS = frozenset(
    {
        "NASA GES DISC",
        "GES DISC",
        "NASA GES DISC / Earthdata",
    }
)

PROHIBITED_DATASET_CODES = frozenset(
    {
        "open_meteo_forecast",
        "open_meteo_archive",
        "nasa_power",  # NASA LaRC POWER — not GES DISC distribution
        "era5_land",  # Copernicus CDS
    }
)

PROHIBITED_SOURCE_SUBSTRINGS = (
    "open-meteo",
    "open_meteo",
    "openmeteo",
    "power.larc",
    "nasa_power",
    "imd",
    "isro",
    "copernicus",
    "cds.climate",
)


class SourcePolicyError(ValueError):
    """Raised when a record violates NASA GES DISC exclusivity."""


def assert_allowed_dataset(dataset_code: str) -> None:
    if dataset_code in PROHIBITED_DATASET_CODES:
        raise SourcePolicyError(
            f"Dataset '{dataset_code}' is prohibited under NASA GES DISC exclusivity."
        )
    if dataset_code not in ALLOWED_DATASET_CODES:
        raise SourcePolicyError(
            f"Dataset '{dataset_code}' is not on the GES DISC allow-list. "
            "Register it only after verifying GES DISC distribution."
        )


def assert_metadata_ges_disc(metadata: dict[str, Any] | None) -> None:
    meta = metadata or {}
    blob = " ".join(
        str(meta.get(k, ""))
        for k in ("source", "provider", "access_platform", "distributor", "adapter")
    ).lower()
    for bad in PROHIBITED_SOURCE_SUBSTRINGS:
        if bad in blob:
            raise SourcePolicyError(f"Prohibited source marker '{bad}' in metadata")
    provider = str(meta.get("provider") or meta.get("access_platform") or "")
    if provider and not any(m.lower() in provider.lower() for m in ALLOWED_PROVIDER_MARKERS):
        # require explicit GES DISC marker when provider is set
        if "ges disc" not in provider.lower() and "ges_disc" not in provider.lower():
            raise SourcePolicyError(
                f"Provider '{provider}' is not NASA GES DISC"
            )


def require_nasa_collection(metadata: dict[str, Any] | None) -> None:
    meta = metadata or {}
    cid = meta.get("collection_concept_id") or meta.get("nasa_collection_id")
    short = meta.get("dataset_short_name") or meta.get("product_short_name")
    if not cid and not short:
        raise SourcePolicyError(
            "Missing NASA collection_concept_id / dataset_short_name for provenance"
        )
