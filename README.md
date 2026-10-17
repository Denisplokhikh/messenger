# FastAPI Messenger 

Мессенджер на **FastAPI**, **PostgreSQL** (SQLAlchemy 2.0 + asyncpg) и **WebSockets**.

---

##  Быстрый старт

### 1. Зависимости (uv)
Зависимости описаны в `pyproject.toml`, точные версии зафиксированы в `uv.lock`. Нужен [uv](https://docs.astral.sh/uv/):

```bash
# Windows (PowerShell)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
# Linux / macOS
curl -LsSf https://astral.sh/uv/install.sh | sh
```

```bash
uv sync                     # создаёт .venv и ставит всё, включая dev-группу (pytest, httpx)
uv run pytest -v            # тесты (нужен запущенный Postgres, см. ниже)
uv add <пакет>              # новая зависимость → обновит pyproject.toml и uv.lock
uv add --dev <пакет>        # dev-зависимость
```

После ручной правки `pyproject.toml` выполните `uv lock` и закоммитьте `uv.lock` — CI ставит зависимости с `--frozen` и упадёт, если lock-файл устарел.

---

### 2. Запуск через Docker (dev)

```bash
cp .env.example .env        # и заполните MESSAGE_ENCRYPTION_KEY
docker compose up -d --build
```

- Приложение: **http://127.0.0.1:8000** (код из `./app` подхватывается без пересборки, `--reload`)
- Swagger UI: **http://127.0.0.1:8000/docs**, ReDoc: **http://127.0.0.1:8000/redoc**
- Adminer: **http://127.0.0.1:8080** (сервер `db`)
- Postgres: `127.0.0.1:5432`, креды из `.env`

Все порты слушают только `127.0.0.1`.

---

### 3. Продакшн (Coolify) и CI/CD

Прод описан в `docker-compose.prod.yml`: `db` + `backend`, порты наружу не открыты, HTTPS и WebSocket проксирует Coolify.

Настройка ресурса в Coolify:
1. New Resource → репозиторий → Build Pack **Docker Compose**, файл `/docker-compose.prod.yml`.
2. У сервиса `backend` указать домен с портом: `https://chat.example.com:8000`.
3. Environment Variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `SECRET_KEY`, `MESSAGE_ENCRYPTION_KEY` (без них деплой упадёт сразу).
4. Auto Deploy выключен — деплой запускается вручную кнопкой **Deploy** в Coolify.
5. Включить бэкапы Postgres. Копию `MESSAGE_ENCRYPTION_KEY` хранить отдельно: без неё бэкап бесполезен.

CI (`.github/workflows/ci.yml`) на PR и push в `master` гоняет backend-тесты, lint + build фронтенда и сборку Docker-образа. На прод он ничего не выкатывает.

---

## Фронтенд (React + Vite)

Исходники лежат в `frontend/` (React 18, react-router, zustand, Tailwind CSS v4). Нужен Node.js 20+.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, /api и WebSocket проксируются на :8000
npm run build    # сборка в frontend/dist — её отдаёт FastAPI на http://127.0.0.1:8000
npm run lint
```

В Docker фронтенд собирается автоматически (multi-stage `Dockerfile`).

---

## Основные эндпоинты

### Аутентификация (`/api/v1/auth`)
- `POST /api/v1/auth/register` — регистрация нового пользователя
- `POST /api/v1/auth/login` — получение JWT токена
- `GET /api/v1/auth/me` — профиль текущего пользователя

### Пользователи (`/api/v1/users`)
- `GET /api/v1/users/search?query=...` — поиск собеседников по имени
- `GET /api/v1/users/{user_id}` — информация о пользователе

### Чаты (`/api/v1/chats`)
- `POST /api/v1/chats/direct` — создать личный диалог с пользователем
- `POST /api/v1/chats/group` — создать групповой чат
- `GET /api/v1/chats` — список всех чатов текущего пользователя

### Сообщения (`/api/v1/chats/{chat_id}/messages`)
- `GET /api/v1/chats/{chat_id}/messages` — история сообщений чата с пагинацией
- `POST /api/v1/chats/{chat_id}/messages` — отправка сообщения через HTTP (с рассылкой через WebSocket)

---

##  WebSocket подключение в реальном времени

Эндпоинт: `ws://127.0.0.1:8000/api/v1/ws`

### Аутентификация:
После открытия соединения клиент отправляет первым сообщением пакет авторизации:
```json
{
  "type": "authenticate",
  "token": "<ACCESS_TOKEN>"
}
```
*(Также поддерживается формат GraphQL-ws: `{"type": "connection_init", "payload": {"token": "<ACCESS_TOKEN>"}}`)*.  
При успешной проверке токена сервер возвращает событие `{"event": "connected", "type": "connection_ack", "user_id": 1, ...}`.

### Пример отправки сообщения через WebSocket:
```json
{
  "action": "send_message",
  "chat_id": 1,
  "content": "Привет! Как дела?"
}
```

### Формат входящего события для всех участников чата:
```json
{
  "event": "new_message",
  "message": {
    "id": 12,
    "chat_id": 1,
    "sender_id": 2,
    "sender_username": "alex",
    "content": "Привет! Как дела?",
    "created_at": "2026-10-11T20:45:00.000Z"
  }
}
```

### Heartbeat (проверка связи):
Отправка: `{"action": "ping"}`  
Ответ: `{"event": "pong"}`
