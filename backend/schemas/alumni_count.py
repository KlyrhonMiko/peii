from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

MAX_ALUMNI_COUNT_ROWS = 500


class AlumniCountEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batch_year: str = Field(pattern=r"^\d{4}$")
    degree_program: str = Field(min_length=1, max_length=255)
    total: int = Field(ge=0, le=1_000_000)


class AlumniCountReplace(BaseModel):
    """Full set of graduate totals. Rows missing from the payload are removed."""

    model_config = ConfigDict(extra="forbid")

    counts: list[AlumniCountEntry] = Field(max_length=MAX_ALUMNI_COUNT_ROWS)


class AlumniCountRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    batch_year: str
    degree_program: str
    total: int
    updated_at: datetime


class AlumniTotalRead(BaseModel):
    """Graduate total matching the dashboard filters.

    ``alumni_total`` is ``None`` when no stored count covers the filters, so the
    dashboard can hide the response rate instead of showing a false 0%.
    """

    model_config = ConfigDict(extra="forbid")

    alumni_total: int | None
    by_batch: dict[str, int]
    # Totals per batch, then per college, so the dashboard can leave out batches that
    # have no survey responses before it sums a college's alumni.
    by_batch_college: dict[str, dict[str, int]]
    batch: str | None
    department: str | None
    degree: str | None
