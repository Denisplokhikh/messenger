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

from app.schemas.ws import WSMessagePayload, WSNewMessageEvent

class MessageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_chat_messages(
        self, chat_id: int, user_id: int, limit: int = 50, offset: int = 0
    ) -> list[Message]:
        # Проверяем, что пользователь состоит в чате
        stmt_check = select(ChatParticipant.id).where(
            ChatParticipant.chat_id == chat_id, ChatParticipant.user_id == user_id
        )
        res_check = await self.db.execute(stmt_check)
        if not res_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or access denied",
            )

        stmt = (
            select(Message)
            .where(Message.chat_id == chat_id)
            .options(selectinload(Message.sender))
            .order_by(Message.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        messages = res.scalars().all()
        return list(reversed(messages))

    async def send_message(
        self, chat_id: int, sender: User, content: str, exclude_sender: bool = False,
    ) -> Message:
        # 1. Проверяем, что пользователь состоит в чате, и получаем всех участников
        stmt = select(ChatParticipant.user_id).where(ChatParticipant.chat_id == chat_id)
        res = await self.db.execute(stmt)
        participant_ids = res.scalars().all()

        if sender.id not in participant_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found or access denied",
            )

        # 2. Создаем сообщение
        message = Message(chat_id=chat_id, sender_id=sender.id, content=content)
        self.db.add(message)

        # 3. Обновляем время чата (чтобы он поднимался наверх в списке диалогов)
        await self.db.execute(
            update(Chat).where(Chat.id == chat_id).values(updated_at=func.now())
        )

        await self.db.commit()
        await self.db.refresh(message, attribute_names=["sender"])

        # 4. Рассылаем WebSocket-событие участникам
        # При отправке через HTTP отправитель получает сообщение в ответе, эхо по сокету дало бы дубль
        recipient_ids = [uid for uid in participant_ids if not (exclude_sender and uid == sender.id)]
        event = WSNewMessageEvent(
            message=WSMessagePayload(
                id=message.id,
                chat_id=message.chat_id,
                sender_id=message.sender_id,
                sender_username=sender.username,
                content=message.content,
                created_at=message.created_at,
            )
        )
        await manager.broadcast_to_users(event.model_dump(mode="json"), recipient_ids)
        return message


async def get_message_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageService:
    return MessageService(db)
