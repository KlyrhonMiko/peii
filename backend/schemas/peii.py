from pydantic import BaseModel, ConfigDict


class PEIIDomainScore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dimension: str
    pre_grad: float
    post_grad: float


class PEIICohortResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batch_year: str
    domains: list[PEIIDomainScore]
    peii_score: float
    peii_index: float | None = None  # None if no baseline to compare to


class PEIIDemographics(BaseModel):
    total_responses: int
    gender_distribution: dict[str, int]
    location_distribution: dict[str, int]
    department_distribution: dict[str, int]


class FeedbackClassification(BaseModel):
    dimension: str
    positive: int
    neutral: int
    negative: int


class FeedbackClassificationData(BaseModel):
    classifications: list[FeedbackClassification]


class PEIIHistoricalTrend(BaseModel):
    model_config = ConfigDict(extra="forbid")

    batch_year: str
    peii_score: float
    domains: list[PEIIDomainScore] = []


class QualitativeFeedback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    response_id: str
    question_id: str
    question_text: str
    response_text: str
    sentiment_score: float
    is_false_positive: bool = False
    dimension: str | None = None


class PEIIAnalyticsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cohort_result: PEIICohortResult
    baseline_result: PEIICohortResult | None = None
    historical_trend: list[PEIIHistoricalTrend] = []
    demographics: PEIIDemographics | None = None
    feedback_classification: FeedbackClassificationData | None = None
    qualitative_feedback: list[QualitativeFeedback] = []
