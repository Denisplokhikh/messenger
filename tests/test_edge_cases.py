from datetime import timedelta
import json
import pytest
from httpx import AsyncClient
from fastapi.testclient import TestClient

from app.services.connection_manager import manager
from app.utils.security import create_access_token


# 1. А что если передать пустой или слишком короткий пароль?
async def test_register_with_short_or_empty_password(client: AsyncClient):
    # Пустой пароль
    resp_empty = await client.post(
        "/api/v1/auth/register",
        json={"username": "short_pwd_user", "email": "short@example.com", "password": ""},
    )
    assert resp_empty.status_code == 422  # Ошибка валидации Pydantic

    # Слишком короткий пароль (меньше 6 символов)
    resp_short = await client.post(
        "/api/v1/auth/register",
        json={"username": "short_pwd_user2", "email": "short2@example.com", "password": "123"},
    )
    assert resp_short.status_code == 422


# 2. А что если токен истёк ровно 1 секунду назад?
async def test_expired_token_access_denied(client: AsyncClient, create_user):
    user = await create_user()

    # Генерируем токен, срок которого истёк 1 секунду назад
    expired_token = create_access_token(
        subject=user["id"],
        expires_delta=timedelta(seconds=-1),
    )

    # Пробуем запросить защищённый эндпоинт профиля
    resp = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Could not validate credentials"


# 2a. Старый формат токена (sub = числовой id) больше не принимается
async def test_legacy_numeric_sub_token_rejected(client: AsyncClient, create_user):
    await create_user()
    resp = await client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {create_access_token(subject=1)}"},
    )
    assert resp.status_code == 401


# 3. А что если пользователь попытался создать чат сам с собой?
async def test_cannot_create_direct_chat_with_self(client: AsyncClient, create_user):
    user = await create_user()

    # Пытаемся передать свой же собственный user_id в recipient_id
    resp = await client.post(
        "/api/v1/chats/direct",
        json={"recipient_id": user["id"]},
        headers=user["headers"],
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Cannot create direct chat with yourself"


# 4. А если отправить сообщение длиной 50 000 символов?
async def test_message_oversized_rejected(client: AsyncClient, create_user):
    user1 = await create_user()
    user2 = await create_user()

    # Создаём диалог
    chat_resp = await client.post(
        "/api/v1/chats/direct",
        json={"recipient_id": user2["id"]},
        headers=user1["headers"],
    )
    assert chat_resp.status_code == 200
    chat_id = chat_resp.json()["id"]

    # Генерируем гигантский текст в 50 000 символов (лимит 1000)
    huge_content = "A" * 50000

    resp = await client.post(
        f"/api/v1/chats/{chat_id}/messages",
        json={"content": huge_content},
        headers=user1["headers"],
    )
    # Pydantic должен мгновенно отклонить такой запрос без обращения к БД
    assert resp.status_code == 422


# 5. А если разорвать соединение WebSocket во время работы?
def test_websocket_sudden_disconnect_cleanup(sync_client: TestClient):
    import uuid
    uid = uuid.uuid4().hex[:8]
    u_data = {
        "username": f"ws_user_{uid}",
        "email": f"ws_{uid}@example.com",
        "password": "valid_password_123",
    }
    r = sync_client.post("/api/v1/auth/register", json=u_data)
    # Менеджер хранит соединения по uuid пользователя
    user_id = uuid.UUID(r.json()["id"])

    login_r = sync_client.post(
        "/api/v1/auth/login",
        data={"username": u_data["username"], "password": u_data["password"]},
    )
    token = login_r.json()["access_token"]

    with sync_client.websocket_connect("/api/v1/ws") as ws:
        # Авторизуемся первым пакетом
        ws.send_text(json.dumps({"type": "authenticate", "token": token}))
        ack = json.loads(ws.receive_text())
        assert ack["event"] == "connected"

        # Проверяем, что менеджер зарегистрировал подключение
        assert user_id in manager.active_connections

        # Внезапно закрываем сокет со стороны клиента (обрыв связи / закрытие вкладки)
        ws.close()

    # Проверяем, что менеджер корректно очистил соединение из памяти
    assert user_id not in manager.active_connections
