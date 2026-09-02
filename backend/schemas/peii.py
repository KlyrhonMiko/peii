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


class SentimentDivergenceTier(BaseModel):
    tier: str
    alignment: int
    divergence: int


class SentimentDivergenceData(BaseModel):
    tiers: list[SentimentDivergenceTier]


class PEIIAnalyticsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cohort_result: PEIICohortResult
    baseline_result: PEIICohortResult | None = None
    demographics: PEIIDemographics | None = None
    sentiment_divergence: SentimentDivergenceData | None = None
