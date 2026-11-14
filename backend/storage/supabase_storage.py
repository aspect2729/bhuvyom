"""Supabase Storage adapter — used only when SUPABASE_* env vars are set.

Large rasters go to object storage; PostgreSQL holds metadata/jobs only.
"""

from __future__ import annotations

import logging
from pathlib import Path

from config.settings import get_settings
from storage.local_storage import LocalStorage
from storage.storage_interface import StorageBackend

logger = logging.getLogger(__name__)


class SupabaseStorage(StorageBackend):
    def __init__(self):
        self.settings = get_settings()
        if not self.settings.has_supabase:
            raise RuntimeError("Supabase credentials not configured")
        self._fallback = LocalStorage()
        try:
            from supabase import create_client

            self.client = create_client(
                self.settings.supabase_url,
                self.settings.supabase_service_role_key,
            )
            self.bucket = self.settings.supabase_bucket
            self._ready = True
        except Exception as exc:
            logger.warning("Supabase client init failed (%s); using local fallback", exc)
            self._ready = False

    def put_bytes(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> str:
        if not self._ready:
            return self._fallback.put_bytes(key, data, content_type=content_type)
        self.client.storage.from_(self.bucket).upload(
            key,
            data,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        return self.url_or_path(key)

    def put_file(self, key: str, path: Path) -> str:
        return self.put_bytes(key, path.read_bytes())

    def exists(self, key: str) -> bool:
        if not self._ready:
            return self._fallback.exists(key)
        try:
            parent = str(Path(key).parent).replace("\\", "/")
            name = Path(key).name
            items = self.client.storage.from_(self.bucket).list(parent if parent != "." else "")
            return any(i.get("name") == name for i in items or [])
        except Exception:
            return False

    def url_or_path(self, key: str) -> str:
        if not self._ready:
            return self._fallback.url_or_path(key)
        return f"{self.settings.supabase_url}/storage/v1/object/public/{self.bucket}/{key}"
