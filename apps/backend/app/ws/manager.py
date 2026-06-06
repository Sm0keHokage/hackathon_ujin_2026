import json
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, tablo_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[tablo_id] = websocket
        logger.info("Screen connected: %s (total: %d)", tablo_id, len(self._connections))

    def disconnect(self, tablo_id: str) -> None:
        self._connections.pop(tablo_id, None)
        logger.info("Screen disconnected: %s (total: %d)", tablo_id, len(self._connections))

    @property
    def connected_ids(self) -> list[str]:
        return list(self._connections.keys())

    async def send_to(self, tablo_id: str, message: dict) -> None:
        ws = self._connections.get(tablo_id)
        if ws is None:
            return
        try:
            await ws.send_text(json.dumps(message, ensure_ascii=False))
        except Exception:
            self.disconnect(tablo_id)

    async def broadcast_all(self, message: dict) -> None:
        if not self._connections:
            return
        payload = json.dumps(message, ensure_ascii=False)
        dead: list[str] = []
        for tablo_id, ws in list(self._connections.items()):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(tablo_id)
        for tablo_id in dead:
            self.disconnect(tablo_id)

    async def broadcast_to(self, tablo_ids: list[str], message: dict) -> None:
        if not tablo_ids or "all" in tablo_ids:
            await self.broadcast_all(message)
            return
        payload = json.dumps(message, ensure_ascii=False)
        for tablo_id in tablo_ids:
            ws = self._connections.get(tablo_id)
            if ws is None:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(tablo_id)