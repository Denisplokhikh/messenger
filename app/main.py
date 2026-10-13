from pathlib import Path
from contextlib import asynccontextmanager
from typing import Annotated
import asyncio
import logging

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.exceptions import HTTPException as StarletteHTTPException

from alembic import command
from alembic.config import Config
from app.api.deps import get_db
from app.api.v1.router import api_v1_router
from app.config import settings
from app.database import engine
from app.models.user import User

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


@app.get("/login", include_in_schema=False)
async def serve_login():
    login_file = STATIC_DIR / "login.html"
    if login_file.exists():
        return FileResponse(login_file)
    return {"message": "Login page not found"}


@app.get("/profile", include_in_schema=False)
async def serve_profile():
    profile_file = STATIC_DIR / "profile.html"
    if profile_file.exists():
        return FileResponse(profile_file)
    return {"message": "Profile page not found"}


@app.get("/profile/{user_id}", include_in_schema=False)
async def server_user_profile(
    user_id: int, db: Annotated[AsyncSession, Depends(get_db)]
):
    result = await db.execute(select(User.id).where(User.id == user_id))
    user_exists = result.scalar_one_or_none()

    profile_file = STATIC_DIR / "profile.html"
    if not user_exists or not profile_file.exists():
        page_404 = STATIC_DIR / "404.html"
        if page_404.exists():
            return FileResponse(page_404, status_code=status.HTTP_404_NOT_FOUND)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    return FileResponse(profile_file)


@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == status.HTTP_404_NOT_FOUND:
        if request.url.path.startswith("/api/"):
            return JSONResponse(status_code=404, content={"detail": exc.detail})
        page_404 = STATIC_DIR / "404.html"
        if page_404.exists():
            return FileResponse(page_404, status_code=status.HTTP_404_NOT_FOUND)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


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
