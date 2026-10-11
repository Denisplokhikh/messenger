from collections import defaultdict
from fastapi import WebSocket
import json


class ConnectionManager:
    """Manages active WebSocket connections per user ID."""

    def __init__(self):
        # Maps user_id -> set of active WebSockets (allows multiple tabs/devices)
        self.active_connections: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            dead_connections = set()
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    dead_connections.add(connection)
            for dead in dead_connections:
                self.disconnect(user_id, dead)

    async def broadcast_to_users(self, message: dict, user_ids: list[int]):
        for user_id in user_ids:
            await self.send_personal_message(message, user_id)


manager = ConnectionManager()
