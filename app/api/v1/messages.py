import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, Path, Query, status

from app.api.deps import get_current_active_user
from app.models.user import User
from app.schemas.message import MessageCreate, MessageEdit, MessageResponse
from app.services.message_service import MessageService, get_message_service

router = APIRouter(prefix="/chats/{chat_uuid}/messages", tags=["Messages"])


@router.get("", response_model=list[MessageResponse])
async def get_chat_messages(
    chat_uuid: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    message_service: Annotated[MessageService, Depends(get_message_service)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    before_id: Annotated[int | None, Query(ge=1)] = None,
):
    return await message_service.get_chat_messages(
        chat_uuid=chat_uuid, user_id=current_user.id, limit=limit, before_id=before_id
    )


@router.post("", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message_http(
    chat_uuid: uuid.UUID,
    payload: MessageCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    message_service: Annotated[MessageService, Depends(get_message_service)],
):
    return await message_service.send_message(
        chat_uuid=chat_uuid,
        sender=current_user,
        content=payload.content,
        attachment_ids=payload.attachment_ids,
        exclude_sender=True,
        reply_to_id=payload.reply_to_id,
    )


@router.patch("/{message_id}", response_model=MessageResponse)
async def edit_message(
    chat_uuid: uuid.UUID,
    message_id: Annotated[int, Path(ge=1)],
    payload: MessageEdit,
    current_user: Annotated[User, Depends(get_current_active_user)],
    message_service: Annotated[MessageService, Depends(get_message_service)],
):
    """Правка своего сообщения. Автор получает новое тело, остальные — событие по WebSocket."""
    return await message_service.edit_message(
        chat_uuid=chat_uuid, message_id=message_id, user=current_user, content=payload.content
    )


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    chat_uuid: uuid.UUID,
    message_id: Annotated[int, Path(ge=1)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    message_service: Annotated[MessageService, Depends(get_message_service)],
):
    """Удаление своего сообщения. Идемпотентно: повторный вызов тоже 204."""
    await message_service.delete_message(
        chat_uuid=chat_uuid, message_id=message_id, user=current_user
    )
