from datetime import timedelta
from app.utils.security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)


def test_password_hashing():
    raw_password = "my_secret_password_123"
    hashed = get_password_hash(raw_password)

    # Хеш не должен совпадать с исходным паролем
    assert hashed != raw_password
    # Проверка правильного пароля должна возвращать True
    assert verify_password(raw_password, hashed) is True
    # Проверка неверного пароля должна возвращать False
    assert verify_password("wrong_password", hashed) is False


def test_access_token_create_and_decode():
    user_id = 42
    token = create_access_token(subject=user_id)

    payload = decode_access_token(token)
    assert payload is not None
    # sub в JWT всегда строка
    assert payload.get("sub") == str(user_id)
    assert "exp" in payload


def test_access_token_expired():
    # Создаем заведомо просроченный токен (истёк 5 минут назад)
    expired_token = create_access_token(
        subject=99,
        expires_delta=timedelta(minutes=-5)
    )

    payload = decode_access_token(expired_token)
    # Просроченный токен должен вернуть None
    assert payload is None


def test_decode_invalid_token():
    payload = decode_access_token("not.a.valid.jwt.token")
    assert payload is None
