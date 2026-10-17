import uuid
from typing import Annotated
from fastapi import Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.models.chat import Chat
from app.models.chat_participant import ChatParticipant
from app.models.message import Message
from app.models.user import User
from app.services.connection_manager import manager

from app.schemas.ws import WSMessagePayload, WSNewMessageEvent, WSTypingEvent

class MessageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_chat_for_participant(self, chat_uuid: uuid.UUID, user_id: int) -> Chat:
        """Чат по публичному uuid, если пользователь в нём состоит, иначе 404.

        Для чужого и несуществующего чата ответ одинаковый — нельзя узнать, существует ли чат.
        """
        stmt = (
            select(Chat)
            .join(ChatParticipant)
            .where(Chat.uuid == chat_uuid, ChatParticipant.user_id == user_id)
        )
        chat = (await self.db.execute(stmt)).scalar_one_or_none()
        if chat is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or access denied",
            )
        return chat

    async def _participant_uuids(self, chat_id: int) -> list[uuid.UUID]:
        """Публичные uuid всех участников чата — по ним менеджер находит сокеты для рассылки."""
        stmt = (
            select(User.uuid)
            .join(ChatParticipant, ChatParticipant.user_id == User.id)
            .where(ChatParticipant.chat_id == chat_id)
        )
        return list((await self.db.execute(stmt)).scalars().all())

    async def get_chat_messages(
        self, chat_uuid: uuid.UUID, user_id: int, limit: int = 50, before_id: int | None = None,
    ) -> list[Message]:
        chat = await self._get_chat_for_participant(chat_uuid, user_id)

        stmt = (
            select(Message)
            .where(Message.chat_id == chat.id)
            .options(selectinload(Message.sender), selectinload(Message.chat))
            .order_by(Message.id.desc())
            .limit(limit)
        )
        if before_id is not None:
            stmt = stmt.where(Message.id < before_id)
        res = await self.db.execute(stmt)
        messages = res.scalars().all()
        return list(reversed(messages))

    async def send_message(
        self, chat_uuid: uuid.UUID, sender: User, content: str, exclude_sender: bool = False,
    ) -> Message:
        # 1. Проверяем, что пользователь состоит в чате, и получаем uuid всех участников для рассылки
        chat = await self._get_chat_for_participant(chat_uuid, sender.id)
        participant_uuids = await self._participant_uuids(chat.id)

        # 2. Создаем сообщение
        message = Message(chat_id=chat.id, sender_id=sender.id, content=content)
        self.db.add(message)

        # 3. Обновляем время чата (чтобы он поднимался наверх в списке диалогов)
        await self.db.execute(
            update(Chat).where(Chat.id == chat.id).values(updated_at=func.now())
        )

        await self.db.commit()
        await self.db.refresh(message, attribute_names=["sender", "chat"])

        # 4. Рассылаем WebSocket-событие участникам
        # При отправке через HTTP отправитель получает сообщение в ответе, эхо по сокету дало бы дубль
        recipient_uuids = [
            u for u in participant_uuids if not (exclude_sender and u == sender.uuid)
        ]
        event = WSNewMessageEvent(
            message=WSMessagePayload(
                id=message.id,
                chat_id=chat_uuid,
                sender_id=sender.uuid,
                sender_username=sender.username,
                content=message.content,
                created_at=message.created_at,
            )
        )
        await manager.broadcast_to_users(event.model_dump(mode="json"), recipient_uuids)
        return message

    async def notify_typing(self, chat_uuid: uuid.UUID, user: User) -> None:
        """Рассылает остальным участникам чата, что user сейчас печатает. В базу ничего не пишется."""
        chat = await self._get_chat_for_participant(chat_uuid, user.id)
        recipient_uuids = [u for u in await self._participant_uuids(chat.id) if u != user.uuid]
        event = WSTypingEvent(chat_id=chat_uuid, user_id=user.uuid, username=user.username)
        await manager.broadcast_to_users(event.model_dump(mode="json"), recipient_uuids)


async def get_message_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageService:
    return MessageService(db)
