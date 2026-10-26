import uuid

from sqlalchemy import text as sql_text
from httpx import AsyncClient


# ---------- Чаты ----------

async def test_direct_chat_is_reused(client: AsyncClient, create_user, create_direct_chat):
    # Повторное создание чата с тем же человеком (с любой стороны) должно вернуть тот же чат
    user1 = await create_user()
    user2 = await create_user()
    chat_a = await create_direct_chat(user1, user2)
    chat_b = await create_direct_chat(user1, user2)
    chat_c = await create_direct_chat(user2, user1)
    assert chat_a == chat_b == chat_c


async def test_direct_chat_with_unknown_user(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.post(
        "/api/v1/chats/direct", json={"recipient_id": str(uuid.uuid4())}, headers=user["headers"]
    )
    assert resp.status_code == 404


async def test_ids_are_uuids(client: AsyncClient, create_user, create_direct_chat):
    # Наружу не должны утекать порядковые id: пользователи и чаты отдаются по uuid
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    uuid.UUID(user1["id"])
    uuid.UUID(chat_id)

    send = await client.post(
        f"/api/v1/chats/{chat_id}/messages", json={"content": "hi"}, headers=user1["headers"]
    )
    assert send.json()["chat_id"] == chat_id
    assert send.json()["sender_id"] == user1["id"]


async def test_chat_by_numeric_id_rejected(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.get("/api/v1/chats/1/messages", headers=user["headers"])
    assert resp.status_code == 422


async def test_group_chat_with_unknown_participant(client: AsyncClient, create_user):
    user1 = await create_user()
    user2 = await create_user()
    resp = await client.post(
        "/api/v1/chats/group",
        json={"name": "g", "participant_ids": [user2["id"], str(uuid.uuid4())]},
        headers=user1["headers"],
    )
    assert resp.status_code == 404


async def test_group_chat_participants(client: AsyncClient, create_user):
    user1 = await create_user()
    user2 = await create_user()
    user3 = await create_user()
    resp = await client.post(
        "/api/v1/chats/group",
        json={"name": "g", "participant_ids": [user2["id"], user3["id"]]},
        headers=user1["headers"],
    )
    assert resp.status_code == 200, resp.text
    members = {p["user_id"] for p in resp.json()["participants"]}
    assert members == {user1["id"], user2["id"], user3["id"]}


async def test_chat_list_shows_only_my_chats(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    outsider = await create_user()
    chat_id = await create_direct_chat(user1, user2)

    resp = await client.get("/api/v1/chats", headers=user1["headers"])
    assert chat_id in [c["id"] for c in resp.json()]

    resp_outsider = await client.get("/api/v1/chats", headers=outsider["headers"])
    assert chat_id not in [c["id"] for c in resp_outsider.json()]


async def test_chat_list_has_last_message(client: AsyncClient, create_user, create_direct_chat):
    # Превью в списке чатов должно приходить с сервера, а не только из WebSocket
    user1 = await create_user()
    user2 = await create_user()
    user3 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    other_chat_id = await create_direct_chat(user1, user3)

    for text in ["first", "second"]:
        await client.post(
            f"/api/v1/chats/{chat_id}/messages", json={"content": text}, headers=user1["headers"]
        )
    await client.post(
        f"/api/v1/chats/{other_chat_id}/messages", json={"content": "other"}, headers=user1["headers"]
    )

    resp = await client.get("/api/v1/chats", headers=user1["headers"])
    assert resp.status_code == 200
    chats = {c["id"]: c for c in resp.json()}
    # У каждого чата своё последнее сообщение, они не перепутаны между чатами
    assert chats[chat_id]["last_message"]["content"] == "second"
    assert chats[other_chat_id]["last_message"]["content"] == "other"


async def test_chat_list_without_messages(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)

    resp = await client.get("/api/v1/chats", headers=user1["headers"])
    assert resp.status_code == 200
    chats = {c["id"]: c for c in resp.json()}
    assert chats[chat_id]["last_message"] is None


# ---------- Сообщения ----------

async def test_send_and_read_message(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)

    send = await client.post(
        f"/api/v1/chats/{chat_id}/messages", json={"content": "привет"}, headers=user1["headers"]
    )
    assert send.status_code == 201
    assert send.json()["sender_id"] == user1["id"]

    # Собеседник видит сообщение в истории
    history = await client.get(f"/api/v1/chats/{chat_id}/messages", headers=user2["headers"])
    assert history.status_code == 200
    assert [m["content"] for m in history.json()] == ["привет"]


async def test_empty_message_rejected(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    resp = await client.post(
        f"/api/v1/chats/{chat_id}/messages", json={"content": ""}, headers=user1["headers"]
    )
    assert resp.status_code == 422


async def test_outsider_cannot_read_chat(client: AsyncClient, create_user, create_direct_chat):
    # Самое важное с точки зрения безопасности: чужую переписку читать нельзя
    user1 = await create_user()
    user2 = await create_user()
    outsider = await create_user()
    chat_id = await create_direct_chat(user1, user2)

    resp = await client.get(f"/api/v1/chats/{chat_id}/messages", headers=outsider["headers"])
    assert resp.status_code == 404


async def test_outsider_cannot_send_to_chat(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    outsider = await create_user()
    chat_id = await create_direct_chat(user1, user2)

    resp = await client.post(
        f"/api/v1/chats/{chat_id}/messages", json={"content": "взлом"}, headers=outsider["headers"]
    )
    assert resp.status_code == 404

    # И сообщение действительно не сохранилось
    history = await client.get(f"/api/v1/chats/{chat_id}/messages", headers=user1["headers"])
    assert history.json() == []


async def test_messages_pagination_order(client: AsyncClient, create_user, create_direct_chat):
    # История отдаётся по возрастанию времени; курсор before_id — id самого старого из уже полученных
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)

    for text in ["1", "2", "3", "4"]:
        await client.post(
            f"/api/v1/chats/{chat_id}/messages", json={"content": text}, headers=user1["headers"]
        )

    url = f"/api/v1/chats/{chat_id}/messages"
    latest = await client.get(url, params={"limit": 2}, headers=user1["headers"])
    assert [m["content"] for m in latest.json()] == ["3", "4"]

    cursor = latest.json()[0]["id"]
    older = await client.get(url, params={"limit": 2, "before_id": cursor}, headers=user1["headers"])
    assert [m["content"] for m in older.json()] == ["1", "2"]

    # Старше первого сообщения ничего нет — история закончилась
    cursor = older.json()[0]["id"]
    empty = await client.get(url, params={"limit": 2, "before_id": cursor}, headers=user1["headers"])
    assert empty.json() == []


async def test_message_content_encrypted_in_db(client: AsyncClient, create_user, create_direct_chat, db_session):
    # Через API текст обычный, а в самой таблице должен лежать шифротекст
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)

    send = await client.post(
        f"/api/v1/chats/{chat_id}/messages", json={"content": "секретное сообщение"}, headers=user1["headers"]
    )
    assert send.json()["content"] == "секретное сообщение"

    raw = await db_session.execute(
        sql_text("SELECT content FROM messages WHERE id = :id"), {"id": send.json()["id"]}
    )
    stored = raw.scalar_one()
    assert "секретное" not in stored
    assert stored.startswith("gAAAA")  # так начинается любой токен Fernet


# ---------- Ответы, редактирование, удаление ----------

async def test_reply_to_message(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    url = f"/api/v1/chats/{chat_id}/messages"

    original = await client.post(url, json={"content": "во сколько встречаемся?"}, headers=user2["headers"])
    reply = await client.post(
        url,
        json={"content": "в семь", "reply_to_id": original.json()["id"]},
        headers=user1["headers"],
    )
    assert reply.status_code == 201, reply.text
    quote = reply.json()["reply_to"]
    assert quote["id"] == original.json()["id"]
    assert quote["content"] == "во сколько встречаемся?"
    assert quote["sender_id"] == user2["id"]
    assert quote["sender_username"] == user2["username"]

    # Цитата приходит и в истории, а не только в ответе на отправку
    history = (await client.get(url, headers=user2["headers"])).json()
    assert history[-1]["reply_to"]["content"] == "во сколько встречаемся?"


async def test_reply_to_message_from_another_chat_rejected(
    client: AsyncClient, create_user, create_direct_chat
):
    user1 = await create_user()
    user2 = await create_user()
    user3 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    other_chat_id = await create_direct_chat(user1, user3)

    foreign = await client.post(
        f"/api/v1/chats/{other_chat_id}/messages", json={"content": "чужой чат"}, headers=user1["headers"]
    )
    resp = await client.post(
        f"/api/v1/chats/{chat_id}/messages",
        json={"content": "ответ", "reply_to_id": foreign.json()["id"]},
        headers=user1["headers"],
    )
    # Ссылаться на сообщение из другого чата нельзя: иначе можно вытащить его текст
    assert resp.status_code == 400


async def test_edit_own_message(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    url = f"/api/v1/chats/{chat_id}/messages"

    sent = await client.post(url, json={"content": "черновик"}, headers=user1["headers"])
    assert sent.json()["edited_at"] is None

    edited = await client.patch(
        f"{url}/{sent.json()['id']}", json={"content": "финальный текст"}, headers=user1["headers"]
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["content"] == "финальный текст"
    assert edited.json()["edited_at"] is not None
    # Время отправки не должно съезжать: сообщение остаётся на своём месте в ленте
    assert edited.json()["created_at"] == sent.json()["created_at"]

    history = (await client.get(url, headers=user2["headers"])).json()
    assert history[0]["content"] == "финальный текст"


async def test_edit_foreign_message_forbidden(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    url = f"/api/v1/chats/{chat_id}/messages"
    sent = await client.post(url, json={"content": "моё"}, headers=user1["headers"])

    resp = await client.patch(
        f"{url}/{sent.json()['id']}", json={"content": "чужое"}, headers=user2["headers"]
    )
    assert resp.status_code == 403

    history = (await client.get(url, headers=user1["headers"])).json()
    assert history[0]["content"] == "моё"


async def test_edit_message_from_another_chat_not_found(
    client: AsyncClient, create_user, create_direct_chat
):
    user1 = await create_user()
    user2 = await create_user()
    user3 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    other_chat_id = await create_direct_chat(user1, user3)

    foreign = await client.post(
        f"/api/v1/chats/{other_chat_id}/messages", json={"content": "в другом чате"}, headers=user1["headers"]
    )
    resp = await client.patch(
        f"/api/v1/chats/{chat_id}/messages/{foreign.json()['id']}",
        json={"content": "подмена"},
        headers=user1["headers"],
    )
    # Сообщение существует, но не в этом чате — снаружи это неотличимо от «нет такого»
    assert resp.status_code == 404


async def test_edit_empty_content_rejected(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    url = f"/api/v1/chats/{chat_id}/messages"
    sent = await client.post(url, json={"content": "текст"}, headers=user1["headers"])

    resp = await client.patch(
        f"{url}/{sent.json()['id']}", json={"content": "   "}, headers=user1["headers"]
    )
    assert resp.status_code == 422


async def test_delete_own_message(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    url = f"/api/v1/chats/{chat_id}/messages"

    sent = await client.post(url, json={"content": "удали меня"}, headers=user1["headers"])
    resp = await client.delete(f"{url}/{sent.json()['id']}", headers=user1["headers"])
    assert resp.status_code == 204

    # У собеседника сообщение остаётся в ленте, но без текста — как плашка «удалено»
    history = (await client.get(url, headers=user2["headers"])).json()
    assert len(history) == 1
    assert history[0]["content"] is None
    assert history[0]["deleted_at"] is not None


async def test_deleted_message_text_is_erased_from_db(
    client: AsyncClient, create_user, create_direct_chat, db_session
):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    url = f"/api/v1/chats/{chat_id}/messages"

    sent = await client.post(url, json={"content": "сотри это"}, headers=user1["headers"])
    await client.delete(f"{url}/{sent.json()['id']}", headers=user1["headers"])

    # «Удалено» должно означать «стёрто», а не «спрятано»: в колонке не остаётся шифротекста
    raw = await db_session.execute(
        sql_text("SELECT content, deleted_at FROM messages WHERE id = :id"),
        {"id": sent.json()["id"]},
    )
    content, deleted_at = raw.one()
    assert content is None
    assert deleted_at is not None


async def test_delete_foreign_message_forbidden(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    url = f"/api/v1/chats/{chat_id}/messages"
    sent = await client.post(url, json={"content": "не трогать"}, headers=user1["headers"])

    resp = await client.delete(f"{url}/{sent.json()['id']}", headers=user2["headers"])
    assert resp.status_code == 403

    history = (await client.get(url, headers=user2["headers"])).json()
    assert history[0]["content"] == "не трогать"


async def test_delete_message_is_idempotent(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    url = f"/api/v1/chats/{chat_id}/messages"
    sent = await client.post(url, json={"content": "дважды"}, headers=user1["headers"])

    first = await client.delete(f"{url}/{sent.json()['id']}", headers=user1["headers"])
    second = await client.delete(f"{url}/{sent.json()['id']}", headers=user1["headers"])
    # Клиент мог не получить ответ и повторить запрос — это не ошибка
    assert first.status_code == second.status_code == 204


async def test_cannot_edit_deleted_message(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)
    url = f"/api/v1/chats/{chat_id}/messages"
    sent = await client.post(url, json={"content": "было"}, headers=user1["headers"])
    await client.delete(f"{url}/{sent.json()['id']}", headers=user1["headers"])

    resp = await client.patch(
        f"{url}/{sent.json()['id']}", json={"content": "станет"}, headers=user1["headers"]
    )
    assert resp.status_code == 400


async def test_delete_message_removes_attachment_files(
    client: AsyncClient, create_user, create_direct_chat, db_session
):
    from app.models.attachment import Attachment
    from app.services import attachment_storage as storage

    user1 = await create_user()
    user2 = await create_user()
    chat_id = await create_direct_chat(user1, user2)

    upload = await client.post(
        "/api/v1/attachments",
        files={"file": ("notes.txt", b"secret bytes", "text/plain")},
        headers=user1["headers"],
    )
    assert upload.status_code == 201, upload.text
    attachment_uuid = upload.json()["id"]

    url = f"/api/v1/chats/{chat_id}/messages"
    sent = await client.post(
        url, json={"attachment_ids": [attachment_uuid]}, headers=user1["headers"]
    )
    assert sent.status_code == 201, sent.text

    row = (
        await db_session.execute(
            sql_text("SELECT storage_key FROM attachments WHERE uuid = :uuid"),
            {"uuid": attachment_uuid},
        )
    ).scalar_one()
    path = storage.path_for(row)
    assert path.exists()

    await client.delete(f"{url}/{sent.json()['id']}", headers=user1["headers"])

    # Ни строки в базе, ни файла на диске: иначе «удалённое» вложение можно было бы скачать по ссылке
    left = (
        await db_session.execute(
            sql_text("SELECT count(*) FROM attachments WHERE uuid = :uuid"),
            {"uuid": attachment_uuid},
        )
    ).scalar_one()
    assert left == 0
    assert not path.exists()

