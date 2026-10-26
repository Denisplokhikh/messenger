import datetime
import uuid
from typing import Annotated
from pydantic import AliasPath, BaseModel, ConfigDict, Field, field_validator, model_validator
from app.config import settings
from app.schemas.attachment import AttachmentResponse
from app.schemas.user import UserPublicResponse

MessageContent = Annotated[str, Field(min_length=1, max_length=1000)]


class MessageReplyPreview(BaseModel):
    """Короткая цитата оригинала внутри ответа.

    Только то, что нужно нарисовать в плашке: кто и что написал. Полное сообщение
    клиент при необходимости найдёт в ленте по id.
    """
    id: int
    sender_id: uuid.UUID = Field(validation_alias=AliasPath("sender", "uuid"))
    sender_username: str = Field(validation_alias=AliasPath("sender", "username"))
    # None — сообщение из одних вложений либо удалённое (тогда смотрим deleted_at)
    content: str | None = None
    deleted_at: datetime.datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class MessageInput(BaseModel):
    """Общие поля отправки для HTTP и WebSocket: текст, вложения или и то и другое."""
    content: MessageContent | None = None
    # uuid из ответов POST /attachments
    attachment_ids: list[uuid.UUID] = Field(
        default_factory=list, max_length=settings.MAX_ATTACHMENTS_PER_MESSAGE
    )
    # id сообщения, на которое отвечаем. Должно быть в том же чате — проверяет сервис
    reply_to_id: int | None = Field(default=None, ge=1)

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


class MessageEdit(BaseModel):
    """Правка сообщения: меняется только текст, вложения остаются прежними."""
    content: MessageContent

    @field_validator("content", mode="before")
    @classmethod
    def strip_content(cls, v):
        if isinstance(v, str):
            v = v.strip()
        if not v:
            raise ValueError("Сообщение не должно быть пустым")
        return v


class MessageResponse(BaseModel):
    id: int
    # None — сообщение из одних вложений или удалённое (см. deleted_at)
    content: str | None
    # Берутся из связей chat и sender, поэтому их нужно загружать вместе с сообщением
    chat_id: uuid.UUID = Field(validation_alias=AliasPath("chat", "uuid"))
    sender_id: uuid.UUID = Field(validation_alias=AliasPath("sender", "uuid"))
    is_read: bool
    created_at: datetime.datetime
    # Не None — сообщение правили; клиент рисует пометку «изм.»
    edited_at: datetime.datetime | None = None
    # Не None — сообщение удалено автором. Текст в базе уже стёрт, остаётся только факт
    deleted_at: datetime.datetime | None = None
    sender: UserPublicResponse | None = None
    # Тоже связь: загружать вместе с сообщением (selectinload), иначе lazy load в async упадёт
    attachments: list[AttachmentResponse] = []
    reply_to: MessageReplyPreview | None = None
    model_config = ConfigDict(from_attributes=True)
