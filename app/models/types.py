from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.utils.security import decrypt_text, encrypt_text


class EncryptedText(TypeDecorator):
    """Текст, который хранится в БД зашифрованным (Fernet).

    Шифруется при записи и расшифровывается при чтении автоматически,
    поэтому остальной код работает с обычными строками.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_text(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_text(value)
