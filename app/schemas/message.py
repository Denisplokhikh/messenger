import datetime
import uuid
from typing import Annotated
from pydantic import AliasPath, BaseModel, ConfigDict, Field
from app.schemas.user import UserPublicResponse, UserResponse

MessageContent = Annotated[str, Field(min_length=1, max_length=1000)]


class MessageBase(BaseModel):
    content: MessageContent


class MessageCreate(MessageBase):
    pass


class MessageResponse(MessageBase):
    id: int
    # Берутся из связей chat и sender, поэтому их нужно загружать вместе с сообщением
    chat_id: uuid.UUID = Field(validation_alias=AliasPath("chat", "uuid"))
    sender_id: uuid.UUID = Field(validation_alias=AliasPath("sender", "uuid"))
    is_read: bool
    created_at: datetime.datetime
    sender: UserPublicResponse | None = None
    model_config = ConfigDict(from_attributes=True)
