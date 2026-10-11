from sqlalchemy import UniqueConstraint
from sqlmodel import Field

from models.base_model import BaseModel


class AlumniCount(BaseModel, table=True):
    """Registrar graduate total for one batch year and degree program.

    Reference data for response-rate analytics. It is not linked to any survey and
    holds no personal data.
    """

    __tablename__ = "alumni_counts"
    __table_args__ = (
        UniqueConstraint(
            "batch_year", "degree_program", name="uq_alumni_counts_batch_degree"
        ),
    )

    batch_year: str = Field(max_length=4, index=True, nullable=False)
    degree_program: str = Field(max_length=255, nullable=False)
    total: int = Field(nullable=False, ge=0)
