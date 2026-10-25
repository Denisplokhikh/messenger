import datetime
import uuid
from typing import Any, Literal
from pydantic import BaseModel

from app.schemas.attachment import AttachmentResponse
from app.schemas.message import MessageInput


class WSAuthPayload(BaseModel):
    token: str | None = None


class WSAuthMessage(BaseModel):
    type: str | None = None
    action: str | None = None
    token: str | None = None
    payload: WSAuthPayload | dict[str, Any] | None = None
    def is_auth_message(self) -> bool:
        msg_type = self.type or self.action
        return msg_type in ("authenticate", "auth", "connection_init")

    def extract_token(self) -> str | None:
        """Достает токен независимо от того, лежит он в корне или в payload."""
        if self.token:
            return self.token
        if isinstance(self.payload, WSAuthPayload):
            return self.payload.token
        if isinstance(self.payload, dict):
            return self.payload.get("token")
        return None


class WSBaseAction(BaseModel):
    action: str

class WSPingAction(WSBaseAction):
    action: Literal["ping"] = "ping"

class WSSendMessageAction(WSBaseAction, MessageInput):
    # content и attachment_ids с проверками — из MessageInput, те же, что у HTTP
    action: Literal["send_message"] = "send_message"
    chat_id: uuid.UUID

class WSTypingAction(WSBaseAction):
    """Клиент сообщает, что набирает текст. Шлёт не чаще раза в несколько секунд, пока печатает."""
    action: Literal["typing"] = "typing"
    chat_id: uuid.UUID

class WSConnectionAck(BaseModel):
    event: str = "connected"
    type: str = "connection_ack"
    user_id: uuid.UUID
    username: str

class WSPongResponse(BaseModel):
    event: str = "pong"

class WSErrorResponse(BaseModel):
    error: str

class WSMessagePayload(BaseModel):
    id: int
    chat_id: uuid.UUID
    sender_id: uuid.UUID
    sender_username: str
    content: str | None
    created_at: datetime.datetime
    attachments: list[AttachmentResponse] = []

class WSTypingEvent(BaseModel):
    # События «перестал печатать» нет: клиент сам гасит индикатор, если новых typing долго не было
    event: str = "typing"
    chat_id: uuid.UUID
    user_id: uuid.UUID
    username: str

class WSNewMessageEvent(BaseModel):
    event: str = "new_message"
    message: WSMessagePayload

class WSPresenceEvent(BaseModel):
    """Пользователь появился в сети или вышел. Рассылается тем, с кем у него есть общие чаты."""
    event: str = "presence"
    user_id: uuid.UUID
    is_online: bool
    last_seen_at: datetime.datetime
