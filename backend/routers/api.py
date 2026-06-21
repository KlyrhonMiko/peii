from fastapi import APIRouter

from routers.audit_logs import router as audit_logs_router
from routers.health import router as health_router
from routers.users import router as users_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(audit_logs_router, prefix="/audit-logs", tags=["audit-logs"])
