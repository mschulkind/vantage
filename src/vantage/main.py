import asyncio
import contextlib
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from vantage.routers import api, socket
from vantage.services.watcher import watch_multi_repo, watch_repo
from vantage.settings import settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Startup logic - use multi-repo watcher in daemon mode
    if settings.multi_repo:
        watcher_task = asyncio.create_task(watch_multi_repo())
    else:
        watcher_task = asyncio.create_task(watch_repo())
    yield
    # Shutdown logic
    watcher_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await watcher_task


app = FastAPI(title="Vantage", lifespan=lifespan)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

app.include_router(api.router, prefix="/api")
app.include_router(socket.router, prefix="/api")

# Mount frontend static files
# Try multiple locations:
# 1. Bundled in package (for installed package)
# 2. Development location (for dev mode)
frontend_dist = None
possible_paths = [
    # Bundled in package
    os.path.join(os.path.dirname(__file__), "frontend_dist"),
    # Development location
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist"),
]

for path in possible_paths:
    if os.path.isdir(path):
        frontend_dist = path
        break

if frontend_dist:
    app.mount(
        "/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets"
    )

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Allow API routes to pass through if they weren't caught above (though they should be by include_router)
        if full_path.startswith("api"):
            return {"error": "Not found"}

        # Serve index.html for SPA routing
        return FileResponse(os.path.join(frontend_dist, "index.html"))
else:

    @app.get("/")
    async def root():
        return {
            "message": "Vantage API is running. Frontend not found. Run 'npm run build' in frontend/ directory to serve UI."
        }
