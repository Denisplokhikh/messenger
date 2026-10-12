from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import asyncio
import logging
from alembic import command
from alembic.config import Config

from app.api.v1.router import api_v1_router
from app.config import settings
from app.database import engine

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Automatically apply Alembic migrations on startup
    try:
        alembic_ini_path = BASE_DIR / "alembic.ini"
        if alembic_ini_path.exists():
            alembic_cfg = Config(str(alembic_ini_path))
            await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
            logger.info("Alembic database migrations applied successfully.")
    except Exception as e:
        logger.warning(f"Alembic auto-migration warning: {e}")

    yield
    # Cleanup database engine connections on shutdown
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Real-time Messenger Backend with FastAPI, PostgreSQL and WebSockets",
    lifespan=lifespan,
)

# CORS Middleware (allows frontend web/mobile clients to connect)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(api_v1_router)


@app.get("/", include_in_schema=False)
async def serve_index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Frontend not found"}

@app.get("/profile", include_in_schema=False)
async def serve_profile():
    profile_file = STATIC_DIR / "profile.html"
    if profile_file.exists():
        return FileResponse(profile_file)
    
    return {"message":"Profile page not found"}
@app.get("/static/app.js", include_in_schema=False)
async def serve_app_js():
    """Отдаём главный JS без кеша — браузер всегда берёт свежую версию."""
    js_file = STATIC_DIR / "app.js"
    if js_file.exists():
        return FileResponse(
            js_file,
            headers={"Cache-Control": "no-store, no-cache, must-revalidate"},
        )
    return {"message": "app.js not found"}


@app.get("/api/health", tags=["Health"])
async def health_check():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "docs": "/docs",
    }

