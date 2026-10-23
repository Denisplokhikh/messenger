from typing import Annotated
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.config import settings
from app.models.attachment import Attachment
from app.models.user import User
from app.schemas.attachment import AttachmentResponse
from app.services.file_service import (
    clean_file_name,
    delete_blobs,
    detect_kind,
    new_storage_key,
    process_image,
    save_blob,
)
from app.utils.limiter import limiter

router = APIRouter(prefix="/attachments", tags=["Attachments"])


@router.post("", response_model=AttachmentResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def attach_files(
    file: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    # Загружает один файл. К сообщению он привяжется позже, при отправке (attachment_ids)

    # Читаем на байт больше лимита: так узнаём о превышении, не загружая в память лишнее
    data = await file.read(settings.MAX_ATTACHMENT_BYTES + 1)
    if len(data) > settings.MAX_ATTACHMENT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Файл слишком большой (максимум {settings.MAX_ATTACHMENT_BYTES // (1024 * 1024)} МБ)",
        )
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пустой файл")

    kind, mime = detect_kind(data)
    thumb = width = height = None
    if kind == "image":
        # Pillow работает синхронно и грузит процессор — уносим из event loop
        try:
            processed = await run_in_threadpool(process_image, data)
        except ValueError:
            # Первые байты как у картинки, а дальше файл битый
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Не удалось обработать изображение"
            )
        data, thumb = processed.full, processed.thumb
        mime, width, height = "image/webp", processed.width, processed.height

    key = new_storage_key()
    try:
        await run_in_threadpool(save_blob, key, data)
        if thumb is not None:
            await run_in_threadpool(save_blob, f"{key}_thumb", thumb)

        attachment = Attachment(
            uploader_id=current_user.id,
            kind=kind,
            file_name=clean_file_name(file.filename),
            mime_type=mime,
            # Размер того, что получит скачавший: для картинок это уже пережатый WebP
            size=len(data),
            storage_key=key,
            width=width,
            height=height,
            has_thumbnail=thumb is not None,
        )
        db.add(attachment)
        await db.commit()
    except BaseException:
        # Не записалось в базу (или на диск) — файлы никому не нужны.
        # Без await: это два быстрых unlink, а await при отмене запроса (CancelledError) сам может прерваться
        delete_blobs(key)
        raise

    await db.refresh(attachment)
    return attachment
