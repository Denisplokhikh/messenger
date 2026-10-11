from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.chats import router as chats_router
from app.api.v1.messages import router as messages_router
from app.api.v1.users import router as users_router
from app.api.v1.ws import router as ws_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(auth_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(chats_router)
api_v1_router.include_router(messages_router)
api_v1_router.include_router(ws_router)
