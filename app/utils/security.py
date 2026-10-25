from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import time
from typing import Any
import uuid
import bcrypt
import jwt
from cryptography.fernet import Fernet

from app.config import settings

# Создаётся при импорте: неверный ключ в .env сразу роняет старт приложения
_fernet = Fernet(settings.MESSAGE_ENCRYPTION_KEY)


def encrypt_text(plain: str) -> str:
    return _fernet.encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_text(token: str) -> str:
    return _fernet.decrypt(token.encode("utf-8")).decode("utf-8")


def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(pwd_bytes, hashed_bytes)


def create_access_token(
    subject: str | Any, expires_delta: timedelta | None = None
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except jwt.PyJWTError:
        return None


def sign_attachment(attachment_uuid: uuid.UUID, variant: str, exp: int) -> str:
    # Префикс attachment: отделяет эти подписи от любых других, сделанных тем же ключом
    message = f"attachment:{attachment_uuid}:{variant}:{exp}"
    return hmac.new(settings.SECRET_KEY.encode(), message.encode(), hashlib.sha256).hexdigest()


def verify_attachment_signature(attachment_uuid: uuid.UUID, variant: str, exp: int, sig: str) -> bool:
    if exp < int(time.time()):
        return False
    expected = sign_attachment(attachment_uuid, variant, exp)
    # compare_digest сравнивает за одинаковое время: по скорости ответа нельзя подбирать подпись посимвольно
    return hmac.compare_digest(expected, sig)


ATTACHMENT_URL_INTERVAL = 12 * 60 * 60  # 12 часов
ATTACHMENT_URL_LIFETIME = 24 * 60 * 60  # 24 часа


def attachment_expiry() -> int:
    """Срок действия для новых ссылок на вложения (unix-время).

    Отсчитывается от начала текущего 12-часового интервала, а не от «сейчас»: в течение интервала
    ссылки на один и тот же файл одинаковые, и браузер берёт картинку из кеша, а не качает заново.
    Любая выданная ссылка живёт от 12 до 24 часов.
    """
    now = int(time.time())
    interval_start = now // ATTACHMENT_URL_INTERVAL * ATTACHMENT_URL_INTERVAL
    return interval_start + ATTACHMENT_URL_LIFETIME
    