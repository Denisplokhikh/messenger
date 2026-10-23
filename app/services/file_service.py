import io
import os
import re
import uuid
from dataclasses import dataclass
from pathlib import Path

import filetype
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings
from app.utils.security import decrypt_bytes, encrypt_bytes

# Картинки, которые Pillow пережимает в WebP и показывает прямо в чате.
# SVG сюда не входит: это XML, внутри может быть <script>, поэтому он только скачивается.
# GIF пока тоже: при пережатии анимация теряется, остаётся первый кадр
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
DEFAULT_MIME = "application/octet-stream"

IMAGE_MAX_SIDE = 2560
THUMB_MAX_SIDE = 400
# Защита от «декомпрессионных бомб», как у аватарок
MAX_IMAGE_PIXELS = 40_000_000

# Ключ генерирует сервер (new_storage_key), но проверяем всё равно: путь к файлу строится из него,
# и «../» или чужое имя в ключе означали бы выход за пределы ATTACHMENTS_DIR
STORAGE_KEY_RE = re.compile(r"[0-9a-f]{32}(_thumb)?")

MAX_FILE_NAME_LENGTH = 255
DEFAULT_FILE_NAME = "file"
# Управляющие символы и Unicode-символы смены направления текста (U+202A–U+202E, U+2066–U+2069).
# Последними подделывают расширение: "invoice‮fdp.exe" отображается как "invoiceexe.pdf"


UNSAFE_NAME_CHARS_RE = re.compile(r"[\x00-\x1f\x7f‪-‮⁦-⁩]")


def detect_kind(data: bytes) -> tuple[str, str]:
    """Определяет вид вложения и mime-тип по содержимому файла: ("image" | "file", mime).

    Content-Type из запроса присылает клиент, поэтому ему не верим, смотрим на первые байты.
    """
    # filetype хватает заголовка файла, весь файл ему передавать незачем
    guess = filetype.guess(data[:261])
    mime = guess.mime if guess else DEFAULT_MIME
    kind = "image" if mime in IMAGE_MIMES else "file"
    return kind, mime


@dataclass
class ProcessedImage:
    full: bytes  # WebP, не больше IMAGE_MAX_SIDE по длинной стороне
    thumb: bytes  # WebP-превью для ленты чата
    width: int  # Размеры full: по ним фронтенд заранее резервирует место под картинку
    height: int


def process_image(data: bytes) -> ProcessedImage:
    """Пережимает картинку в WebP и делает превью. Не картинка или битый файл — ValueError.

    Перекодирование выкидывает EXIF (геолокацию и т.п.) и всё постороннее, что могли спрятать в файл.
    Синхронная и грузит процессор — из async-кода вызывать через run_in_threadpool.
    """
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.width * img.height > MAX_IMAGE_PIXELS:
                raise ValueError("too many pixels")
            # Фото с телефона часто повёрнуты через EXIF, а не сами пиксели
            img = ImageOps.exif_transpose(img)
            # Альфа-канал нужен только картинкам с прозрачностью, фото без него весят меньше
            img = img.convert("RGBA" if img.has_transparency_data else "RGB")

            # thumbnail сохраняет пропорции и только уменьшает: маленькие картинки не растягиваются
            img.thumbnail((IMAGE_MAX_SIDE, IMAGE_MAX_SIDE), Image.Resampling.LANCZOS)
            full = io.BytesIO()
            img.save(full, format="WEBP", quality=85)

            thumb_img = img.copy()
            thumb_img.thumbnail((THUMB_MAX_SIDE, THUMB_MAX_SIDE), Image.Resampling.LANCZOS)
            thumb = io.BytesIO()
            thumb_img.save(thumb, format="WEBP", quality=75)

            return ProcessedImage(
                full=full.getvalue(), thumb=thumb.getvalue(), width=img.width, height=img.height
            )
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ValueError("not an image") from e


# ---------- Хранение на диске ----------
# Все функции синхронные и работают с диском — из async-кода вызывать через run_in_threadpool.

def new_storage_key() -> str:
    """Имя файла на диске. Никак не связано с исходным именем, поэтому ничего о файле не выдаёт."""
    return uuid.uuid4().hex


def _blob_path(key: str) -> Path:
    if not STORAGE_KEY_RE.fullmatch(key):
        raise ValueError(f"invalid storage key: {key!r}")
    return settings.ATTACHMENTS_DIR / key


def save_blob(key: str, data: bytes) -> None:
    """Шифрует и записывает файл атомарно: либо он появится целиком, либо не появится вовсе."""
    path = _blob_path(key)
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.write_bytes(encrypt_bytes(data))
        # Переименование в пределах одной папки — одна операция, прервать её посередине нельзя.
        # os.replace, а не os.rename: на Windows rename падает, если файл с таким именем уже есть
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def load_blob(key: str) -> bytes:
    """Читает и расшифровывает файл. Нет файла — FileNotFoundError, битый или чужой ключ — InvalidToken."""
    return decrypt_bytes(_blob_path(key).read_bytes())


def delete_blobs(key: str) -> None:
    """Удаляет файл вместе с превью. Отсутствие любого из них — не ошибка."""
    _blob_path(key).unlink(missing_ok=True)
    _blob_path(f"{key}_thumb").unlink(missing_ok=True)
    

# ---------- Имя файла ----------

def clean_file_name(name: str | None) -> str:
    """Приводит имя от клиента к безопасному виду для хранения и показа в чате."""
    if not name:
        return DEFAULT_FILE_NAME
    # Браузер может прислать полный путь, причём с разделителями Windows: берём только последний кусок.
    # Path(name).name на Linux не режет по "\", поэтому заменяем вручную
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    name = UNSAFE_NAME_CHARS_RE.sub("", name).strip()
    # "." и ".." — не имена файлов, а ссылки на папки
    if name in ("", ".", ".."):
        return DEFAULT_FILE_NAME

    if len(name) > MAX_FILE_NAME_LENGTH:
        stem, ext = os.path.splitext(name)
        # Длинный «хвост» после точки — это не расширение, а часть имени: режем как обычный текст
        if len(ext) > 20:
            stem, ext = name, ""
        name = stem[: MAX_FILE_NAME_LENGTH - len(ext)] + ext
    return name
