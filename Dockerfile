# 0. Сборка React-фронтенда
FROM node:22-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 1. Базовый легковесный образ Python (та же версия, что в CI)
FROM python:3.13-slim

# 2. Отключаем буферизацию вывода Python и создание .pyc файлов во время работы.
# uv компилирует .pyc один раз при сборке образа, копирует файлы вместо хардлинков
# (кеш и .venv на разных слоях) и кладёт .venv в /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# 3. uv — менеджер зависимостей, версия зафиксирована
COPY --from=ghcr.io/astral-sh/uv:0.13.1 /uv /bin/uv

# 4. Задаем рабочую директорию внутри контейнера
WORKDIR /app

# 5. Сначала только манифесты зависимостей (для кэширования слоёв Docker).
# --frozen: ставим ровно то, что в uv.lock; --no-dev: без pytest и прочих dev-пакетов
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-cache

# 6. Копируем остальной исходный код проекта
COPY . .
COPY --from=frontend /frontend/dist ./frontend/dist

# 7. Запускаемся не от root. Папки media и attachments создаём заранее с нужным владельцем:
# новый docker volume, смонтированный в них, унаследует эти права
RUN useradd --create-home --uid 1000 app \
    && mkdir -p /app/media /app/attachments \
    && chown -R app:app /app/media /app/attachments
USER app

# 8. Указываем порт, который слушает приложение
EXPOSE 8000

# 9. В slim-образе нет curl, проверяем через стандартную библиотеку Python.
# start-period большой: на старте приложение применяет миграции
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"]

# 10. Команда запуска сервера. Один процесс uvicorn: миграции в lifespan
# при нескольких воркерах запускались бы параллельно
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
