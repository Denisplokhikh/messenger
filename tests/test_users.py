import uuid

from httpx import AsyncClient


# ---------- Обновление профиля (PATCH /users/me) ----------

async def test_update_only_bio(client: AsyncClient, create_user):
    # Регрессия: когда username в UserUpdate был обязательным, этот запрос давал 422
    user = await create_user()
    resp = await client.patch("/api/v1/users/me", json={"bio": "hello"}, headers=user["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["bio"] == "hello"
    # Остальные поля не должны измениться
    assert body["username"] == user["username"]


async def test_update_username_too_short(client: AsyncClient, create_user):
    # Ограничения на username должны работать и при обновлении, а не только при регистрации
    user = await create_user()
    resp = await client.patch("/api/v1/users/me", json={"username": "ab"}, headers=user["headers"])
    assert resp.status_code == 422


async def test_update_username_taken(client: AsyncClient, create_user):
    user1 = await create_user()
    user2 = await create_user()
    resp = await client.patch(
        "/api/v1/users/me", json={"username": user2["username"]}, headers=user1["headers"]
    )
    assert resp.status_code == 400


async def test_update_username_success(client: AsyncClient, create_user):
    user = await create_user()
    new_name = user["username"] + "x"
    resp = await client.patch("/api/v1/users/me", json={"username": new_name}, headers=user["headers"])
    assert resp.status_code == 200
    assert resp.json()["username"] == new_name


# ---------- Смена пароля ----------

async def test_change_password_wrong_current(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.post(
        "/api/v1/users/me/change-password",
        json={"current_password": "not_my_password", "new_password": "new_secret_123"},
        headers=user["headers"],
    )
    assert resp.status_code == 400


async def test_change_password_new_too_short(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.post(
        "/api/v1/users/me/change-password",
        json={"current_password": user["password"], "new_password": "1"},
        headers=user["headers"],
    )
    assert resp.status_code == 422


async def test_change_password_then_login(client: AsyncClient, create_user):
    # Полный сценарий: сменили пароль → старый не работает, новый работает
    user = await create_user()
    resp = await client.post(
        "/api/v1/users/me/change-password",
        json={"current_password": user["password"], "new_password": "new_secret_123"},
        headers=user["headers"],
    )
    assert resp.status_code == 200

    old_login = await client.post(
        "/api/v1/auth/login", data={"username": user["username"], "password": user["password"]}
    )
    assert old_login.status_code == 401

    new_login = await client.post(
        "/api/v1/auth/login", data={"username": user["username"], "password": "new_secret_123"}
    )
    assert new_login.status_code == 200


# ---------- Публичные данные ----------

async def test_public_profile_hides_email(client: AsyncClient, create_user):
    user1 = await create_user()
    user2 = await create_user()
    resp = await client.get(f"/api/v1/users/{user2['id']}", headers=user1["headers"])
    assert resp.status_code == 200
    assert "email" not in resp.json()


async def test_search_excludes_self_and_hides_email(client: AsyncClient, create_user):
    user1 = await create_user()
    user2 = await create_user()
    resp = await client.get(
        "/api/v1/users/search", params={"query": user2["username"]}, headers=user1["headers"]
    )
    assert resp.status_code == 200
    results = resp.json()
    assert [u["id"] for u in results] == [user2["id"]]
    assert "email" not in results[0]

    # Себя в поиске быть не должно
    resp_self = await client.get(
        "/api/v1/users/search", params={"query": user1["username"]}, headers=user1["headers"]
    )
    assert user1["id"] not in [u["id"] for u in resp_self.json()]


async def test_get_unknown_user(client: AsyncClient, create_user):
    user = await create_user()
    resp = await client.get(f"/api/v1/users/{uuid.uuid4()}", headers=user["headers"])
    assert resp.status_code == 404
