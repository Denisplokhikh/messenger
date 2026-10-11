from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models.user import User
from app.schemas.user import UserResponse

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/search", response_model=list[UserResponse])
async def search_users(
    query: Annotated[str, Query(min_length=1, max_length=50)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = (
        select(User)
        .where(User.username.ilike(f"%{query}%"))
        .where(User.id != current_user.id)
        .limit(20)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: int,
    _: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
