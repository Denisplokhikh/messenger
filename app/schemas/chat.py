import datetime
import uuid
from pydantic import AliasPath, BaseModel, ConfigDict, Field
from app.schemas.user import UserPublicResponse, UserResponse
from app.schemas.message import MessageResponse


class ChatBase(BaseModel):
    name: str | None = None
    is_group: bool = False


class ChatCreateDirect(BaseModel):
    recipient_id: uuid.UUID


class ChatCreateGroup(BaseModel):
    name: str
    participant_ids: list[uuid.UUID]


class ChatParticipantResponse(BaseModel):
    user_id: uuid.UUID = Field(validation_alias=AliasPath("user", "uuid"))
    joined_at: datetime.datetime
    user: UserPublicResponse

    model_config = ConfigDict(from_attributes=True)


class ChatResponse(ChatBase):
    # Наружу id — это публичный uuid чата
    id: uuid.UUID = Field(validation_alias="uuid")
    created_at: datetime.datetime
    updated_at: datetime.datetime
    participants: list[ChatParticipantResponse] = []
    last_message: MessageResponse | None = None

    model_config = ConfigDict(from_attributes=True)
