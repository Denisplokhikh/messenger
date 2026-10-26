import asyncio
import datetime
import io
import json
import os
import time
import uuid
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from httpx import AsyncClient
from PIL import Image
from sqlalchemy import select, update

from app.config import settings
from app.models.attachment import Attachment
from app.services import attachment_storage as storage
from app.services.attachment_cleanup import UNSENT_TTL, delete_unsent_attachments
from app.utils.security import sign_attachment


def _png(size=(600, 300)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, "red").save(buf, format="PNG")
    return buf.getvalue()


def _next_event(ws, event_type: str) -> dict:
    """Читает события до нужного, пропуская presence: он приходит после подключения собеседника."""
    while True:
        data = json.loads(ws.receive_text())
        if data["event"] == event_type:
            return data


def _authenticate(ws, token: str) -> None:
    ws.send_text(json.dumps({"type": "authenticate", "token": token}))
    _next_event(ws, "connected")


async def _upload(client: AsyncClient, user: dict, name: str, data: bytes):
    return await client.post(
        "/api/v1/attachments",
        files={"file": (name, data, "application/octet-stream")},
        headers=user["headers"],
    )


async def _upload_ok(client: AsyncClient, user: dict, name: str = "notes.txt", data: bytes = b"hello") -> dict:
    resp = await _upload(client, user, name, data)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _send(client: AsyncClient, user: dict, chat_id: str, **body):
    return await client.post(f"/api/v1/chats/{chat_id}/messages", json=body, headers=user["headers"])


def _with_query(url: str, **params) -> str:
    """Та же ссылка, но с подменёнными параметрами exp/sig."""
    parsed = urlparse(url)
    query = {k: v[0] for k, v in parse_qs(parsed.query).items()} | params
    return parsed.path + "?" + "&".join(f"{k}={v}" for k, v in query.items())


# ---------- Загрузка и скачивание ----------

async def test_image_is_reencoded_and_both_variants_download(client: AsyncClient, create_user):
    user = await create_user()
    att = await _upload_ok(client, user, "photo.png", _png())

    assert att["kind"] == "image"
    assert att["mime_type"] == "image/webp"
    assert (att["width"], att["height"]) == (600, 300)
    assert att["thumb_url"] is not None
    assert "storage_key" not in att and "has_thumbnail" not in att

    # Ссылки работают без Authorization — как у <img src>
    full = await client.get(att["url"])
    assert full.status_code == 200
    assert full.headers["content-type"] == "image/webp"
    assert full.headers["content-length"] == str(att["size"])
    assert full.headers["x-content-type-options"] == "nosniff"
    assert "photo.webp" in full.headers["content-disposition"]
    assert Image.open(io.BytesIO(full.content)).size == (600, 300)

    thumb = await client.get(att["thumb_url"])
    assert thumb.status_code == 200
    assert max(Image.open(io.BytesIO(thumb.content)).size) == 400


async def test_plain_file_roundtrip(client: AsyncClient, create_user):
    user = await create_user()
    # Несколько кусков хранилища плюс хвост: проверяем потоковую запись и отдачу целиком
    data = os.urandom(3 * storage.CHUNK_SIZE + 5)
    att = await _upload_ok(client, user, "отчёт.bin", data)

    assert att["kind"] == "file"
    assert att["size"] == len(data)
    assert att["thumb_url"] is None

    resp = await client.get(att["url"])
    assert resp.status_code == 200
    assert resp.content == data
    assert resp.headers["content-disposition"].startswith("attachment;")


async def test_empty_file_rejected(client: AsyncClient, create_user):
    user = await create_user()
    resp = await _upload(client, user, "empty.txt", b"")
    assert resp.status_code == 400


async def test_too_large_file_rejected(client: AsyncClient, create_user, monkeypatch):
    user = await create_user()
    monkeypatch.setattr(settings, "MAX_ATTACHMENT_BYTES", 10)
    resp = await _upload(client, user, "big.txt", b"x" * 11)
    assert resp.status_code == 413


async def test_upload_requires_auth(client: AsyncClient):
    resp = await client.post("/api/v1/attachments", files={"file": ("a.txt", b"hi", "text/plain")})
    assert resp.status_code == 401


