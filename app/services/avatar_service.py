import io
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings

AVATARS_DIR = settings.MEDIA_DIR / "avatars"
AVATARS_URL_PREFIX = "/media/avatars/"
AVATAR_SIZE = (512, 512)
MAX_AVATAR_BYTES = 5 * 1024 * 1024
# Защита от «декомпрессионных бомб»: маленький файл, который распаковывается в гигантскую картинку
MAX_AVATAR_PIXELS = 40_000_000


def process_avatar(data: bytes) -> bytes:
    """Проверяет, что это картинка, и перекодирует её в квадратный WebP.

    Перекодирование выкидывает EXIF (геолокацию и т.п.) и всё постороннее, что могли спрятать в файл.
    Синхронная и грузит процессор — из async-кода вызывать через run_in_threadpool.
    """
    try:
        with Image.open(io.BytesIO(data)) as img:
            if img.width * img.height > MAX_AVATAR_PIXELS:
                raise ValueError("too many pixels")
            # Фото с телефона часто повёрнуты через EXIF, а не сами пиксели
            img = ImageOps.exif_transpose(img)
            # Фронтенд уже присылает квадрат, но обрезаем по центру на случай запроса в обход UI
            img = ImageOps.fit(img.convert("RGBA"), AVATAR_SIZE, Image.Resampling.LANCZOS)
            out = io.BytesIO()
            img.save(out, format="WEBP", quality=85)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ValueError("not an image") from e


def delete_avatar_file(avatar_url: str | None) -> None:
    # Удаляем только свои файлы; .name отбрасывает любые «../» из URL
    if avatar_url and avatar_url.startswith(AVATARS_URL_PREFIX):
        (AVATARS_DIR / Path(avatar_url).name).unlink(missing_ok=True)
