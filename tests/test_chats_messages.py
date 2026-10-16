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
        "/api/v1/chats/direct", json={"recipient_id": 999999999}, headers=user["headers"]
    )
    assert resp.status_code == 404


async def test_chat_list_shows_only_my_chats(client: AsyncClient, create_user, create_direct_chat):
    user1 = await create_user()
    user2 = await create_user()
    outsider = await create_user()
    chat_id = await create_direct_chat(user1, user2)

    resp = await client.get("/api/v1/chats", headers=user1["headers"])
    assert chat_id in [c["id"] for c in resp.json()]

    resp_outsider = await client.get("/api/v1/chats", headers=outsider["headers"])
    assert chat_id not in [c["id"] for c in resp_outsider.json()]


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
