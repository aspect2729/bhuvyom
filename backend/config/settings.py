"""Runtime settings loaded from environment variables.

Credentials are never hardcoded. The engine initialises and runs offline tests
even when Earthdata / Supabase credentials are absent.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_ROOT = BACKEND_ROOT / "data"
DEFAULT_BOUNDARY = DEFAULT_DATA_ROOT / "boundaries" / "bengaluru_bbmp.geojson"
GREATER_BOUNDARY = DEFAULT_DATA_ROOT / "boundaries" / "greater_bengaluru.geojson"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    earthdata_token: Optional[str] = Field(default=None, alias="EARTHDATA_TOKEN")
    earthdata_username: Optional[str] = Field(default=None, alias="EARTHDATA_USERNAME")
    earthdata_password: Optional[str] = Field(default=None, alias="EARTHDATA_PASSWORD")

    cds_api_url: str = Field(
        default="https://cds.climate.copernicus.eu/api",
        alias="CDS_API_URL",
    )
    cds_api_key: Optional[str] = Field(default=None, alias="CDS_API_KEY")

    # Supabase is optional and NOT used for live temperature (Earthdata OPeNDAP instead).
    supabase_url: Optional[str] = Field(default=None, alias="SUPABASE_URL")
    supabase_service_role_key: Optional[str] = Field(
        default=None, alias="SUPABASE_SERVICE_ROLE_KEY"
    )
    # Browser/mobile publishable key (sb_publishable_… / legacy anon). Server never needs it for storage.
    supabase_publishable_key: Optional[str] = Field(
        default=None, alias="SUPABASE_PUBLISHABLE_KEY"
    )
    supabase_bucket: str = Field(default="bhuvyom-rasters", alias="SUPABASE_BUCKET")
    # Kill-switch: DB observation ingest (pipeline → Supabase) off by default.
    use_supabase_ingest: bool = Field(default=False, alias="BHUVYOM_USE_SUPABASE_INGEST")

    data_root: Path = Field(default=DEFAULT_DATA_ROOT, alias="BHUVYOM_DATA_ROOT")
    default_region: str = Field(default="bengaluru_bbmp", alias="BHUVYOM_DEFAULT_REGION")
    boundary_path: Path = Field(default=DEFAULT_BOUNDARY, alias="BHUVYOM_BOUNDARY_PATH")
    greater_boundary_path: Path = Field(
        default=GREATER_BOUNDARY, alias="BHUVYOM_GREATER_BOUNDARY_PATH"
    )

    http_timeout_seconds: float = Field(default=120.0, alias="BHUVYOM_HTTP_TIMEOUT_SECONDS")
    max_concurrency: int = Field(default=2, alias="BHUVYOM_MAX_CONCURRENCY")
    log_level: str = Field(default="INFO", alias="BHUVYOM_LOG_LEVEL")

    @property
    def has_earthdata_token(self) -> bool:
        return bool(self.earthdata_token and self.earthdata_token.strip())

    @property
    def has_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def has_cds(self) -> bool:
        return bool(self.cds_api_key and self.cds_api_key.strip())

    @property
    def raw_dir(self) -> Path:
        return self.data_root / "raw"

    @property
    def processed_dir(self) -> Path:
        return self.data_root / "processed"

    @property
    def simulation_dir(self) -> Path:
        return self.data_root / "simulation_inputs"

    @property
    def cache_dir(self) -> Path:
        return self.data_root / "cache"

    def ensure_dirs(self) -> None:
        for path in (
            self.raw_dir,
            self.processed_dir,
            self.simulation_dir,
            self.cache_dir,
            self.data_root / "boundaries",
            self.data_root / "fixtures",
        ):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings
