"""Thin live WebSocket channel for the public site / explorer.

Pushes health on connect and optional site-summary heartbeats when the client
asks to watch_site. Does not rewrite scientific engines — only wraps existing
site summary for live UI invalidation.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.site import site_summary
from config.settings import get_settings

router = APIRouter(tags=["ws"])
logger = logging.getLogger("bhuvyom.ws")


def _health() -> dict[str, Any]:
    s = get_settings()
    return {
        "type": "health",
        "status": "ok",
        "service": "bhuvyom-acquisition",
        "earthdata_configured": s.has_earthdata_token,
    }


def _sync_summary() -> dict[str, Any]:
    data = site_summary()
    if hasattr(data, "body"):
        raw = data.body
        data = json.loads(raw.decode() if isinstance(raw, (bytes, bytearray)) else raw)
    return {"type": "site", "summary": data}


@router.websocket("/api/ws/live")
async def live(ws: WebSocket) -> None:
    await ws.accept()
    await ws.send_json(_health())
    watch = False
    try:
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=20.0)
            except asyncio.TimeoutError:
                if watch:
                    await ws.send_json(await asyncio.to_thread(_sync_summary))
                else:
                    await ws.send_json({"type": "pong", "t": asyncio.get_event_loop().time()})
                continue

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "reason": "invalid_json"})
                continue

            op = msg.get("op")
            if op == "ping":
                await ws.send_json({"type": "pong", "t": asyncio.get_event_loop().time()})
            elif op == "watch_site":
                watch = True
                await ws.send_json(await asyncio.to_thread(_sync_summary))
            else:
                await ws.send_json({"type": "error", "reason": f"unknown_op:{op}"})
    except WebSocketDisconnect:
        logger.debug("ws client disconnected")