async def test_tampered_or_expired_links_rejected(client: AsyncClient, create_user):
    user = await create_user()
    att = await _upload_ok(client, user, "photo.png", _png())
    sig = parse_qs(urlparse(att["url"]).query)["sig"][0]

    # Подпись от другого файла / другого варианта / другого срока не подходит
    bad_sig = ("0" if sig[0] != "0" else "1") + sig[1:]
    assert (await client.get(_with_query(att["url"], sig=bad_sig))).status_code == 403
    assert (await client.get(att["url"].replace("/full?", "/thumb?"))).status_code == 403
    exp = int(parse_qs(urlparse(att["url"]).query)["exp"][0])
    assert (await client.get(_with_query(att["url"], exp=exp + 1))).status_code == 403

    # Просроченная, но правильно подписанная ссылка
    past = int(time.time()) - 1
    expired = _with_query(att["url"], exp=past, sig=sign_attachment(uuid.UUID(att["id"]), "full", past))
    assert (await client.get(expired)).status_code == 403

    # Подпись не из hex-символов — 422 от валидации, а не 500 из compare_digest
    assert (await client.get(_with_query(att["url"], sig="я" * 64))).status_code == 422


async def test_thumb_of_plain_file_not_found(client: AsyncClient, create_user):
    user = await create_user()
    att = await _upload_ok(client, user)
    exp = int(time.time()) + 3600
    sig = sign_attachment(uuid.UUID(att["id"]), "thumb", exp)
    resp = await client.get(f"/api/v1/attachments/{att['id']}/thumb?exp={exp}&sig={sig}")
    assert resp.status_code == 404


# ---------- Отправка с вложениями ----------

