"""Присутствие пользователей: «онлайн» и «был(а) в сети ...».

Онлайн — это наличие открытого WebSocket в текущем процессе (см. ConnectionManager).
last_seen_at пишется в БД при входе и при закрытии последнего сокета пользователя,
чтобы время последнего захода переживало перезапуск сервера.
"""

import datetime
import logging
import uuid

from sqlalchemy import select, update

from app.database import AsyncSessionLocal
from app.models.chat_participant import ChatParticipant
from app.models.user import User
from app.schemas.ws import WSPresenceEvent
from app.services.connection_manager import manager

logger = logging.getLogger(__name__)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


async def _write_last_seen(user_uuid: uuid.UUID, at: datetime.datetime) -> None:
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(User).where(User.uuid == user_uuid).values(last_seen_at=at)
            )
            await session.commit()
    except Exception:
        # Не обновить «последний заход» — не повод ронять соединение
        logger.exception("Failed to update last_seen_at for user %s", user_uuid)


async def _chat_mates(user_id: int) -> list[uuid.UUID]:
    """Кому интересен статус пользователя: тем, с кем он состоит в общих чатах."""
    my_chats = select(ChatParticipant.chat_id).where(ChatParticipant.user_id == user_id)
    stmt = (
        select(User.uuid)
        .join(ChatParticipant, ChatParticipant.user_id == User.id)
        .where(ChatParticipant.chat_id.in_(my_chats), User.id != user_id)
        .distinct()
    )
    async with AsyncSessionLocal() as session:
        return list((await session.execute(stmt)).scalars().all())


async def _broadcast(user: User, is_online: bool, last_seen_at: datetime.datetime) -> None:
    try:
        event = WSPresenceEvent(
            user_id=user.uuid, is_online=is_online, last_seen_at=last_seen_at
        )
        await manager.broadcast_to_users(
            event.model_dump(mode="json"), await _chat_mates(user.id)
        )
    except Exception:
        logger.exception("Failed to broadcast presence for user %s", user.uuid)


async def mark_online(user: User) -> None:
    """Пользователь подключился: фиксируем время и рассказываем собеседникам."""
    now = _now()
    await _write_last_seen(user.uuid, now)
    await _broadcast(user, True, now)


async def mark_offline(user: User) -> None:
    """Закрылся сокет. Если открытых вкладок больше нет — пользователь ушёл."""
    if manager.is_online(user.uuid):
        return

    now = _now()
    await _write_last_seen(user.uuid, now)
    await _broadcast(user, False, now)
