"""Helpers to select granules for the Bengaluru study area."""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from acquisition.cmr_search import extract_download_urls, search_granules
from processing.spatial_subset import RegionSpec


def discover_granules_for_region(
    short_name: str,
    region: RegionSpec,
    *,
    version: Optional[str] = None,
    start: Optional[date | str] = None,
    end: Optional[date | str] = None,
    page_size: int = 50,
) -> list[dict[str, Any]]:
    bbox = region.bbox_wsen()
    entries = search_granules(
        short_name,
        version=version,
        bbox=bbox,
        start=start,
        end=end,
        page_size=page_size,
    )
    enriched = []
    for entry in entries:
        enriched.append(
            {
                "id": entry.get("id"),
                "title": entry.get("title"),
                "time_start": entry.get("time_start"),
                "time_end": entry.get("time_end"),
                "polygons": entry.get("polygons"),
                "boxes": entry.get("boxes"),
                "download_urls": extract_download_urls(entry),
                "raw": entry,
            }
        )
    return enriched
