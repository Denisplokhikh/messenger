import io

from httpx import AsyncClient
from PIL import Image

from app.services.avatar_service import MAX_AVATAR_BYTES

URL = "/api/v1/users/me/avatar"


def make_png(size=(400, 300)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, "red").save(buf, format="PNG")
    return buf.getvalue()


async def upload(client: AsyncClient, user: dict, data: bytes, name="avatar.png"):
    return await client.post(URL, files={"file": (name, data, "image/png")}, headers=user["headers"])


async def test_upload_avatar(client: AsyncClient, create_user):
    user = await create_user()
    resp = await upload(client, user, make_png())
    assert resp.status_code == 200, resp.text
    avatar_url = resp.json()["avatar_url"]
    assert avatar_url.startswith("/media/avatars/")

    # Файл раздаётся и перекодирован в квадратный WebP, даже если прислали прямоугольный PNG
    file_resp = await client.get(avatar_url)
    assert file_resp.status_code == 200
    with Image.open(io.BytesIO(file_resp.content)) as img:
        assert img.format == "WEBP"
        assert img.width == img.height

    me = await client.get("/api/v1/users/me", headers=user["headers"])
    assert me.json()["avatar_url"] == avatar_url


async def test_replacing_avatar_deletes_old_file(client: AsyncClient, create_user):
    user = await create_user()
    first = (await upload(client, user, make_png())).json()["avatar_url"]
    second = (await upload(client, user, make_png())).json()["avatar_url"]

    assert first != second
    assert (await client.get(first)).status_code == 404
    assert (await client.get(second)).status_code == 200


async def test_delete_avatar(client: AsyncClient, create_user):
    user = await create_user()
    avatar_url = (await upload(client, user, make_png())).json()["avatar_url"]

    resp = await client.delete(URL, headers=user["headers"])
    assert resp.status_code == 200
    assert resp.json()["avatar_url"] is None
    assert (await client.get(avatar_url)).status_code == 404


async def test_upload_not_an_image(client: AsyncClient, create_user):
    # Расширение и content-type подставляет клиент — им не верим, проверяем содержимое
    user = await create_user()
    resp = await upload(client, user, b"definitely not a png")
    assert resp.status_code == 400


async def test_upload_too_large(client: AsyncClient, create_user):
    user = await create_user()
    resp = await upload(client, user, b"0" * (MAX_AVATAR_BYTES + 1))
    assert resp.status_code == 413


async def test_avatar_url_cannot_be_set_directly(client: AsyncClient, create_user):
    # Иначе можно поставить ссылку на свой сервер и собирать IP всех, кто видит аватар
    user = await create_user()
    resp = await client.patch(
        "/api/v1/users/me", json={"avatar_url": "https://evil.example/x.png"}, headers=user["headers"]
    )
    assert resp.status_code == 200
    assert resp.json()["avatar_url"] is None
