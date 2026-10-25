from typing import Literal
import uuid
from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.utils.security import attachment_expiry, sign_attachment

AttachmentVariant = Literal["full", "thumb"]


def attachment_url(attachment_uuid: uuid.UUID, variant: AttachmentVariant) -> str:
    """Подписанная ссылка на файл. Работает без заголовка Authorization, поэтому годится для <img src>."""
    exp = attachment_expiry()
    sig = sign_attachment(attachment_uuid, variant, exp)
    return f"/api/v1/attachments/{attachment_uuid}/{variant}?exp={exp}&sig={sig}"


class AttachmentResponse(BaseModel):
    id: uuid.UUID = Field(validation_alias="uuid")
    kind: Literal["image", "file"]
    file_name: str
    mime_type: str
    size: int
    width: int | None
    height: int | None
    has_thumbnail: bool = Field(exclude=True)

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def url(self) -> str:
        return attachment_url(self.id, "full")

    @computed_field
    @property
    def thumb_url(self) -> str | None:
        return attachment_url(self.id, "thumb") if self.has_thumbnail else None
