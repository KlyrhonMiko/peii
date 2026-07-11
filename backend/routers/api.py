from fastapi import APIRouter

from routers.audit_logs import router as audit_logs_router
from routers.health import router as health_router
from routers.survey_distributions import router as survey_distributions_router
from routers.survey_public import router as survey_public_router
from routers.survey_questions import router as survey_questions_router
from routers.survey_sections import router as survey_sections_router
from routers.surveys import router as surveys_router
from routers.users import router as users_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(audit_logs_router, prefix="/audit-logs", tags=["audit-logs"])
api_router.include_router(surveys_router, prefix="/surveys", tags=["surveys"])
api_router.include_router(
    survey_questions_router,
    prefix="/surveys/{survey_id}/questions",
    tags=["survey-questions"],
)
api_router.include_router(
    survey_distributions_router,
    prefix="/surveys/{survey_id}/distributions",
    tags=["survey-distributions"],
)
api_router.include_router(
    survey_sections_router,
    prefix="/surveys/{survey_id}/sections",
    tags=["survey-sections"],
)
api_router.include_router(survey_public_router, prefix="/survey", tags=["survey-public"])
