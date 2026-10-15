import datetime
from typing import Annotated
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.user import UserResponse

MessageContent = Annotated[str, Field(min_length=1, max_length=1000)]


class MessageBase(BaseModel):
    content: MessageContent


class MessageCreate(MessageBase):
    pass


class MessageResponse(MessageBase):
    id: int
    chat_id: int
    sender_id: int
    is_read: bool
    created_at: datetime.datetime
    sender: UserResponse | None = None
    
    model_config = ConfigDict(from_attributes=True)
