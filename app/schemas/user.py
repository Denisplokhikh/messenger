import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from typing import Annotated

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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: Password

# 1. Публичные данные (видят ВСЕ пользователи, никакого email)
class UserPublicResponse(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)

# 5. Приватные данные (видит ТОЛЬКО сам владелец аккаунта в /me)
class UserResponse(UserPublicResponse):
    email: EmailStr
    is_active: bool

    model_config = ConfigDict(from_attributes=True)
