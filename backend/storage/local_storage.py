"""Local filesystem storage for rasters, manifests, and bundles."""

from __future__ import annotations

from pathlib import Path

from config.settings import get_settings
from storage.storage_interface import StorageBackend


class LocalStorage(StorageBackend):
    def __init__(self, root: Path | None = None):
        settings = get_settings()
        self.root = root or (settings.data_root / "object_store")
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def put_bytes(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> str:
        path = self._path(key)
        path.write_bytes(data)
        return str(path)

    def put_file(self, key: str, path: Path) -> str:
        dest = self._path(key)
        dest.write_bytes(path.read_bytes())
        return str(dest)

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def url_or_path(self, key: str) -> str:
        return str(self._path(key))
