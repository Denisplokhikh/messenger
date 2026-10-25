import datetime
import uuid
from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field
from typing import Annotated

from app.services.connection_manager import manager

Username = Annotated[str, Field(min_length=3, max_length=20)]
Password = Annotated[str, Field(min_length=6, max_length=72)]


class UserBase(BaseModel):
    username: Username
    email: EmailStr
    full_name: str | None = None
    bio: str | None = None


class UserCreate(UserBase):
    password: Password


class UserUpdate(BaseModel):
    username: Username | None = None
    email: EmailStr | None = None
    full_name: str | None = None
    bio: str | None = None
    # avatar_url намеренно нет: произвольная ссылка позволила бы светить IP всех, кто видит аватар.
    # Аватар меняется только через POST/DELETE /users/me/avatar



class VerifyPasswordRequest(BaseModel):
    current_password: str = Field(max_length=72)


class ChangePasswordRequest(VerifyPasswordRequest):
    new_password: Password


# 1. Публичные данные (видят ВСЕ пользователи, никакого email)
class UserPublicResponse(BaseModel):
    # Наружу id — это публичный uuid, внутренний числовой id не отдаём
    id: uuid.UUID = Field(validation_alias="uuid")
    username: str
    full_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    created_at: datetime.datetime
    # Когда пользователь последний раз был в сети. NULL — ещё ни разу не заходил
    last_seen_at: datetime.datetime | None = None

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def is_online(self) -> bool:
        """Онлайн = у пользователя есть открытый WebSocket в этом процессе.

        Проект запускается одним процессом uvicorn, поэтому глобального состояния
        между репликами не нужно. При переходе на несколько воркеров это придётся
        вынести в Redis.
        """
        return manager.is_online(self.id)

# 5. Приватные данные (видит ТОЛЬКО сам владелец аккаунта в /me)
class UserResponse(UserPublicResponse):
    email: EmailStr
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
