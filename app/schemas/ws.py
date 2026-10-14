from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator

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

class WSSendMessageAction(WSBaseAction):
    action: Literal["send_message"] = "send_message"
    chat_id: int
    content: str = Field(..., min_length=1)

    @field_validator("content")
    @classmethod
    def validate_content(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Сообшение не должно быть пустым")
        return v

class WSConnectionAck(BaseModel):
    event: str = "connected"
    type: str = "connection_ack"
    user_id: int
    username: str

class WSPongResponse(BaseModel):
    event: str = "pong"

class WSErrorResponse(BaseModel):
    error: str

class WSMessagePayload(BaseModel):
    id: int
    chat_id: int
    sender_id: int
    sender_username: str
    content: str
    created_at: str

class WSNewMessageEvent(BaseModel):
    event: str = "new_message"
    message: WSMessagePayload
