from typing import Literal
import uuid
from pydantic import BaseModel, ConfigDict, Field


class AttachmentResponse(BaseModel):
    id: uuid.UUID = Field(validation_alias="uuid")
    kind: Literal["image", "file"]
    file_name: str
    mime_type: str
    size: int
    width: int | None
    height: int | None

    model_config = ConfigDict(from_attributes=True)