async def test_message_with_attachments_visible_everywhere(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    a1 = await _upload_ok(client, user1, "photo.png", _png())
    a2 = await _upload_ok(client, user1, "notes.txt", b"hello")

    resp = await _send(client, user1, chat_id, content="смотри", attachment_ids=[a1["id"], a2["id"]])
    assert resp.status_code == 201, resp.text
    assert [a["id"] for a in resp.json()["attachments"]] == [a1["id"], a2["id"]]

    # Собеседник видит вложения в истории и может их открыть
    history = (await client.get(f"/api/v1/chats/{chat_id}/messages", headers=user2["headers"])).json()
    received = history[-1]["attachments"]
    assert [a["id"] for a in received] == [a1["id"], a2["id"]]
    assert (await client.get(received[1]["url"])).content == b"hello"

    # И в превью последнего сообщения в списке чатов
    chats = (await client.get("/api/v1/chats", headers=user2["headers"])).json()
    chat = next(c for c in chats if c["id"] == chat_id)
    assert len(chat["last_message"]["attachments"]) == 2


async def test_attachment_only_message(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    att = await _upload_ok(client, user1)

    # Подпись из одних пробелов — то же, что без подписи
    resp = await _send(client, user1, chat_id, content="   ", attachment_ids=[att["id"]])
    assert resp.status_code == 201, resp.text
    assert resp.json()["content"] is None
    assert len(resp.json()["attachments"]) == 1


async def test_whitespace_only_message_rejected(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    assert (await _send(client, user1, chat_id, content="   ")).status_code == 422
    assert (await _send(client, user1, chat_id, attachment_ids=[])).status_code == 422


async def test_cannot_attach_someone_elses_file(client: AsyncClient, create_user, create_direct_chat):
    owner = await create_user()
    attacker = await create_user()
    chat_id = await create_direct_chat(attacker, owner)
    att = await _upload_ok(client, owner, "secret.txt", b"secret")

    resp = await _send(client, attacker, chat_id, attachment_ids=[att["id"]])
    assert resp.status_code == 400


async def test_cannot_reuse_sent_attachment(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    att = await _upload_ok(client, user1)

    assert (await _send(client, user1, chat_id, attachment_ids=[att["id"]])).status_code == 201
    assert (await _send(client, user1, chat_id, attachment_ids=[att["id"]])).status_code == 400


async def test_concurrent_sends_claim_attachment_once(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    att = await _upload_ok(client, user1)

    responses = await asyncio.gather(
        *(_send(client, user1, chat_id, attachment_ids=[att["id"]]) for _ in range(2))
    )
    assert sorted(r.status_code for r in responses) == [201, 400]


async def test_failed_send_leaves_attachments_unsent(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    own = await _upload_ok(client, user1)
    foreign = await _upload_ok(client, user2)

    # Одно чужое вложение — отказ целиком, своё не должно «прилипнуть» к несостоявшемуся сообщению
    assert (await _send(client, user1, chat_id, attachment_ids=[own["id"], foreign["id"]])).status_code == 400
    assert (await _send(client, user1, chat_id, attachment_ids=[own["id"]])).status_code == 201


async def test_too_many_attachments_rejected(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    ids = [str(uuid.uuid4()) for _ in range(settings.MAX_ATTACHMENTS_PER_MESSAGE + 1)]
    assert (await _send(client, user1, chat_id, attachment_ids=ids)).status_code == 422


def test_ws_message_with_attachment_delivered(sync_client: TestClient):
    users = []
    for _ in range(2):
        name = f"wsatt_{uuid.uuid4().hex[:8]}"
        r = sync_client.post(
            "/api/v1/auth/register",
            json={"username": name, "email": f"{name}@example.com", "password": "valid_password_123"},
        )
        token = sync_client.post(
            "/api/v1/auth/login", data={"username": name, "password": "valid_password_123"}
        ).json()["access_token"]
        users.append({"id": r.json()["id"], "token": token, "headers": {"Authorization": f"Bearer {token}"}})
    sender, recipient = users
    chat_id = sync_client.post(
        "/api/v1/chats/direct", json={"recipient_id": recipient["id"]}, headers=sender["headers"]
    ).json()["id"]
    att = sync_client.post(
        "/api/v1/attachments", files={"file": ("a.txt", b"hi", "text/plain")}, headers=sender["headers"]
    ).json()

    with sync_client.websocket_connect("/api/v1/ws") as ws_s, sync_client.websocket_connect("/api/v1/ws") as ws_r:
        for ws, user in ((ws_s, sender), (ws_r, recipient)):
            _authenticate(ws, user["token"])

        ws_s.send_text(json.dumps({"action": "send_message", "chat_id": chat_id, "attachment_ids": [att["id"]]}))
        for ws in (ws_s, ws_r):
            message = _next_event(ws, "new_message")["message"]
            assert message["content"] is None
            assert [a["id"] for a in message["attachments"]] == [att["id"]]
            assert message["attachments"][0]["url"].startswith(f"/api/v1/attachments/{att['id']}/full?")


# ---------- Очистка ----------

async def test_cleanup_deletes_only_old_unsent(client: AsyncClient, create_user, create_direct_chat, db_session):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    old_unsent = await _upload_ok(client, user1, "photo.png", _png())
    old_sent = await _upload_ok(client, user1)
    fresh_unsent = await _upload_ok(client, user1)
    assert (await _send(client, user1, chat_id, attachment_ids=[old_sent["id"]])).status_code == 201

    old = datetime.datetime.now(datetime.timezone.utc) - UNSENT_TTL - datetime.timedelta(minutes=1)
    await db_session.execute(
        update(Attachment)
        .where(Attachment.uuid.in_([uuid.UUID(old_unsent["id"]), uuid.UUID(old_sent["id"])]))
        .values(created_at=old)
    )
    await db_session.commit()
    old_key = (
        await db_session.execute(select(Attachment.storage_key).where(Attachment.uuid == uuid.UUID(old_unsent["id"])))
    ).scalar_one()

    assert await delete_unsent_attachments() >= 1

    remaining = set(
        (await db_session.execute(
            select(Attachment.uuid).where(
                Attachment.uuid.in_([uuid.UUID(a["id"]) for a in (old_unsent, old_sent, fresh_unsent)])
            )
        )).scalars().all()
    )
    assert remaining == {uuid.UUID(old_sent["id"]), uuid.UUID(fresh_unsent["id"])}
    assert not storage.path_for(old_key).exists()
    assert not storage.path_for(old_key, thumb=True).exists()
    assert (await client.get(old_unsent["url"])).status_code == 404
