# FastAPI Messenger 

Мессенджер на **FastAPI**, **PostgreSQL** (SQLAlchemy 2.0 + asyncpg) и **WebSockets**.

---

##  Быстрый старт

### 1. Клонирование и настройка окружения
Создайте и активируйте виртуальное окружение:

```bash
# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

Установите зависимости:
```bash
pip install -r requirements.txt
```

---

### 2. Запуск через Docker

```bash
docker compose up -d
```
База данных `messenger_db` запустится на `localhost:5432` с пользователем `postgres` и паролем `postgres`.

Параметры подключения заданы в файле `.env`.

---

Приложение будет доступно по адресу: **http://127.0.0.1:8000**
- Интерактивная документация Swagger UI: **http://127.0.0.1:8000/docs**
- Альтернативная документация ReDoc: **http://127.0.0.1:8000/redoc**

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
