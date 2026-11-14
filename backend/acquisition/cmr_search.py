"""NASA CMR granule discovery (https://cmr.earthdata.nasa.gov)."""

from __future__ import annotations

import logging
from datetime import date
from typing import Any, Optional

import httpx

from acquisition.retry_handler import TransientHTTPError, raise_for_transient, sync_retry
from config.settings import get_settings

logger = logging.getLogger(__name__)

CMR_GRANULES_URL = "https://cmr.earthdata.nasa.gov/search/granules.json"


@sync_retry
def search_granules(
    short_name: str,
    *,
    version: Optional[str] = None,
    bbox: Optional[tuple[float, float, float, float]] = None,
    start: Optional[date | str] = None,
    end: Optional[date | str] = None,
    page_size: int = 50,
    provider: Optional[str] = None,
    timeout: Optional[float] = None,
) -> list[dict[str, Any]]:
    """Search CMR for granules intersecting a bounding box and time range.

    bbox is (west, south, east, north) in WGS84 degrees.
    """
    settings = get_settings()
    params: dict[str, Any] = {
        "short_name": short_name,
        "page_size": page_size,
        "sort_key": "start_date",
    }
    if version:
        params["version"] = version
    if provider:
        params["provider"] = provider
    if bbox:
        west, south, east, north = bbox
        params["bounding_box"] = f"{west},{south},{east},{north}"
    if start or end:
        start_s = str(start) if start else ""
        end_s = str(end) if end else ""
        params["temporal"] = f"{start_s},{end_s}"

    logger.info("CMR search short_name=%s params=%s", short_name, params)
    with httpx.Client(timeout=timeout or settings.http_timeout_seconds) as client:
        response = client.get(CMR_GRANULES_URL, params=params)
        raise_for_transient(response.status_code, response.text)
        if response.status_code != 200:
            raise RuntimeError(f"CMR search failed HTTP {response.status_code}: {response.text[:500]}")
        payload = response.json()

    entries = (payload.get("feed") or {}).get("entry") or []
    logger.info("CMR returned %s granules for %s", len(entries), short_name)
    return entries


def extract_download_urls(granule: dict[str, Any]) -> list[str]:
    """Return https download links from a CMR granule entry."""
    urls: list[str] = []
    for link in granule.get("links") or []:
        href = link.get("href")
        rel = (link.get("rel") or "").lower()
        if not href:
            continue
        if "http" in rel or href.startswith("https://"):
            if any(x in href for x in (".nc", ".hdf", ".h5", ".tif", ".zip", "opendap")):
                urls.append(href)
            elif "data#" in rel or "/data/" in rel:
                urls.append(href)
    # Prefer non-OPeNDAP https last if empty
    if not urls:
        for link in granule.get("links") or []:
            href = link.get("href")
            if href and href.startswith("https://"):
                urls.append(href)
    return urls
