import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.user import UserPublicResponse, UserResponse
from app.schemas.message import MessageResponse


class ChatBase(BaseModel):
    name: str | None = None
    is_group: bool = False


class ChatCreateDirect(BaseModel):
    recipient_id: int


class ChatCreateGroup(BaseModel):
    name: str
    participant_ids: list[int]


class ChatParticipantResponse(BaseModel):
    user_id: int
    joined_at: datetime.datetime
    user: UserPublicResponse

    model_config = ConfigDict(from_attributes=True)


class ChatResponse(ChatBase):
    id: int
    created_at: datetime.datetime
    updated_at: datetime.datetime
    participants: list[ChatParticipantResponse] = []
    last_message: MessageResponse | None = None

    model_config = ConfigDict(from_attributes=True)
