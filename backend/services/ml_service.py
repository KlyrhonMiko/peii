import logging

import langdetect
import re
from fastapi import HTTPException
from transformers import pipeline

from schemas.ml import SentimentResponse

logger = logging.getLogger(__name__)

# Models
TL_MODEL_ID = "dost-asti/RoBERTa-tl-sentiment-analysis"
EN_MODEL_ID = "distilbert-base-uncased-finetuned-sst-2-english"

# Global pipeline variables
tl_pipeline = None
en_pipeline = None

def get_pipelines():
    global tl_pipeline, en_pipeline
    
    if tl_pipeline is None:
        logger.info(f"Loading Tagalog model {TL_MODEL_ID}. This may take a moment...")
        try:
            tl_pipeline = pipeline("sentiment-analysis", model=TL_MODEL_ID, tokenizer=TL_MODEL_ID)
        except Exception as e:
            logger.error(f"Failed to load Tagalog model {TL_MODEL_ID}: {e}")
            raise RuntimeError(f"Failed to load Tagalog ML model: {e}")
            
    if en_pipeline is None:
        logger.info(f"Loading English model {EN_MODEL_ID}. This may take a moment...")
        try:
            en_pipeline = pipeline("sentiment-analysis", model=EN_MODEL_ID, tokenizer=EN_MODEL_ID)
        except Exception as e:
            logger.error(f"Failed to load English model {EN_MODEL_ID}: {e}")
            raise RuntimeError(f"Failed to load English ML model: {e}")
            
    return tl_pipeline, en_pipeline

def get_models() -> list[dict]:
    return [
        {
            "id": TL_MODEL_ID,
            "name": "Tagalog Sentiment Analyzer (RoBERTa)",
            "type": "sentiment-analysis",
            "description": "Fine-tuned RoBERTa model for sentiment analysis on Tagalog and Taglish text."
        },
        {
            "id": EN_MODEL_ID,
            "name": "English Sentiment Analyzer (DistilBERT)",
            "type": "sentiment-analysis",
            "description": "DistilBERT model fine-tuned on SST-2 for English sentiment analysis."
        },
        {
            "id": "rf-placeholder",
            "name": "Random Forest Predictor",
            "type": "predictive-modeling",
            "description": "Placeholder for the upcoming Random Forest model."
        }
    ]


async def analyze_sentiment(text: str, requested_model: str | None = None) -> SentimentResponse:
    try:
        # 1. Get the pipelines
        tl_pipe, en_pipe = get_pipelines()
        
        # 2. Heuristic Language Detection for Taglish
        # Common Tagalog words and particles used in Taglish
        tagalog_keywords = {
            "ang", "ng", "mga", "sa", "ako", "ito", "yan", "lang", "pa", "na", 
            "ba", "daw", "din", "rin", "naman", "po", "medyo", "pangit", "ganda", 
            "sobra", "talaga", "kaya", "bakit", "ano", "sino", "saan", "kailan", 
            "paano", "hindi", "oo", "wala", "meron", "may", "masaya", "malungkot",
            "nakakainis", "nakakabagot", "naman", "niya", "niyo", "nila", "namin",
            "tayo", "kami", "kayo", "sila", "ko", "mo", "ni", "si"
        }
        
        words = set(re.findall(r'\b\w+\b', text.lower()))
        has_tagalog = any(word in tagalog_keywords for word in words)
        
        active_model = TL_MODEL_ID
        
        if requested_model == EN_MODEL_ID:
            # Manual override if provided
            active_model = EN_MODEL_ID
        elif requested_model == TL_MODEL_ID:
            active_model = TL_MODEL_ID
        else:
            # Automatic routing
            if has_tagalog:
                active_model = TL_MODEL_ID
            else:
                try:
                    lang = langdetect.detect(text)
                    if lang == "en":
                        active_model = EN_MODEL_ID
                except langdetect.lang_detect_exception.LangDetectException:
                    pass

        if active_model == EN_MODEL_ID:
            logger.info(f"Routing to English model: {EN_MODEL_ID}")
            results = en_pipe(text)
        else:
            logger.info(f"Routing to default Tagalog model: {TL_MODEL_ID}")
            results = tl_pipe(text)
        
        if not results or len(results) == 0:
             raise HTTPException(status_code=500, detail="Model returned no predictions.")
             
        prediction = results[0]
        raw_label = prediction.get("label", "UNKNOWN").upper()
        score = prediction.get("score", 0.0)
        
        # 3. Standardize label output
        label = "NEUTRAL"
        if raw_label in ["POSITIVE", "POS", "LABEL_1"]:
            label = "POSITIVE"
        elif raw_label in ["NEGATIVE", "NEG", "LABEL_0"]:
            label = "NEGATIVE"
        elif raw_label in ["NEUTRAL", "NEU", "LABEL_2"]:
            label = "NEUTRAL"
            
        # DistilBERT SST-2 outputs POSITIVE/NEGATIVE natively.
        
        # 4. Calculate signed sentiment score (-1.0 to 1.0)
        sentiment_score = 0.0
        if label == "POSITIVE":
            sentiment_score = score
        elif label == "NEGATIVE":
            sentiment_score = -score
            
        return SentimentResponse(
            label=label, 
            score=score,
            sentiment_score=sentiment_score,
            model=active_model
        )

    except Exception as e:
        logger.error(f"Error during sentiment analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Local inference failed: {str(e)}")
