import asyncio
from datetime import datetime, timezone
import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models.chat import Chat
from app.models.chat_participant import ChatParticipant
from app.models.message import Message
from app.models.user import User
from app.services.connection_manager import manager
from app.utils.security import decode_access_token

router = APIRouter(tags=["WebSocket"])


async def authenticate_ws(token: str | None) -> User | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        return None
    try:
        user_id = int(payload["sub"])
    except ValueError:
        return None

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user and user.is_active:
            return user
    return None


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
):
    await websocket.accept()

    # Ожидаем пакет авторизации первым сообщением с таймаутом
    user = None
    try:
        raw_auth = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        auth_data = json.loads(raw_auth)

        token = None
        if isinstance(auth_data, dict):
            # Поддержка стандартов GraphQL-ws (connection_init) и прямого события authenticate/auth
            msg_type = auth_data.get("type") or auth_data.get("action")
            if msg_type in ("authenticate", "auth", "connection_init"):
                payload = auth_data.get("payload")
                if isinstance(payload, dict) and "token" in payload:
                    token = payload.get("token")
                else:
                    token = auth_data.get("token")

        user = await authenticate_ws(token)
    except (asyncio.TimeoutError, json.JSONDecodeError, WebSocketDisconnect):
        user = None

    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    manager.connect(user.id, websocket)

    # Уведомляем клиента об успешном подключении и готовности к работе
    await websocket.send_json({
        "event": "connected",
        "type": "connection_ack",
        "user_id": user.id,
        "username": user.username,
    })

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON format"})
                continue

            action = data.get("action")

            if action == "ping":
                await websocket.send_json({"event": "pong"})

            elif action == "send_message":
                chat_id = data.get("chat_id")
                content = data.get("content", "").strip()

                if not chat_id or not content:
                    await websocket.send_json({"error": "chat_id and non-empty content required"})
                    continue

                async with AsyncSessionLocal() as session:
                    # Verify user is in chat
                    stmt = (
                        select(Chat)
                        .join(ChatParticipant)
                        .where(Chat.id == chat_id, ChatParticipant.user_id == user.id)
                        .options(selectinload(Chat.participants))
                    )
                    res = await session.execute(stmt)
                    chat = res.scalar_one_or_none()

                    if not chat:
                        await websocket.send_json({"error": "Chat not found or access denied"})
                        continue

                    new_message = Message(
                        chat_id=chat_id,
                        sender_id=user.id,
                        content=content,
                    )
                    session.add(new_message)
                    await session.commit()
                    await session.refresh(new_message)

                    msg_payload = {
                        "event": "new_message",
                        "message": {
                            "id": new_message.id,
                            "chat_id": chat_id,
                            "sender_id": user.id,
                            "sender_username": user.username,
                            "content": content,
                            "created_at": new_message.created_at.isoformat(),
                        },
                    }

                    # Send to all participants
                    participant_ids = [p.user_id for p in chat.participants]
                    await manager.broadcast_to_users(msg_payload, participant_ids)

            else:
                await websocket.send_json({"error": f"Unknown action: {action}"})

    except WebSocketDisconnect:
        manager.disconnect(user.id, websocket)
    except Exception:
        manager.disconnect(user.id, websocket)
