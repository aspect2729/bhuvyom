"""NASA POWER daily + monthly point API client.

Daily verified against server/samples/power_sample.json (2026-11-13).
Monthly verified against server/samples/power_monthly_sample.json:
  - URL: https://power.larc.nasa.gov/api/temporal/monthly/point
  - start/end are calendar years (e.g. 2020, 2022), not YYYYMMDD
  - series keys are YYYYMM; suffix 13 is the annual value and must be excluded
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal

import httpx

logger = logging.getLogger(__name__)

POWER_DAILY_POINT_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
POWER_MONTHLY_POINT_URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"

# Verified present in live POWER daily + monthly responses.
POWER_PARAMETERS = (
    "T2M",
    "T2M_MAX",
    "T2M_MIN",
    "RH2M",
    "WS2M",
    "ALLSKY_SFC_SW_DWN",
    "CLOUD_AMT",
    "PRECTOTCORR",
)

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Cap concurrent outbound requests to NASA POWER.
_nasa_semaphore = asyncio.Semaphore(2)

# Near-real-time window: if end is within this many days of today, cache briefly.
NRT_END_WITHIN_DAYS = 30
NRT_CACHE_TTL_SECONDS = 24 * 60 * 60

TemporalMode = Literal["daily", "monthly"]


class PowerAPIError(Exception):
    """Raised when NASA POWER returns an error or unexpected payload."""

    def __init__(self, message: str, *, status_code: int | None = None, detail: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail


def _parse_end_date(end: str, temporal: TemporalMode) -> date:
    """Interpret daily YYYYMMDD or monthly YYYY end for NRT checks."""
    if temporal == "daily":
        return datetime.strptime(end, "%Y%m%d").date()
    if temporal == "monthly":
        # Monthly end is a year; treat as 31 Dec of that year.
        return date(int(end), 12, 31)
    raise ValueError(f"Unknown temporal mode {temporal!r}")


def is_near_realtime_end(end: str, temporal: TemporalMode = "daily") -> bool:
    """True when the requested end is within 30 days of today (NASA publish lag)."""
    end_d = _parse_end_date(end, temporal)
    return end_d >= (date.today() - timedelta(days=NRT_END_WITHIN_DAYS))


def _cache_key(lat: float, lon: float, start: str, end: str, temporal: TemporalMode) -> str:
    return f"{temporal}_{lat:.5f}_{lon:.5f}_{start}_{end}.json"


def _cache_path(
    lat: float, lon: float, start: str, end: str, temporal: TemporalMode
) -> Path:
    return CACHE_DIR / _cache_key(lat, lon, start, end, temporal)


def _read_cache(
    lat: float,
    lon: float,
    start: str,
    end: str,
    temporal: TemporalMode,
) -> dict[str, Any] | None:
    path = _cache_path(lat, lon, start, end, temporal)
    if not path.exists():
        return None

    nrt = is_near_realtime_end(end, temporal)
    if nrt:
        age = time.time() - path.stat().st_mtime
        if age > NRT_CACHE_TTL_SECONDS:
            logger.info(
                "POWER NRT cache expired (age=%.0fs > %ss) %s",
                age,
                NRT_CACHE_TTL_SECONDS,
                path.name,
            )
            return None

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Ignoring corrupt cache file %s: %s", path, exc)
        return None


def _write_cache(
    lat: float,
    lon: float,
    start: str,
    end: str,
    temporal: TemporalMode,
    payload: dict[str, Any],
) -> None:
    """Persist cache. NRT responses get a 24h TTL enforced on read via mtime."""
    path = _cache_path(lat, lon, start, end, temporal)
    path.write_text(json.dumps(payload), encoding="utf-8")
    if is_near_realtime_end(end, temporal):
        logger.info("POWER NRT cache write (24h TTL) %s", path.name)
    else:
        logger.info("POWER historical cache write (permanent) %s", path.name)


async def _fetch_power(
    url: str,
    latitude: float,
    longitude: float,
    start: str,
    end: str,
    temporal: TemporalMode,
    *,
    client: httpx.AsyncClient | None = None,
    use_cache: bool = True,
) -> dict[str, Any]:
    if use_cache:
        cached = _read_cache(latitude, longitude, start, end, temporal)
        if cached is not None:
            logger.info(
                "POWER cache hit temporal=%s lat=%.5f lon=%.5f start=%s end=%s",
                temporal,
                latitude,
                longitude,
                start,
                end,
            )
            return cached

    params = {
        "parameters": ",".join(POWER_PARAMETERS),
        "community": "RE",
        "latitude": latitude,
        "longitude": longitude,
        "start": start,
        "end": end,
        "format": "JSON",
    }

    owns_client = client is None
    if owns_client:
        client = httpx.AsyncClient(timeout=120.0)

    assert client is not None

    try:
        async with _nasa_semaphore:
            logger.info(
                "POWER request temporal=%s lat=%.5f lon=%.5f start=%s end=%s",
                temporal,
                latitude,
                longitude,
                start,
                end,
            )
            try:
                response = await client.get(url, params=params)
            except httpx.RequestError as exc:
                logger.error("NASA POWER network error: %s", exc)
                raise PowerAPIError(
                    f"Failed to reach NASA POWER: {exc}",
                    status_code=502,
                    detail=str(exc),
                ) from exc

        if response.status_code != 200:
            logger.error(
                "NASA POWER HTTP %s: %s",
                response.status_code,
                response.text[:500],
            )
            raise PowerAPIError(
                f"NASA POWER returned HTTP {response.status_code}",
                status_code=response.status_code,
                detail=response.text[:1000],
            )

        try:
            payload = response.json()
        except json.JSONDecodeError as exc:
            logger.error("NASA POWER returned non-JSON body")
            raise PowerAPIError(
                "NASA POWER returned non-JSON body",
                status_code=502,
                detail=response.text[:500],
            ) from exc

        if not isinstance(payload, dict):
            raise PowerAPIError("NASA POWER JSON root was not an object", status_code=502)

        if payload.get("errors"):
            logger.error("NASA POWER errors field: %s", payload.get("errors"))
            raise PowerAPIError(
                "NASA POWER reported errors in the response body",
                status_code=502,
                detail=payload.get("errors"),
            )

        if "properties" not in payload or "parameters" not in payload:
            raise PowerAPIError(
                "NASA POWER response missing properties/parameters",
                status_code=502,
                detail=list(payload.keys()),
            )

        if use_cache:
            _write_cache(latitude, longitude, start, end, temporal, payload)

        return payload
    finally:
        if owns_client:
            await client.aclose()


async def fetch_power_daily_point(
    latitude: float,
    longitude: float,
    start: str,
    end: str,
    *,
    client: httpx.AsyncClient | None = None,
    use_cache: bool = True,
) -> dict[str, Any]:
    """Fetch NASA POWER daily point JSON (start/end = YYYYMMDD)."""
    return await _fetch_power(
        POWER_DAILY_POINT_URL,
        latitude,
        longitude,
        start,
        end,
        "daily",
        client=client,
        use_cache=use_cache,
    )


async def fetch_power_monthly_point(
    latitude: float,
    longitude: float,
    start_year: str | int,
    end_year: str | int,
    *,
    client: httpx.AsyncClient | None = None,
    use_cache: bool = True,
) -> dict[str, Any]:
    """Fetch NASA POWER monthly point JSON (start/end = calendar years).

    Verified live: /api/temporal/monthly/point?start=2020&end=2022 …
    Annual values appear as YYYY13 keys in properties.parameter — exclude in parser.
    """
    start = str(start_year)
    end = str(end_year)
    return await _fetch_power(
        POWER_MONTHLY_POINT_URL,
        latitude,
        longitude,
        start,
        end,
        "monthly",
        client=client,
        use_cache=use_cache,
    )
