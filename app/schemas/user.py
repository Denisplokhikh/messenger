import datetime
from pydantic import BaseModel, EmailStr, ConfigDict


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str | None = None
    bio: str | None = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    username: str | None = None
    email: EmailStr | None = None
    full_name: str | None = None
    bio: str | None = None
    avatar_url: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

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
