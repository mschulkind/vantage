from urllib.parse import urlparse

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from vantage.services.socket_manager import manager
from vantage.version import BUILD_VERSION

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Only accept WebSocket connections from localhost origins
    origin = websocket.headers.get("origin", "")
    if origin:
        parsed = urlparse(origin)
        if parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            await websocket.close(code=1008, reason="Origin not allowed")
            return
    await manager.connect(websocket)
    # Send hello with protocol version so frontend can detect stale code
    await websocket.send_json({"type": "hello", "version": BUILD_VERSION})
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
