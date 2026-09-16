from pydantic import BaseModel, ConfigDict, Field

from schemas.survey_analytics import SurveyResponseAggregate


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
    model_config = ConfigDict(extra="forbid")

    total_responses: int
    gender_distribution: dict[str, int]
    location_distribution: dict[str, int]
    department_distribution: dict[str, int]
    first_gen_distribution: dict[str, int] | None = None
    barangay_distribution: dict[str, int] | None = None


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
    is_placeholder: bool = False


class PEIIOutcomeDistributions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employment_stability: SurveyResponseAggregate | None = None
    degree_alignment: SurveyResponseAggregate | None = None
    monthly_income: SurveyResponseAggregate | None = None
    time_to_first_job: SurveyResponseAggregate | None = None
    job_search_channel: SurveyResponseAggregate | None = None
    employment_status: SurveyResponseAggregate | None = None
    employment_type: SurveyResponseAggregate | None = None
    job_level: SurveyResponseAggregate | None = None
    job_search_difficulty: SurveyResponseAggregate | None = None
    work_location: SurveyResponseAggregate | None = None
    top_industries: SurveyResponseAggregate | None = None


class PEIIAnalyticsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outcome_distributions: PEIIOutcomeDistributions = Field(
        default_factory=PEIIOutcomeDistributions
    )
    cohort_result: PEIICohortResult
    baseline_result: PEIICohortResult | None = None
    historical_trend: list[PEIIHistoricalTrend] = []
    demographics: PEIIDemographics | None = None
    feedback_classification: FeedbackClassificationData | None = None
    qualitative_feedback: list[QualitativeFeedback] = []
    qualitative_feedback_total: int
    qualitative_feedback_truncated: bool
    qualitative_feedback_placeholder_count: int = 0
