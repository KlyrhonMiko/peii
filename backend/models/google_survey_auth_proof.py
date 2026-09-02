from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint
from sqlmodel import Field, SQLModel


class GoogleSurveyAuthProof(SQLModel, table=True):
    """Short-lived, server-attested Google identity bound to one Supabase session."""

    __tablename__ = "google_survey_auth_proofs"
    __table_args__ = (
        CheckConstraint(
            "expires_at > authenticated_at",
            name="ck_google_survey_auth_proofs_expiry_after_authentication",
        ),
    )

    session_id: UUID = Field(primary_key=True, nullable=False)
    auth_user_id: UUID = Field(index=True, nullable=False)
    google_subject_digest: str = Field(max_length=64, nullable=False)
    verified_email: str = Field(max_length=320, nullable=False)
    display_name: str | None = Field(default=None, max_length=255, nullable=True)
    email_verified: bool = Field(nullable=False)
    authenticated_at: datetime = Field(nullable=False)
    expires_at: datetime = Field(index=True, nullable=False)
