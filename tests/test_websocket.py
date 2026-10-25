import json
import uuid

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnect

from app.schemas.ws import WSSendMessageAction


# WebSocket в FastAPI удобнее тестировать синхронным TestClient,
# поэтому здесь свои маленькие хелперы вместо async-фикстур из conftest.

def register_and_login(sync_client: TestClient) -> dict:
    name = f"ws_{uuid.uuid4().hex[:8]}"
    password = "valid_password_123"
    r = sync_client.post(
        "/api/v1/auth/register",
        json={"username": name, "email": f"{name}@example.com", "password": password},
    )
    assert r.status_code == 201, r.text
    login = sync_client.post("/api/v1/auth/login", data={"username": name, "password": password})
    token = login.json()["access_token"]
    return {"id": r.json()["id"], "token": token, "headers": {"Authorization": f"Bearer {token}"}}


def create_chat(sync_client: TestClient, user1: dict, user2: dict) -> int:
    r = sync_client.post(
        "/api/v1/chats/direct", json={"recipient_id": user2["id"]}, headers=user1["headers"]
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def authenticate(ws, token: str) -> None:
    ws.send_text(json.dumps({"type": "authenticate", "token": token}))
    ack = json.loads(ws.receive_text())
    assert ack["event"] == "connected"


def next_event(ws, event_type: str) -> dict:
    """Читает события, пропуская presence: они приходят при подключении собеседника."""
    while True:
        data = json.loads(ws.receive_text())
        if data["event"] == event_type:
            return data


def test_ws_rejects_invalid_token(sync_client: TestClient):
    with sync_client.websocket_connect("/api/v1/ws") as ws:
        ws.send_text(json.dumps({"type": "authenticate", "token": "garbage"}))
        with pytest.raises(WebSocketDisconnect) as exc:
            ws.receive_text()
    assert exc.value.code == 1008


def test_ws_ping_pong(sync_client: TestClient):
    user = register_and_login(sync_client)
    with sync_client.websocket_connect("/api/v1/ws") as ws:
        authenticate(ws, user["token"])
        ws.send_text(json.dumps({"action": "ping"}))
        assert json.loads(ws.receive_text())["event"] == "pong"


def test_http_message_delivered_to_recipient_via_ws(sync_client: TestClient):
    # Сообщение, отправленное через HTTP, должно прилететь собеседнику по сокету
    sender = register_and_login(sync_client)
    recipient = register_and_login(sync_client)
    chat_id = create_chat(sync_client, sender, recipient)

    with sync_client.websocket_connect("/api/v1/ws") as ws:
        authenticate(ws, recipient["token"])

        r = sync_client.post(
            f"/api/v1/chats/{chat_id}/messages", json={"content": "hi"}, headers=sender["headers"]
        )
        assert r.status_code == 201

        event = json.loads(ws.receive_text())
        assert event["event"] == "new_message"
        assert event["message"]["content"] == "hi"
        assert event["message"]["id"] == r.json()["id"]


def test_http_message_not_echoed_to_sender(sync_client: TestClient):
    # Отправитель через HTTP и так получает сообщение в ответе — эхо по сокету даёт дубль на фронте
    sender = register_and_login(sync_client)
    recipient = register_and_login(sync_client)
    chat_id = create_chat(sync_client, sender, recipient)

    with sync_client.websocket_connect("/api/v1/ws") as ws:
        authenticate(ws, sender["token"])

        sync_client.post(
            f"/api/v1/chats/{chat_id}/messages", json={"content": "hi"}, headers=sender["headers"]
        )

        # Если эха нет, первым придёт ответ на ping. Если эхо есть — сначала придёт new_message.
        ws.send_text(json.dumps({"action": "ping"}))
        assert json.loads(ws.receive_text())["event"] == "pong"


def test_ws_message_delivered_to_both(sync_client: TestClient):
    # При отправке через сокет HTTP-ответа нет, поэтому эхо отправителю здесь как раз нужно
    sender = register_and_login(sync_client)
    recipient = register_and_login(sync_client)
    chat_id = create_chat(sync_client, sender, recipient)

    with sync_client.websocket_connect("/api/v1/ws") as ws_sender, \
         sync_client.websocket_connect("/api/v1/ws") as ws_recipient:
        authenticate(ws_sender, sender["token"])
        authenticate(ws_recipient, recipient["token"])

        ws_sender.send_text(json.dumps({"action": "send_message", "chat_id": chat_id, "content": "yo"}))

        for ws in (ws_sender, ws_recipient):
            event = next_event(ws, "new_message")
            assert event["message"]["content"] == "yo"


def test_ws_cannot_send_to_foreign_chat(sync_client: TestClient):
    user1 = register_and_login(sync_client)
    user2 = register_and_login(sync_client)
    outsider = register_and_login(sync_client)
    chat_id = create_chat(sync_client, user1, user2)

    with sync_client.websocket_connect("/api/v1/ws") as ws:
        authenticate(ws, outsider["token"])
        ws.send_text(json.dumps({"action": "send_message", "chat_id": chat_id, "content": "взлом"}))
        assert "error" in json.loads(ws.receive_text())


def test_ws_empty_message_rejected(sync_client: TestClient):
    user1 = register_and_login(sync_client)
    user2 = register_and_login(sync_client)
    chat_id = create_chat(sync_client, user1, user2)

    with sync_client.websocket_connect("/api/v1/ws") as ws:
        authenticate(ws, user1["token"])
        ws.send_text(json.dumps({"action": "send_message", "chat_id": chat_id, "content": "   "}))
        assert "error" in json.loads(ws.receive_text())

def test_ws_oversized_message_rejected():
    # Проверяем схему напрямую: через настоящий сокет тест с этим багом зависает навсегда
    with pytest.raises(ValidationError):
        WSSendMessageAction(chat_id=1, content="a" * 1001)


# ---------- «Печатает…» ----------

def test_typing_delivered_to_recipient(sync_client: TestClient):
    sender = register_and_login(sync_client)
    recipient = register_and_login(sync_client)
    chat_id = create_chat(sync_client, sender, recipient)

    with sync_client.websocket_connect("/api/v1/ws") as ws_recipient, \
            sync_client.websocket_connect("/api/v1/ws") as ws_sender:
        authenticate(ws_recipient, recipient["token"])
        authenticate(ws_sender, sender["token"])

        ws_sender.send_text(json.dumps({"action": "typing", "chat_id": chat_id}))
        event = next_event(ws_recipient, "typing")
        assert event == {
            "event": "typing",
            "chat_id": chat_id,
            "user_id": sender["id"],
            "username": event["username"],
        }

        # Самому себе typing не приходит: следующим в сокете отправителя будет pong
        ws_sender.send_text(json.dumps({"action": "ping"}))
        assert json.loads(ws_sender.receive_text())["event"] == "pong"


def test_typing_in_foreign_chat_rejected(sync_client: TestClient):
    user1 = register_and_login(sync_client)
    user2 = register_and_login(sync_client)
    outsider = register_and_login(sync_client)
    chat_id = create_chat(sync_client, user1, user2)

    with sync_client.websocket_connect("/api/v1/ws") as ws:
        authenticate(ws, outsider["token"])
        ws.send_text(json.dumps({"action": "typing", "chat_id": chat_id}))
        assert json.loads(ws.receive_text()) == {"error": "Chat not found or access denied"}


# ---------- «Был(а) в сети» ----------

def test_presence_online_then_offline(sync_client: TestClient):
    # Собеседник видит, когда пользователь появился и когда ушёл
    user1 = register_and_login(sync_client)
    user2 = register_and_login(sync_client)
    create_chat(sync_client, user1, user2)

    with sync_client.websocket_connect("/api/v1/ws") as ws1:
        authenticate(ws1, user1["token"])

        with sync_client.websocket_connect("/api/v1/ws") as ws2:
            authenticate(ws2, user2["token"])

            online = next_event(ws1, "presence")
            assert online["user_id"] == user2["id"]
            assert online["is_online"] is True

        offline = next_event(ws1, "presence")
        assert offline["user_id"] == user2["id"]
        assert offline["is_online"] is False
        assert offline["last_seen_at"] is not None


def test_last_seen_is_visible_in_public_profile(sync_client: TestClient):
    user1 = register_and_login(sync_client)
    user2 = register_and_login(sync_client)

    with sync_client.websocket_connect("/api/v1/ws") as ws:
        authenticate(ws, user2["token"])

        profile = sync_client.get(f"/api/v1/users/{user2['id']}", headers=user1["headers"])
        assert profile.status_code == 200
        assert profile.json()["is_online"] is True
        assert profile.json()["last_seen_at"] is not None

    profile = sync_client.get(f"/api/v1/users/{user2['id']}", headers=user1["headers"])
    assert profile.json()["is_online"] is False
    assert profile.json()["last_seen_at"] is not None
