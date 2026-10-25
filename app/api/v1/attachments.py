import asyncio
import itertools
import logging
import time
import uuid
from pathlib import PurePath
from typing import Annotated, BinaryIO
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.config import settings
from app.models.attachment import Attachment
from app.models.user import User
from app.schemas.attachment import AttachmentResponse, AttachmentVariant
from app.services.attachment_storage import (
    CHUNK_SIZE,
    CorruptedFileError,
    EncryptedWriter,
    delete_files,
    iter_decrypted,
    new_storage_key,
    write_encrypted,
)
from app.services.file_service import clean_file_name, detect_kind, process_image
from app.utils.limiter import limiter
from app.utils.security import verify_attachment_signature

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/attachments", tags=["Attachments"])

# Pillow на картинке в 40 Мп занимает ядро и сотни МБ памяти на секунды.
# Без ограничения пачка таких загрузок положила бы единственный процесс
_image_slots = asyncio.Semaphore(2)


class FileTooLarge(Exception):
    pass


def _too_large() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        detail=f"Файл слишком большой (максимум {settings.MAX_ATTACHMENT_BYTES // (1024 * 1024)} МБ)",
    )


def _store_file(src: BinaryIO, storage_key: str) -> int:
    """Шифрует файл на диск кусками, не читая его в память целиком. Возвращает размер.

    Starlette к этому моменту уже сохранила загрузку во временный файл, поэтому читаем синхронно,
    в threadpool.
    """
    with EncryptedWriter(storage_key) as writer:
        while chunk := src.read(CHUNK_SIZE):
            writer.write(chunk)
            # Размер из multipart уже проверен, это страховка на случай, если его не было
            if writer.size > settings.MAX_ATTACHMENT_BYTES:
                raise FileTooLarge
    return writer.size


@router.post("", response_model=AttachmentResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def attach_files(
    file: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    # Загружает один файл. К сообщению он привяжется позже, при отправке (attachment_ids)
    if file.size is not None and file.size > settings.MAX_ATTACHMENT_BYTES:
        raise _too_large()

    # Тип определяем по первым байтам, Content-Type от клиента не верим
    head = await file.read(261)
    if not head:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пустой файл")
    await file.seek(0)
    kind, mime = detect_kind(head)

    key = new_storage_key()
    width = height = None
    try:
        if kind == "image":
            # Pillow нужна вся картинка в памяти, но она не больше MAX_ATTACHMENT_BYTES
            data = await file.read(settings.MAX_ATTACHMENT_BYTES + 1)
            if len(data) > settings.MAX_ATTACHMENT_BYTES:
                raise _too_large()
            try:
                async with _image_slots:
                    processed = await run_in_threadpool(process_image, data)
            except ValueError:
                # Первые байты как у картинки, а дальше файл битый
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Не удалось обработать изображение"
                )
            await run_in_threadpool(write_encrypted, key, processed.full)
            await run_in_threadpool(write_encrypted, key, processed.thumb, True)
            # Размер того, что получит скачавший: для картинок это уже пережатый WebP
            size = len(processed.full)
            mime, width, height = "image/webp", processed.width, processed.height
        else:
            try:
                size = await run_in_threadpool(_store_file, file.file, key)
            except FileTooLarge:
                raise _too_large()

        attachment = Attachment(
            uploader_id=current_user.id,
            kind=kind,
            file_name=clean_file_name(file.filename),
            mime_type=mime,
            size=size,
            storage_key=key,
            width=width,
            height=height,
            has_thumbnail=kind == "image",
        )
        db.add(attachment)
        await db.commit()
    except BaseException:
        # Не записалось в базу (или на диск) — файлы никому не нужны.
        # Без await: это два быстрых unlink, а await при отмене запроса (CancelledError) сам может прерваться
        delete_files(key)
        raise

    await db.refresh(attachment)
    return attachment


@router.get("/{attachment_uuid}/{variant}")
async def download_attachment(
    attachment_uuid: uuid.UUID,
    variant: AttachmentVariant,
    exp: int,
    # Проверяем формат до compare_digest: на не-ASCII строке он бросает TypeError, а это был бы 500
    sig: Annotated[str, Query(pattern=r"^[0-9a-f]{64}$")],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Отдаёт файл по подписанной ссылке из AttachmentResponse.url / thumb_url.

    Авторизации здесь нет специально: <img src> не умеет слать заголовок Authorization.
    Доступ даёт подпись, а её сервер выдаёт только тем, кто видит сообщение (или загрузил файл).
    """
    if not verify_attachment_signature(attachment_uuid, variant, exp, sig):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired link")

    attachment = (
        await db.execute(select(Attachment).where(Attachment.uuid == attachment_uuid))
    ).scalar_one_or_none()
    if attachment is None or (variant == "thumb" and not attachment.has_thumbnail):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    is_thumb = variant == "thumb"
    storage_key, kind, size = attachment.storage_key, attachment.kind, attachment.size
    mime_type, file_name = attachment.mime_type, attachment.file_name
    # Отдача большого файла может идти минуты, держать всё это время соединение с БД незачем
    await db.close()

    chunks = iter_decrypted(storage_key, thumb=is_thumb)
    # Первый кусок читаем заранее: если файла нет или он испорчен, клиент получит нормальный
    # код ошибки, а не оборванный ответ 200
    try:
        first = await run_in_threadpool(next, chunks)
    except FileNotFoundError:
        logger.error("Attachment %s: file is missing on disk", attachment_uuid)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")
    except CorruptedFileError:
        logger.exception("Attachment %s: file is corrupted", attachment_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Attachment is unavailable"
        )

    headers = {
        # Ссылка с этой подписью ведёт на один и тот же файл до exp, браузер может не перепроверять
        "Cache-Control": f"private, max-age={max(exp - int(time.time()), 0)}, immutable",
        # Не даём браузеру «угадывать» тип: файл с HTML внутри не должен исполниться на нашем домене
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
    }
    if kind == "image":
        # Исходное имя «photo.jpg», а внутри уже WebP
        name = f"{PurePath(file_name).stem or 'image'}.webp"
        headers["Content-Disposition"] = f"inline; filename*=UTF-8''{quote(name)}"
        media_type = "image/webp"
    else:
        # Обычные файлы только скачиваются, браузер не открывает их на нашем домене
        headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(file_name)}"
        media_type = mime_type
    if not is_thumb:
        # Размер превью не храним, а у полного файла он точный: браузер покажет прогресс загрузки
        headers["Content-Length"] = str(size)

    return StreamingResponse(itertools.chain([first], chunks), media_type=media_type, headers=headers)
