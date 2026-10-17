import asyncio
from collections import defaultdict
import json
import uuid
from fastapi import WebSocket


class ConnectionManager:
    """Управляет активными WebSocket-соединениями пользователей (ключ — публичный uuid)."""

    def __init__(self):
        self.active_connections: dict[uuid.UUID, set[WebSocket]] = defaultdict(set)

    def connect(self, user_id: uuid.UUID, websocket: WebSocket):
        self.active_connections[user_id].add(websocket)

    def disconnect(self, user_id: uuid.UUID, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def _send_to_socket(self, websocket: WebSocket, user_id: uuid.UUID, raw_text: str):
        """Отправка в конкретный сокет с удалением при сбое."""
        try:
            await websocket.send_text(raw_text)
        except Exception:
            self.disconnect(user_id, websocket)

    async def send_personal_message(
        self, message: dict, user_id: uuid.UUID, raw_text: str | None = None
    ):
        """Параллельная отправка сообщения на все активные устройства пользователя."""
        connections = list(self.active_connections.get(user_id, []))
        if not connections:
            return

        payload = raw_text if raw_text is not None else json.dumps(message)

        # Отправляем на все устройства юзера параллельно
        await asyncio.gather(
            *(self._send_to_socket(conn, user_id, payload) for conn in connections),
            return_exceptions=True
        )

    async def broadcast_to_users(self, message: dict, user_ids: list[uuid.UUID]):
        """Рассылка по списку юзеров с однократной сериализацией JSON."""
        # Сериализуем один раз для всех получателей
        raw_text = json.dumps(message)

        tasks = [
            self.send_personal_message(message, uid, raw_text=raw_text)
            for uid in user_ids
            if uid in self.active_connections
        ]

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


manager = ConnectionManager()
