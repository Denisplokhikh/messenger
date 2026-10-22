import io
from dataclasses import dataclass

import filetype
from PIL import Image, ImageOps, UnidentifiedImageError

# Картинки, которые Pillow пережимает в WebP и показывает прямо в чате.
# SVG сюда не входит: это XML, внутри может быть <script>, поэтому он только скачивается.
# GIF пока тоже: при пережатии анимация теряется, остаётся первый кадр
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}
DEFAULT_MIME = "application/octet-stream"

IMAGE_MAX_SIDE = 2560
THUMB_MAX_SIDE = 400
# Защита от «декомпрессионных бомб», как у аватарок
MAX_IMAGE_PIXELS = 40_000_000


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