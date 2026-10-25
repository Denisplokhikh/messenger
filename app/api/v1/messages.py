import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, Query, status

from app.api.deps import get_current_active_user
from app.models.user import User
from app.schemas.message import MessageCreate, MessageResponse
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
    )
