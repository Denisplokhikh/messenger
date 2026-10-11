from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db
from app.models.chat import Chat
from app.models.chat_participant import ChatParticipant
from app.models.user import User
from app.schemas.chat import ChatCreateDirect, ChatCreateGroup, ChatResponse

router = APIRouter(prefix="/chats", tags=["Chats"])


@router.post("/direct", response_model=ChatResponse)
async def create_or_get_direct_chat(
    payload: ChatCreateDirect,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if payload.recipient_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create direct chat with yourself",
        )

    # Check recipient exists
    rec_res = await db.execute(select(User).where(User.id == payload.recipient_id))
    recipient = rec_res.scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found")

    # Find existing direct chat between these two users
    stmt = (
        select(Chat)
        .join(ChatParticipant)
        .where(Chat.is_group == False)  # noqa: E712
        .where(ChatParticipant.user_id.in_([current_user.id, payload.recipient_id]))
        .group_by(Chat.id)
        .having(func.count(ChatParticipant.id) == 2)
        .options(
            selectinload(Chat.participants).selectinload(ChatParticipant.user)
        )
    )
    result = await db.execute(stmt)
    existing_chat = result.scalar_one_or_none()

    if existing_chat:
        return existing_chat

    # Create new direct chat
    new_chat = Chat(is_group=False)
    db.add(new_chat)
    await db.flush()

    p1 = ChatParticipant(chat_id=new_chat.id, user_id=current_user.id)
    p2 = ChatParticipant(chat_id=new_chat.id, user_id=payload.recipient_id)
    db.add_all([p1, p2])
    await db.commit()

    # Re-fetch with participants populated
    stmt = (
        select(Chat)
        .where(Chat.id == new_chat.id)
        .options(selectinload(Chat.participants).selectinload(ChatParticipant.user))
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.post("/group", response_model=ChatResponse)
async def create_group_chat(
    payload: ChatCreateGroup,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    all_member_ids = set(payload.participant_ids)
    all_member_ids.add(current_user.id)

    if len(all_member_ids) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group chat requires at least 2 participants",
        )

    new_chat = Chat(name=payload.name, is_group=True)
    db.add(new_chat)
    await db.flush()

    participants = [
        ChatParticipant(chat_id=new_chat.id, user_id=uid) for uid in all_member_ids
    ]
    db.add_all(participants)
    await db.commit()

    stmt = (
        select(Chat)
        .where(Chat.id == new_chat.id)
        .options(selectinload(Chat.participants).selectinload(ChatParticipant.user))
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.get("", response_model=list[ChatResponse])
async def get_my_chats(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = (
        select(Chat)
        .join(ChatParticipant)
        .where(ChatParticipant.user_id == current_user.id)
        .options(selectinload(Chat.participants).selectinload(ChatParticipant.user))
        .order_by(Chat.updated_at.desc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()
