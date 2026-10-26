import datetime
import logging
import uuid
from collections.abc import Sequence
from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.models.attachment import Attachment
from app.models.chat import Chat
from app.models.chat_participant import ChatParticipant
from app.models.message import Message
from app.models.user import User
from app.services.attachment_storage import delete_many
from app.services.connection_manager import manager

from app.schemas.attachment import AttachmentResponse
from app.schemas.message import MessageReplyPreview
from app.schemas.ws import (
    WSMessageDeletedEvent,
    WSMessageEditedEvent,
    WSMessagePayload,
    WSNewMessageEvent,
    WSTypingEvent,
)

logger = logging.getLogger(__name__)


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _message_options():
    """Связи, без которых MessageResponse и payload не сериализуются.

    reply_to объявлен с lazy="raise": если забыть загрузить цитату, Pydantic упадёт
    с понятной ошибкой, а не полезет в базу из async-контекста.
    """
    return (
        selectinload(Message.sender),
        selectinload(Message.chat),
        selectinload(Message.attachments),
        selectinload(Message.reply_to).selectinload(Message.sender),
    )


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

    async def _get_message(self, message_id: int) -> Message:
        stmt = (
            select(Message)
            .where(Message.id == message_id)
            .options(*_message_options())
            .execution_options(populate_existing=True)
        )
        message = (await self.db.execute(stmt)).scalar_one_or_none()
        if message is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
            )
        return message

    async def _get_own_message(
        self, chat_uuid: uuid.UUID, message_id: int, user_id: int, action: str
    ) -> tuple[Message, Chat]:
        """Сообщение из чата, доступного пользователю. Править и удалять может только автор.

        Несуществующее сообщение и сообщение из чужого чата неразличимы (404),
        чтобы нельзя было перебором узнать, что где лежит.
        """
        chat = await self._get_chat_for_participant(chat_uuid, user_id)
        message = await self._get_message(message_id)
        if message.chat_id != chat.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Message not found"
            )
        if message.sender_id != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only the author can {action} this message",
            )
        return message, chat

    def _reply_preview(self, message: Message) -> MessageReplyPreview | None:
        if message.reply_to is None:
            return None
        return MessageReplyPreview.model_validate(message.reply_to)

    async def _claim_attachments(
        self, attachment_uuids: Sequence[uuid.UUID], uploader_id: int
    ) -> list[Attachment]:
        """Вложения для нового сообщения: только свои и ещё не отправленные, иначе 400.

        Без проверки владельца можно было бы прикрепить к своему сообщению чужой файл по его uuid
        и получить на него ссылку. FOR UPDATE: если два сообщения одновременно берут одно вложение,
        второе дождётся первого, увидит, что вложение уже отправлено, и получит 400.
        """
        wanted = set(attachment_uuids)
        if not wanted:
            return []
        stmt = (
            select(Attachment)
            .where(
                Attachment.uuid.in_(wanted),
                Attachment.uploader_id == uploader_id,
                Attachment.message_id.is_(None),
            )
            .order_by(Attachment.id)
            .with_for_update()
        )
        attachments = list((await self.db.execute(stmt)).scalars().all())
        if len(attachments) != len(wanted):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Attachment not found or already sent",
            )
        return attachments

    async def _validate_reply_target(self, chat_id: int, reply_to_id: int) -> None:
        """Отвечать можно только на сообщение того же чата.

        Удалённое сообщение тоже допустимо: клиент покажет в цитате «Сообщение удалено».
        """
        stmt = select(Message.id).where(Message.id == reply_to_id, Message.chat_id == chat_id)
        if (await self.db.execute(stmt)).scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reply target not found in this chat",
            )

    async def get_chat_messages(
        self, chat_uuid: uuid.UUID, user_id: int, limit: int = 50, before_id: int | None = None,
    ) -> list[Message]:
        chat = await self._get_chat_for_participant(chat_uuid, user_id)

        stmt = (
            select(Message)
            .where(Message.chat_id == chat.id)
            .options(*_message_options())
            .order_by(Message.id.desc())
            .limit(limit)
        )
        if before_id is not None:
            stmt = stmt.where(Message.id < before_id)
        res = await self.db.execute(stmt)
        messages = res.scalars().all()
        return list(reversed(messages))

    async def send_message(
        self,
        chat_uuid: uuid.UUID,
        sender: User,
        content: str | None,
        attachment_ids: Sequence[uuid.UUID] = (),
        exclude_sender: bool = False,
        reply_to_id: int | None = None,
    ) -> Message:
        # 1. Проверяем, что пользователь состоит в чате, и получаем uuid всех участников для рассылки
        chat = await self._get_chat_for_participant(chat_uuid, sender.id)
        participant_uuids = await self._participant_uuids(chat.id)
        attachments = await self._claim_attachments(attachment_ids, sender.id)
        if reply_to_id is not None:
            await self._validate_reply_target(chat.id, reply_to_id)

        # 2. Создаем сообщение. message_id у вложений SQLAlchemy проставит сама при flush
        message = Message(
            chat_id=chat.id,
            sender_id=sender.id,
            content=content,
            attachments=attachments,
            reply_to_id=reply_to_id,
        )
        self.db.add(message)

        # 3. Обновляем время чата (чтобы он поднимался наверх в списке диалогов)
        await self.db.execute(
            update(Chat).where(Chat.id == chat.id).values(updated_at=func.now())
        )

        await self.db.commit()
        message = await self._get_message(message.id)

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
                attachments=[AttachmentResponse.model_validate(a) for a in message.attachments],
                reply_to=self._reply_preview(message),
            )
        )
        await manager.broadcast_to_users(event.model_dump(mode="json"), recipient_uuids)
        return message

    async def edit_message(
        self, chat_uuid: uuid.UUID, message_id: int, user: User, content: str
    ) -> Message:
        """Меняет текст сообщения. Автор — единственный, кто может это делать.

        Вложения не редактируются: иначе пришлось бы разбираться с осиротевшими файлами
        и с тем, что делать, если файл уже скачали.
        """
        message, chat = await self._get_own_message(chat_uuid, message_id, user.id, "edit")
        if message.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot edit a deleted message",
            )

        message.content = content
        message.edited_at = _now()
        await self.db.commit()
        message = await self._get_message(message.id)

        event = WSMessageEditedEvent(
            message_id=message.id,
            chat_id=chat_uuid,
            content=message.content,
            edited_at=message.edited_at,
        )
        await manager.broadcast_to_users(
            event.model_dump(mode="json"),
            [u for u in await self._participant_uuids(chat.id) if u != user.uuid],
        )
        return message

    async def delete_message(self, chat_uuid: uuid.UUID, message_id: int, user: User) -> None:
        """Мягкое удаление: текст стирается, вложения удаляются, у всех остаётся плашка.

        Жёстко удалять строку нельзя: на неё могут ссылаться ответы, и тогда у собеседников
        цитата превратилась бы в битую ссылку. Пустая строка с deleted_at — самый дешёвый способ
        сохранить целостность ленты и при этом реально убрать содержимое из базы.
        """
        message, chat = await self._get_own_message(chat_uuid, message_id, user.id, "delete")
        if message.deleted_at is not None:
            # Повторное удаление — не ошибка: клиент мог не получить ответ и повторить
            return

        storage_keys = [a.storage_key for a in message.attachments]
        deleted_at = _now()

        # Шифротекст и имена файлов стираются физически: «удалено» не должно означать «спрятано»
        message.content = None
        message.deleted_at = deleted_at
        if storage_keys:
            await self.db.execute(
                delete(Attachment)
                .where(Attachment.message_id == message.id)
                .execution_options(synchronize_session=False)
            )
        await self.db.commit()

        # Файлы — после commit: если база откатится, они ещё нужны
        if storage_keys:
            await run_in_threadpool(delete_many, storage_keys)

        event = WSMessageDeletedEvent(
            message_id=message.id, chat_id=chat_uuid, deleted_at=deleted_at
        )
        await manager.broadcast_to_users(
            event.model_dump(mode="json"),
            [u for u in await self._participant_uuids(chat.id) if u != user.uuid],
        )

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
