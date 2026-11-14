"""Shared Scientific Knowledge Base access (scientific/methodology_registry.json)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from config.settings import BACKEND_ROOT

ROOT = BACKEND_ROOT.parent
REGISTRY = ROOT / "scientific" / "methodology_registry.json"
METHODOLOGY_DOC = ROOT / "METHODOLOGY_REFERENCE.md"
# sha256 of METHODOLOGY_REFERENCE.md when the registry was last synchronised with it
SYNCED_DOC_SHA = "6e7b288534d7f108"


def registry() -> dict:
    reg = json.loads(REGISTRY.read_text())
    doc_sha = hashlib.sha256(METHODOLOGY_DOC.read_bytes()).hexdigest()[:16] if METHODOLOGY_DOC.exists() else None
    reg["methodology_doc_sha"] = doc_sha
    reg["registry_in_sync_with_doc"] = doc_sha == SYNCED_DOC_SHA
    if doc_sha != SYNCED_DOC_SHA:
        reg["sync_warning"] = "METHODOLOGY_REFERENCE.md changed since the registry was last reviewed — check implementations for discrepancies."
    return reg


def methodology(mid: str) -> dict | None:
    return next((m for m in registry()["methodologies"] if m["id"] == mid), None)
