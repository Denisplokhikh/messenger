import datetime
from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.models.types import EncryptedText


class Message(Base):
    __tablename__ = "messages"

    # BigInteger защищает от переполнения счетчика сообщений
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    chat_id: Mapped[int] = mapped_column(
        ForeignKey("chats.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Хранится зашифрованным, см. EncryptedText. Длину ограничивает схема (MessageContent),
    # а не колонка: шифротекст заметно длиннее исходного текста.
    # NULL — сообщение из одних вложений. «Текст или вложения» проверяет сервис:
    # CHECK в базе не видит соседнюю таблицу attachments
    content: Mapped[str | None] = mapped_column(EncryptedText, nullable=True)

    # Дефолт на уровне и Python, и самой базы
    is_read: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )

    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    edited_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Ответ на другое сообщение того же чата. NULL — обычное сообщение.
    # SET NULL: цитата не должна мешать удалить оригинал
    reply_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL"), nullable=True, index=True
    )
    

    # Relationships
    chat: Mapped["Chat"] = relationship("Chat", back_populates="messages")
    sender: Mapped["User"] = relationship("User", back_populates="messages")
    # Многие-к-одному на себя: remote_side указывает, какая сторона «родитель»
    reply_to: Mapped["Message | None"] = relationship(
        "Message",
        remote_side=[id],
        foreign_keys=[reply_to_id],
        lazy="raise",
    )
    # Порядок по id = порядок, в котором пользователь прикрепил файлы
    attachments: Mapped[list["Attachment"]] = relationship(
        "Attachment", back_populates="message", order_by="Attachment.id"
    )

    # Составной индекс для мгновенной пагинации истории чата
    __table_args__ = (Index("idx_messages_chat_id", "chat_id", id.desc()),)
