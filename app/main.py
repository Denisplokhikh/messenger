from pathlib import Path
from contextlib import asynccontextmanager
import asyncio
import logging

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from alembic import command
from alembic.config import Config
from app.api.v1.router import api_v1_router
from app.config import settings
from app.database import engine

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.utils.limiter import limiter

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
# Собранный React-фронтенд (cd frontend && npm run build)
FRONTEND_DIR = BASE_DIR / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Apply Alembic migrations on startup. Any failure aborts startup:
    # serving requests without a valid schema is worse than not starting.
    alembic_ini_path = BASE_DIR / "alembic.ini"
    if not alembic_ini_path.exists():
        raise RuntimeError(f"alembic.ini not found at {alembic_ini_path}")
    try:
        alembic_cfg = Config(str(alembic_ini_path))
        await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
    except Exception:
        logger.exception("Alembic migration failed, aborting startup")
        raise
    logger.info("Alembic database migrations applied successfully.")

    yield
    # Cleanup database engine connections on shutdown
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Real-time Messenger Backend with FastAPI, PostgreSQL and WebSockets",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Middleware (allows frontend web/mobile clients to connect)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_v1_router)


@app.get("/api/health", tags=["Health"])
async def health_check():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "docs": "/docs",
    }


# Ассеты Vite: в имени файла есть хеш, поэтому их можно кешировать надолго
if (FRONTEND_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


# SPA fallback: все остальные GET-запросы отдают index.html, маршрутизацией занимается React.
# Должен быть объявлен последним, чтобы не перехватывать API.
@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    # Файлы из корня dist (favicon.svg и т.п.)
    frontend_root = FRONTEND_DIR.resolve()
    file = (FRONTEND_DIR / full_path).resolve()
    if full_path and file.is_file() and file.is_relative_to(frontend_root):
        return FileResponse(file)

    index_file = FRONTEND_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Frontend is not built. Run `npm run build` in frontend/",
        )
    # index.html не кешируем, чтобы после деплоя браузер сразу получил ссылки на новые ассеты
    return FileResponse(index_file, headers={"Cache-Control": "no-cache"})
