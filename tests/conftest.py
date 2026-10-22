import os
import tempfile
import uuid
from typing import AsyncGenerator

# Загрузки из тестов не должны попадать в настоящую папку media/.
# Ставим до импорта app: settings читает переменные окружения один раз при импорте.
os.environ["MEDIA_DIR"] = tempfile.mkdtemp(prefix="messenger-test-media-")
os.environ["ATTACHMENTS_DIR"] = tempfile.mkdtemp(prefix="messenger-test-attachments-")
import pytest
from httpx import ASGITransport, AsyncClient
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.main import app
from app.utils.limiter import limiter


@pytest.fixture(scope="session", autouse=True)
def disable_limiter():
    """Отключаем rate limiting на время тестов, чтобы запросы не блокировались."""
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture(autouse=True)
async def dispose_engine():
    """Очищаем пул соединений SQLAlchemy между тестами, чтобы избежать конфликтов event loop."""
    yield
    from app.database import engine
    await engine.dispose()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Асинхронный HTTP-клиент для вызова эндпоинтов FastAPI."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


@pytest.fixture
def sync_client():
    """Синхронный TestClient (удобен для тестирования WebSocket)."""
    with TestClient(app) as tc:
        yield tc


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Сессия базы данных."""
    async with AsyncSessionLocal() as session:
        yield session


@pytest.fixture
async def create_user(client: AsyncClient):
    """Фабрика для создания уникального пользователя и получения его токена."""
    async def _create(username: str | None = None):
        uid = uuid.uuid4().hex[:8]
        u_name = username or f"user_{uid}"
        data = {
            "username": u_name,
            "email": f"{u_name}@example.com",
            "password": "valid_password_123",
        }
        resp = await client.post("/api/v1/auth/register", json=data)
        assert resp.status_code == 201, resp.text
        user_data = resp.json()

        # Логинимся и забираем токен
        login_resp = await client.post(
            "/api/v1/auth/login",
            data={"username": data["username"], "password": data["password"]},
        )
        token = login_resp.json()["access_token"]
        return {
            "id": user_data["id"],
            "username": data["username"],
            "token": token,
            "headers": {"Authorization": f"Bearer {token}"},
            "password": data["password"],
        }

    return _create


@pytest.fixture
async def create_direct_chat(client: AsyncClient):
    """Фабрика: создаёт личный чат между двумя пользователями и возвращает его id."""
    async def _create(user1: dict, user2: dict) -> int:
        resp = await client.post(
            "/api/v1/chats/direct",
            json={"recipient_id": user2["id"]},
            headers=user1["headers"],
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["id"]

    return _create
