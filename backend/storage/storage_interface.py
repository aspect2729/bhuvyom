"""Storage abstraction — local by default, Supabase when configured."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from config.settings import get_settings


class StorageBackend(ABC):
    @abstractmethod
    def put_bytes(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> str:
        ...

    @abstractmethod
    def put_file(self, key: str, path: Path) -> str:
        ...

    @abstractmethod
    def exists(self, key: str) -> bool:
        ...

    @abstractmethod
    def url_or_path(self, key: str) -> str:
        ...


def get_storage() -> StorageBackend:
    settings = get_settings()
    if settings.has_supabase:
        from storage.supabase_storage import SupabaseStorage

        return SupabaseStorage()
    from storage.local_storage import LocalStorage

    return LocalStorage()
