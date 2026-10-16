import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models.chat_participant import ChatParticipant
from app.models.message import Message
from app.models.user import User
from app.schemas.user import (
    ChangePasswordRequest,
    UserResponse,
    UserUpdate,
    UserPublicResponse,
)
from app.services.avatar_service import (
    AVATARS_DIR,
    AVATARS_URL_PREFIX,
    MAX_AVATAR_BYTES,
    delete_avatar_file,
    process_avatar,
)
from app.utils.security import get_password_hash, verify_password
from app.utils.limiter import limiter

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/search", response_model=list[UserPublicResponse])
@limiter.limit("30/minute")
async def search_users(
    query: Annotated[str, Query(min_length=1, max_length=50)],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    stmt = (
        select(User)
        .where(User.username.ilike(f"%{query}%"))
        .where(User.id != current_user.id)
        .limit(20)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    return current_user


@router.post("/me/avatar", response_model=UserResponse)
@limiter.limit("5/minute")
async def set_profile_picture(
    file: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    # Читаем на байт больше лимита: так узнаём о превышении, не загружая в память весь файл
    data = await file.read(MAX_AVATAR_BYTES + 1)
    if len(data) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Файл слишком большой (максимум 5 МБ)",
        )

    # Pillow работает синхронно и грузит процессор — уносим из event loop
    try:
        webp = await run_in_threadpool(process_avatar, data)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Файл не является изображением",
        )

    # Случайное имя: не угадать чужой файл и не зависеть от имени, присланного клиентом
    filename = f"{uuid.uuid4().hex}.webp"
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)
    await run_in_threadpool((AVATARS_DIR / filename).write_bytes, webp)

    old_url = current_user.avatar_url
    current_user.avatar_url = AVATARS_URL_PREFIX + filename
    try:
        await db.commit()
    except Exception:
        # В базу не записалось — новый файл никому не нужен
        delete_avatar_file(AVATARS_URL_PREFIX + filename)
        raise
    await db.refresh(current_user)

    # Старый файл удаляем только после успешного коммита, иначе пользователь останется без аватарки
    delete_avatar_file(old_url)
    return current_user


@router.delete("/me/avatar", response_model=UserResponse)
@limiter.limit("5/minute")
async def delete_profile_picture(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    # Без аватарки фронтенд рисует идентикон по username
    old_url = current_user.avatar_url
    current_user.avatar_url = None
    await db.commit()
    await db.refresh(current_user)
    delete_avatar_file(old_url)
    return current_user


@router.patch("/me", response_model=UserResponse)
@limiter.limit("5/minute")
async def update_current_user_profile(
    user_update: UserUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    # Check username uniqueness if changed
    if user_update.username and user_update.username != current_user.username:
        existing = await db.execute(
            select(User).where(
                User.username == user_update.username, User.id != current_user.id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Имя пользователя уже занято",
            )
        current_user.username = user_update.username

    # Check email uniqueness if changed
    if user_update.email and user_update.email != current_user.email:
        existing = await db.execute(
            select(User).where(
                User.email == user_update.email, User.id != current_user.id
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email уже используется другим аккаунтом",
            )
        current_user.email = user_update.email

    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
    if user_update.bio is not None:
        current_user.bio = user_update.bio

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/change-password")
@limiter.limit("5/minute")
async def change_password(
    req: ChangePasswordRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный текущий пароль",
        )
    if len(req.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Новый пароль должен содержать минимум 6 символов",
        )
    current_user.hashed_password = get_password_hash(req.new_password)
    await db.commit()
    return {"message": "Пароль успешно изменен"}


@router.get("/{user_id}", response_model=UserPublicResponse)
async def get_user_by_id(
    user_id: int,
    _: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    request: Request,
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user
