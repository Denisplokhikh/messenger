import asyncio
from datetime import datetime, timezone
import json
import logging
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.user import User
from app.schemas.ws import (
    WSAuthMessage,
    WSBaseAction,
    WSConnectionAck,
    WSErrorResponse,
    WSPingAction,
    WSPongResponse,
    WSSendMessageAction,
)
from app.services.connection_manager import manager
from app.services.message_service import MessageService
from app.utils.security import decode_access_token

logger = logging.getLogger(__name__)
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
        auth_msg = WSAuthMessage.model_validate_json(raw_auth)
        
        if not auth_msg.is_auth_message():
            user = None
        else:
            user = await authenticate_ws(auth_msg.extract_token())
    except (asyncio.TimeoutError, ValidationError, ValueError, WebSocketDisconnect):
        user = None

    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    manager.connect(user.id, websocket)

    ack = WSConnectionAck(user_id=user.id, username=user.username)
    await websocket.send_text(ack.model_dump_json())

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                base = WSBaseAction.model_validate_json(raw_data)
            except (ValidationError, ValueError):
                err = WSErrorResponse(error="Invalid JSON or missing action")
                await websocket.send_text(err.model_dump_json())
                continue

            if base.action == "ping":
                await websocket.send_text(WSPongResponse().model_dump_json())

            elif base.action == "send_message":
                try:
                    msg_action = WSSendMessageAction.model_validate_json(raw_data)
                except ValidationError as e:
                    first_err = e.errors()[0]
                    err_msg = first_err.get("msg", "Validation error")
                    err = WSErrorResponse(error=err_msg)
                    await websocket.send_text(err.model_dump_json())
                    continue

                async with AsyncSessionLocal() as session:
                    service = MessageService(session)
                    try:
                        await service.send_message(
                            chat_id=msg_action.chat_id,
                            sender=user,
                            content=msg_action.content,
                        )
                    except HTTPException as e:
                        err = WSErrorResponse(error=e.detail)
                        await websocket.send_text(err.model_dump_json())

            else:
                err = WSErrorResponse(error=f"Unknown action: {base.action}")
                await websocket.send_text(err.model_dump_json())

    except WebSocketDisconnect:
        manager.disconnect(user.id, websocket)
    except Exception as e:
        logger.exception(f"Unexpected error in WS for user {user.id}: {e}")
        manager.disconnect(user.id, websocket)


