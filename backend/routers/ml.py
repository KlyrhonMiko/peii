from fastapi import APIRouter

from core.responses import success_response
from schemas.common import APIResponse
from schemas.ml import ModelInfo, SentimentRequest, SentimentResponse
from services import ml_service

router = APIRouter()

@router.post("/sentiment", response_model=APIResponse[SentimentResponse])
async def analyze_sentiment(request: SentimentRequest):
    """
    Analyzes the sentiment of a given Tagalog text using the local Hugging Face model.
    """
    prediction = await ml_service.analyze_sentiment(request.text, request.model)
    
    return success_response(
        data=prediction,
        message="Sentiment analysis completed successfully."
    )

@router.get("/models", response_model=APIResponse[list[ModelInfo]])
async def list_models():
    """
    Returns a list of ML models available in the system.
    """
    models = ml_service.get_models()
    return success_response(
        data=models,
        message="Models retrieved successfully."
    )
