from pydantic import BaseModel, Field


class SentimentRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=1000, description="The text to analyze")
    model: str | None = Field(None, description="The specific model ID to use for inference")


class SentimentResponse(BaseModel):
    label: str = Field(
        ...,
        description="The predicted sentiment label (e.g. POSITIVE, NEGATIVE, NEUTRAL)"
    )
    score: float = Field(..., description="The confidence score of the prediction (0 to 1)")
    sentiment_score: float = Field(
        ...,
        description=(
            "A signed score from -1.0 to 1.0 representing negative to positive sentiment"
        )
    )
    model: str = Field(..., description="The name of the model used to analyze the sentiment")


class ModelInfo(BaseModel):
    id: str = Field(..., description="The unique identifier of the model")
    name: str = Field(..., description="The human-readable name of the model")
    type: str = Field(..., description="The type/purpose of the model (e.g. sentiment-analysis)")
    description: str = Field(..., description="A brief description of the model's capabilities")
