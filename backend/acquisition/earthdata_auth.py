"""NASA Earthdata authentication helpers.

Does not request, generate, or hardcode credentials. Reads EARTHDATA_TOKEN
(and optional username/password) from settings / environment.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Mapping, Optional

from config.settings import Settings, get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EarthdataAuth:
    token: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

    @property
    def available(self) -> bool:
        return bool(self.token) or bool(self.username and self.password)

    def bearer_headers(self) -> dict[str, str]:
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    def as_dict(self) -> dict[str, Optional[str]]:
        return {
            "token_configured": bool(self.token),
            "username_configured": bool(self.username),
            "password_configured": bool(self.password),
            "available": self.available,
        }


def load_auth(settings: Settings | None = None) -> EarthdataAuth:
    s = settings or get_settings()
    auth = EarthdataAuth(
        token=(s.earthdata_token or None),
        username=(s.earthdata_username or None),
        password=(s.earthdata_password or None),
    )
    if not auth.available:
        logger.info(
            "Earthdata credentials unavailable — offline mode / public APIs only"
        )
    return auth


def get_auth_headers(settings: Settings | None = None) -> Mapping[str, str]:
    return load_auth(settings).bearer_headers()


def require_earthdata(settings: Settings | None = None) -> EarthdataAuth:
    auth = load_auth(settings)
    if not auth.available:
        raise PermissionError(
            "Earthdata credentials are not configured. Set EARTHDATA_TOKEN "
            "(or EARTHDATA_USERNAME + EARTHDATA_PASSWORD) in the environment. "
            "Do not commit secrets."
        )
    return auth
