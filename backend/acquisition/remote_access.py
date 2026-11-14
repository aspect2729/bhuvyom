"""Authenticated remote download with caching and concurrency limits."""

from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import httpx

from acquisition.earthdata_auth import load_auth, require_earthdata
from acquisition.retry_handler import TransientHTTPError, async_retry, raise_for_transient
from config.settings import get_settings

logger = logging.getLogger(__name__)


def cache_path_for_url(url: str, cache_dir: Path | None = None) -> Path:
    settings = get_settings()
    root = cache_dir or settings.cache_dir
    root.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
    name = Path(urlparse(url).path).name or "download.bin"
    return root / f"{digest}_{name}"


@async_retry
async def download_file(
    url: str,
    dest: Path | None = None,
    *,
    require_auth: bool = True,
    use_cache: bool = True,
    timeout: Optional[float] = None,
) -> Path:
    """Download a remote file with optional Earthdata bearer auth and local cache."""
    settings = get_settings()
    target = dest or cache_path_for_url(url)
    if use_cache and target.exists() and target.stat().st_size > 0:
        logger.info("Cache hit %s", target.name)
        return target

    headers: dict[str, str] = {}
    if require_auth:
        auth = require_earthdata(settings)
        headers.update(auth.bearer_headers())
    else:
        headers.update(load_auth(settings).bearer_headers())

    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".partial")

    async with httpx.AsyncClient(
        timeout=timeout or settings.http_timeout_seconds,
        follow_redirects=True,
        headers=headers,
    ) as client:
        logger.info("Downloading %s -> %s", url, target)
        response = await client.get(url)
        raise_for_transient(response.status_code, response.text)
        if response.status_code in (401, 403):
            raise PermissionError(
                f"Authorisation failed for {url} (HTTP {response.status_code}). "
                "Check EARTHDATA_TOKEN and product-specific approvals."
            )
        if response.status_code != 200:
            raise RuntimeError(f"Download failed HTTP {response.status_code}: {url}")
        tmp.write_bytes(response.content)
        tmp.replace(target)
    return target


_semaphore: asyncio.Semaphore | None = None


def get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(get_settings().max_concurrency)
    return _semaphore


async def download_limited(url: str, **kwargs) -> Path:
    async with get_semaphore():
        return await download_file(url, **kwargs)
