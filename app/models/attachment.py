import datetime
from uuid import UUID, uuid4
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Uuid, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.types import EncryptedText


class Attachment(Base):
    """Файл, приложенный к сообщению. Сам файл лежит в ATTACHMENTS_DIR зашифрованным."""

    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # Публичный идентификатор для URL и API, как у User и Chat
    uuid: Mapped[UUID] = mapped_column(
        Uuid, unique=True, index=True, nullable=False,
        default=uuid4, server_default=text("gen_random_uuid()"),
    )

    uploader_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # NULL = файл загружен, но сообщение с ним ещё не отправлено.
    # Такие вложения через сутки удаляет фоновая очистка
    message_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), nullable=True, index=True
    )

    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # image | file
    # Исходное имя тоже бывает приватным («Паспорт_скан.pdf»), поэтому шифруем
    file_name: Mapped[str] = mapped_column(EncryptedText, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)  # Размер исходного файла в байтах

    # Имя файла на диске, никак не связанное с исходным. Превью лежит рядом как <storage_key>_thumb
    storage_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_thumbnail: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    message: Mapped["Message | None"] = relationship("Message", back_populates="attachments")
    uploader: Mapped["User"] = relationship("User")

    # Для фоновой очистки: в индекс попадают только неотправленные вложения, поэтому он маленький
    __table_args__ = (
        Index(
            "ix_attachments_unsent_created_at",
            "created_at",
            postgresql_where=text("message_id IS NULL"),
        ),
    )
