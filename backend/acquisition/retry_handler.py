"""HTTP retry with exponential backoff.

Does not invent NASA rate limits. Retries transient network/HTTP failures only.
"""

from __future__ import annotations

import logging
from typing import Callable, TypeVar

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")

TRANSIENT_STATUS = frozenset({408, 429, 500, 502, 503, 504})


class TransientHTTPError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


def sync_retry(fn: Callable[..., T]) -> Callable[..., T]:
    return retry(
        reraise=True,
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((TransientHTTPError, TimeoutError, ConnectionError)),
        before_sleep=lambda rs: logger.warning(
            "Retrying %s after %s (attempt %s)",
            fn.__name__,
            rs.outcome.exception() if rs.outcome else "?",
            rs.attempt_number,
        ),
    )(fn)


def async_retry(fn: Callable[..., T]) -> Callable[..., T]:
    return retry(
        reraise=True,
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=1, min=1, max=30),
        retry=retry_if_exception_type((TransientHTTPError, TimeoutError, ConnectionError)),
        before_sleep=lambda rs: logger.warning(
            "Async retrying %s after %s (attempt %s)",
            fn.__name__,
            rs.outcome.exception() if rs.outcome else "?",
            rs.attempt_number,
        ),
    )(fn)


def raise_for_transient(status_code: int, body: str = "") -> None:
    if status_code in TRANSIENT_STATUS:
        raise TransientHTTPError(status_code, f"Transient HTTP {status_code}: {body[:200]}")
