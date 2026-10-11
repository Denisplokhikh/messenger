from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db
from app.models.chat import Chat
from app.models.chat_participant import ChatParticipant
from app.models.message import Message
from app.models.user import User
from app.schemas.message import MessageCreate, MessageResponse
from app.services.connection_manager import manager

router = APIRouter(prefix="/chats/{chat_id}/messages", tags=["Messages"])


async def check_chat_participant(chat_id: int, user_id: int, db: AsyncSession) -> Chat:
    # Verify chat exists and user is participant
    stmt = (
        select(Chat)
        .join(ChatParticipant)
        .where(Chat.id == chat_id, ChatParticipant.user_id == user_id)
        .options(selectinload(Chat.participants))
    )
    res = await db.execute(stmt)
    chat = res.scalar_one_or_none()
    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat not found or access denied",
        )
    return chat


@router.get("", response_model=list[MessageResponse])
async def get_chat_messages(
    chat_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    await check_chat_participant(chat_id, current_user.id, db)

    stmt = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .options(selectinload(Message.sender))
        .order_by(Message.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    res = await db.execute(stmt)
    messages = res.scalars().all()
    return list(reversed(messages))


@router.post("", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message_http(
    chat_id: int,
    payload: MessageCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    chat = await check_chat_participant(chat_id, current_user.id, db)

    message = Message(
        chat_id=chat_id,
        sender_id=current_user.id,
        content=payload.content,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message, attribute_names=["sender"])

    # Broadcast via WebSocket to active participants
    participant_user_ids = [p.user_id for p in chat.participants if p.user_id != current_user.id]
    await manager.broadcast_to_users(
        {
            "event": "new_message",
            "message": {
                "id": message.id,
                "chat_id": message.chat_id,
                "sender_id": message.sender_id,
                "content": message.content,
                "created_at": message.created_at.isoformat(),
                "sender_username": current_user.username,
            },
        },
        participant_user_ids,
    )

    return message
