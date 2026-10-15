import uuid

import pytest
from httpx import AsyncClient


def unique(prefix: str = "u") -> str:
    """Уникальное имя, чтобы тесты не конфликтовали с уже существующими юзерами в БД."""
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# ---------- Регистрация ----------

async def test_register_success(client: AsyncClient):
    name = unique()
    resp = await client.post(
        "/api/v1/auth/register",
        json={"username": name, "email": f"{name}@example.com", "password": "secret123"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == name
    # Пароль и хэш никогда не должны утекать в ответ
    assert "password" not in body
    assert "hashed_password" not in body


async def test_register_duplicate_username(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.post(
        "/api/v1/auth/register",
        json={"username": user["username"], "email": f"{unique()}@example.com", "password": "secret123"},
    )
    assert resp.status_code == 400


async def test_register_duplicate_email(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.post(
        "/api/v1/auth/register",
        json={"username": unique(), "email": f"{user['username']}@example.com", "password": "secret123"},
    )
    assert resp.status_code == 400


# parametrize запускает один и тот же тест с разными входными данными
@pytest.mark.parametrize(
    "username",
    [
        "ab",        # 2 символа — меньше минимума
        "a" * 21,    # 21 символ — больше максимума
    ],
)
async def test_register_invalid_username_length(client: AsyncClient, username: str):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"username": username, "email": f"{unique()}@example.com", "password": "secret123"},
    )
    assert resp.status_code == 422


async def test_register_password_too_long_for_bcrypt(client: AsyncClient):
    # bcrypt учитывает только 72 байта — длиннее схема пропускать не должна
    name = unique()
    resp = await client.post(
        "/api/v1/auth/register",
        json={"username": name, "email": f"{name}@example.com", "password": "a" * 73},
    )
    assert resp.status_code == 422


async def test_register_invalid_email(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={"username": unique(), "email": "not-an-email", "password": "secret123"},
    )
    assert resp.status_code == 422


# ---------- Логин ----------

async def test_login_by_username(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": user["username"], "password": user["password"]},
    )
    assert resp.status_code == 200
    assert resp.json()["token_type"] == "bearer"


async def test_login_by_email(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": f"{user['username']}@example.com", "password": user["password"]},
    )
    assert resp.status_code == 200


async def test_login_wrong_password(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": user["username"], "password": "wrong_password"},
    )
    assert resp.status_code == 401


async def test_login_unknown_user(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/login",
        data={"username": unique(), "password": "whatever123"},
    )
    assert resp.status_code == 401


# ---------- Защищённые эндпоинты ----------

async def test_me_requires_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_me_with_garbage_token(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"})
    assert resp.status_code == 401


async def test_me_returns_current_user(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.get("/api/v1/auth/me", headers=user["headers"])
    assert resp.status_code == 200
    assert resp.json()["id"] == user["id"]
