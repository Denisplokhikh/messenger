<div align="center">

# InTouch

Мессенджер реального времени на **FastAPI**, **PostgreSQL** и **WebSockets**

<a href="https://intouch.plokhart.xyz">
  <img src="https://img.shields.io/badge/Открыть_мессенджер-intouch.plokhart.xyz-2563eb?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Открыть мессенджер" />
</a>

<br/><br/>

[![CI](https://github.com/Denisplokhikh/messenger/actions/workflows/ci.yml/badge.svg)](https://github.com/Denisplokhikh/messenger/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

</div>

---

## Возможности

- **Личные и групповые чаты**, поиск собеседников по имени
- **Сообщения в реальном времени** через WebSocket и индикатор «печатает…»
- **Ответы на сообщения, редактирование и удаление** своих сообщений (удалённое сообщение остаётся плашкой, текст стирается из базы)
- **История сообщений** с курсорной пагинацией (`before_id`)
- **Профили пользователей**: аватарки с обрезкой, смена пароля, публичная страница профиля
- **Шифрование сообщений в БД** (Fernet): в базе текст хранится только в зашифрованном виде
- **Безопасность**: JWT-аутентификация, хеширование паролей bcrypt, rate limiting, публичные UUID вместо числовых id в API
- **64 автотеста** и CI в GitHub Actions

## Стек

| Часть | Технологии |
|---|---|
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0 (asyncpg), Alembic, Pydantic, WebSockets, PyJWT, bcrypt, slowapi |
| База данных | PostgreSQL 16 |
| Frontend | React 18, React Router, Zustand, Tailwind CSS v4, Vite |
| Тесты и CI | pytest, pytest-asyncio, GitHub Actions |
| Инфраструктура | Docker, Docker Compose, Coolify, uv |

---

## Быстрый старт

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

### 3. Продакшн (Coolify) и CI/CD

Прод описан в `docker-compose.prod.yml`: `db` + `backend`, порты наружу не открыты, HTTPS и WebSocket проксирует Coolify.

Настройка ресурса в Coolify:
1. New Resource → репозиторий → Build Pack **Docker Compose**, файл `/docker-compose.prod.yml`.
2. У сервиса `backend` указать домен с портом: `https://chat.example.com:8000`.
3. Environment Variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `SECRET_KEY`, `MESSAGE_ENCRYPTION_KEY` (без них деплой упадёт сразу).
4. Auto Deploy выключен — деплой запускается вручную кнопкой **Deploy** в Coolify.
5. Включить бэкапы Postgres. Копию `MESSAGE_ENCRYPTION_KEY` хранить отдельно: без неё бэкап бесполезен.

CI (`.github/workflows/ci.yml`) на PR и push в `master` гоняет backend-тесты, lint + build фронтенда и сборку Docker-образа. На прод он ничего не выкатывает.

### Фронтенд (React + Vite)

Исходники лежат в `frontend/`. Нужен Node.js 20+.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, /api и WebSocket проксируются на :8000
npm run build    # сборка в frontend/dist — её отдаёт FastAPI на http://127.0.0.1:8000
npm run lint
```

В Docker фронтенд собирается автоматически (multi-stage `Dockerfile`).

---

## API

Все id в API — публичные UUID. Полная документация — в Swagger UI (`/docs`).

### Аутентификация (`/api/v1/auth`)
- `POST /api/v1/auth/register` — регистрация
- `POST /api/v1/auth/login` — получение JWT-токена
- `GET /api/v1/auth/me` — профиль текущего пользователя

### Пользователи (`/api/v1/users`)
- `GET /api/v1/users/search?query=...` — поиск собеседников по имени
- `GET /api/v1/users/me` — свой профиль
- `PATCH /api/v1/users/me` — изменить профиль
- `POST /api/v1/users/me/avatar` / `DELETE /api/v1/users/me/avatar` — загрузить / удалить аватарку
- `POST /api/v1/users/me/change-password` — сменить пароль
- `GET /api/v1/users/{user_uuid}` — публичный профиль пользователя

### Чаты (`/api/v1/chats`)
- `POST /api/v1/chats/direct` — создать личный диалог
- `POST /api/v1/chats/group` — создать групповой чат
- `GET /api/v1/chats` — список чатов текущего пользователя

### Сообщения (`/api/v1/chats/{chat_uuid}/messages`)
- `GET /api/v1/chats/{chat_uuid}/messages?limit=50&before_id=...` — история сообщений (курсорная пагинация)
- `POST /api/v1/chats/{chat_uuid}/messages` — отправка сообщения через HTTP (с рассылкой через WebSocket). Поле `reply_to_id` — ответ на сообщение того же чата
- `PATCH /api/v1/chats/{chat_uuid}/messages/{id}` — редактирование своего сообщения (меняется только текст)
- `DELETE /api/v1/chats/{chat_uuid}/messages/{id}` — удаление своего сообщения: текст стирается из базы, вложения удаляются, участники видят плашку «Сообщение удалено»

---

## WebSocket

Эндпоинт: `wss://intouch.plokhart.xyz/api/v1/ws` (локально — `ws://127.0.0.1:8000/api/v1/ws`)

### Аутентификация
Первым сообщением после подключения клиент отправляет токен:
```json
{ "type": "authenticate", "token": "<ACCESS_TOKEN>" }
```
*(Также поддерживается формат GraphQL-ws: `{"type": "connection_init", "payload": {"token": "<ACCESS_TOKEN>"}}`)*

Ответ сервера: `{"event": "connected", "type": "connection_ack", "user_id": "<uuid>", "username": "..."}`

### Отправка сообщения
```json
{ "action": "send_message", "chat_id": "<chat_uuid>", "content": "Привет! Как дела?" }
```

Все участники чата получают:
```json
{
  "event": "new_message",
  "message": {
    "id": 12,
    "chat_id": "<chat_uuid>",
    "sender_id": "<user_uuid>",
    "sender_username": "alex",
    "content": "Привет! Как дела?",
    "created_at": "2026-10-11T20:45:00.000Z"
  }
}
```

### Индикатор «печатает…»
Клиент, пока пользователь набирает текст, раз в несколько секунд шлёт:
```json
{ "action": "typing", "chat_id": "<chat_uuid>" }
```
Остальные участники получают `{"event": "typing", "chat_id": "...", "user_id": "...", "username": "..."}`. Отдельного события «перестал печатать» нет — клиент гасит индикатор сам, если новых `typing` долго не приходило.

### Редактирование и удаление
Автор правит и удаляет сообщения через HTTP (`PATCH` / `DELETE`), остальные участники получают события:
```json
{ "event": "message_edited", "message_id": 12, "chat_id": "<chat_uuid>", "content": "Новый текст", "edited_at": "..." }
{ "event": "message_deleted", "message_id": 12, "chat_id": "<chat_uuid>", "deleted_at": "..." }
```

### Heartbeat
Отправка: `{"action": "ping"}` → ответ: `{"event": "pong"}`
