import logging
from urllib.parse import urlparse

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from vantage.services.socket_manager import manager
from vantage.version import BUILD_VERSION

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Only accept WebSocket connections from localhost origins
    origin = websocket.headers.get("origin", "")
    if origin:
        parsed = urlparse(origin)
        if parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            logger.warning("WebSocket rejected: origin %s not allowed", origin)
            await websocket.close(code=1008, reason="Origin not allowed")
            return
    await manager.connect(websocket)
    # Send hello with protocol version so frontend can detect stale code
    logger.info("Sending hello (version=%s)", BUILD_VERSION)
    await websocket.send_json({"type": "hello", "version": BUILD_VERSION})
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect as exc:
        logger.info(
            "WebSocket client disconnected: code=%s reason=%s", exc.code, exc.reason or "(none)"
        )
        manager.disconnect(websocket)
    except Exception:
        logger.exception("WebSocket connection error")
        manager.disconnect(websocket)
