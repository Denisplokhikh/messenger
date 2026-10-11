import datetime
from pydantic import BaseModel, EmailStr, ConfigDict


class UserBase(BaseModel):
    username: str
    email: EmailStr


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int
    avatar_url: str | None = None
    is_active: bool
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)
