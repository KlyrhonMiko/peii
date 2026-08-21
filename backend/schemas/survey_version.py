from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class SurveyVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    survey_id: UUID
    version_id: str
    version_number: int
    status: str
    structure_revision: int
    published_at: datetime | None = None
