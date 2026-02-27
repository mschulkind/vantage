import contextlib
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.debug("WebSocket connected (total: %d)", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        try:
            self.active_connections.remove(websocket)
            logger.debug("WebSocket disconnected (total: %d)", len(self.active_connections))
        except ValueError:
            # Already removed (e.g. both onerror and onclose fired)
            logger.debug("WebSocket already removed from active connections")

    async def broadcast(self, message: dict[str, Any]):
        if not self.active_connections:
            logger.debug("Broadcast skipped: no active connections")
            return

        dead: list[WebSocket] = []
        sent = 0
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
                sent += 1
            except Exception:
                logger.warning("Failed to send to WebSocket, removing dead connection")
                dead.append(connection)

        for conn in dead:
            with contextlib.suppress(ValueError):
                self.active_connections.remove(conn)

        logger.debug(
            "Broadcast complete: sent=%d, failed=%d, remaining=%d",
            sent,
            len(dead),
            len(self.active_connections),
        )


manager = ConnectionManager()
