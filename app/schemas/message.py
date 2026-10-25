import datetime
import uuid
from typing import Annotated
from pydantic import AliasPath, BaseModel, ConfigDict, Field, field_validator, model_validator
from app.config import settings
from app.schemas.attachment import AttachmentResponse
from app.schemas.user import UserPublicResponse

MessageContent = Annotated[str, Field(min_length=1, max_length=1000)]


class MessageInput(BaseModel):
    """Общие поля отправки для HTTP и WebSocket: текст, вложения или и то и другое."""
    content: MessageContent | None = None
    # uuid из ответов POST /attachments
    attachment_ids: list[uuid.UUID] = Field(
        default_factory=list, max_length=settings.MAX_ATTACHMENTS_PER_MESSAGE
    )

    @field_validator("content", mode="before")
    @classmethod
    def strip_content(cls, v):
        # Текст из одних пробелов — то же самое, что его отсутствие
        if isinstance(v, str):
            return v.strip() or None
        return v

    @model_validator(mode="after")
    def text_or_attachments(self):
        if self.content is None and not self.attachment_ids:
            raise ValueError("Сообщение не должно быть пустым")
        return self


class MessageCreate(MessageInput):
    pass


class MessageResponse(BaseModel):
    id: int
    # None — сообщение из одних вложений
    content: str | None
    # Берутся из связей chat и sender, поэтому их нужно загружать вместе с сообщением
    chat_id: uuid.UUID = Field(validation_alias=AliasPath("chat", "uuid"))
    sender_id: uuid.UUID = Field(validation_alias=AliasPath("sender", "uuid"))
    is_read: bool
    created_at: datetime.datetime
    sender: UserPublicResponse | None = None
    # Тоже связь: загружать вместе с сообщением (selectinload), иначе lazy load в async упадёт
    attachments: list[AttachmentResponse] = []
    model_config = ConfigDict(from_attributes=True)
