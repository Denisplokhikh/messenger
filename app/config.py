from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "FastAPI Messenger"
    DEBUG: bool = True

    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "messenger_db"

    # Security & JWT
    SECRET_KEY: str = "supersecretjwtsecretkeyreplaceinproduction987654321"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    # Ключ Fernet для шифрования сообщений в БД. Дефолта нет специально:
    # без ключа приложение не стартует, а потеря ключа = потеря всех сообщений.
    MESSAGE_ENCRYPTION_KEY: str

    # Загруженные пользователями файлы (аватарки), раздаются по /media
    MEDIA_DIR: Path = Path(__file__).resolve().parent.parent / "media"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )


settings = Settings()
