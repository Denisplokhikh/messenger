import asyncio
import datetime
import logging

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete, func, select

from app.database import AsyncSessionLocal
from app.models.attachment import Attachment
from app.services.attachment_storage import delete_files

logger = logging.getLogger(__name__)

# Загруженное, но так и не отправленное вложение живёт сутки
UNSENT_TTL = datetime.timedelta(hours=24)
CLEANUP_INTERVAL = 60 * 60
# Не сразу при старте: тесты и частые деплои не должны каждый раз запускать очистку
CLEANUP_FIRST_DELAY = 60
# Произвольное число для pg_try_advisory_xact_lock: если процессов несколько, чистит только один
CLEANUP_LOCK_ID = 7_301_001


def _delete_files(storage_keys: list[str]) -> None:
    for key in storage_keys:
        try:
            delete_files(key)
        except (OSError, ValueError):
            # Один проблемный файл не должен мешать удалить остальные
            logger.exception("Failed to delete attachment files %s", key)


async def delete_unsent_attachments() -> int:
    """Удаляет вложения, которые так и не прикрепили к сообщению за UNSENT_TTL. Возвращает их число."""
    cutoff = datetime.datetime.now(datetime.timezone.utc) - UNSENT_TTL
    async with AsyncSessionLocal() as session:
        locked = (await session.execute(select(func.pg_try_advisory_xact_lock(CLEANUP_LOCK_ID)))).scalar()
        if not locked:
            return 0
        # Одним DELETE ... RETURNING: если вложение в этот момент отправляют, отправка держит
        # строку под FOR UPDATE, DELETE её дождётся, увидит message_id и пропустит
        stmt = (
            delete(Attachment)
            .where(Attachment.message_id.is_(None), Attachment.created_at < cutoff)
            .returning(Attachment.storage_key)
            .execution_options(synchronize_session=False)
        )
        storage_keys = list((await session.execute(stmt)).scalars().all())
        await session.commit()

    # Файлы — только после commit: если база откатится, файлы ещё нужны
    if storage_keys:
        await run_in_threadpool(_delete_files, storage_keys)
    return len(storage_keys)


async def run_cleanup_loop() -> None:
    """Фоновая задача из lifespan: раз в час чистит неотправленные вложения."""
    await asyncio.sleep(CLEANUP_FIRST_DELAY)
    while True:
        try:
            deleted = await delete_unsent_attachments()
            if deleted:
                logger.info("Deleted %d unsent attachments", deleted)
        except Exception:
            # Упавшая очистка не должна останавливать цикл: попробуем через час
            logger.exception("Attachment cleanup failed")
        await asyncio.sleep(CLEANUP_INTERVAL)
