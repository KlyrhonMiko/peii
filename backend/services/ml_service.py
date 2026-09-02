import logging
from transformers import pipeline
import json
import os
import atexit

logger = logging.getLogger(__name__)

CACHE_FILE = "ml_cache.json"
_disk_cache = {}

if os.path.exists(CACHE_FILE):
    try:
        with open(CACHE_FILE, "r") as f:
            _disk_cache = json.load(f)
    except Exception:
        pass

def save_cache():
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(_disk_cache, f)
    except Exception:
        pass

atexit.register(save_cache)

class FeedbackAnalyzer:
    _instance = None
    
    def __init__(self):
        logger.info("Initializing NLP pipelines... This may take a moment to download models.")
        try:
            self.classifier = pipeline(
                "zero-shot-classification",
                model="MoritzLaurer/mDeBERTa-v3-base-mnli-xnli"
            )
            self.sentiment = pipeline(
                "sentiment-analysis",
                model="nlptown/bert-base-multilingual-uncased-sentiment"
            )
            self._ready = True
        except Exception as e:
            logger.error(f"Failed to initialize NLP pipelines: {e}")
            self._ready = False
        
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
        
    def _analyze_cached(self, text: str) -> tuple:
        if text in _disk_cache:
            # Reconstruct tuples from JSON lists
            return tuple((k, v) for k, v in _disk_cache[text])

        if not self._ready:
            return tuple()
            
        candidate_labels = [
            "Employability and Economic Mobility",
            "Family Upliftment and Financial Stability",
            "Personal Development and Life Quality",
            "Civic Engagement and Community Contribution",
            "Government Trust and LGU Support Valuation"
        ]
        
        hypothesis_template = "This student feedback directly concerns {}."
        result = self.classifier(
            text, 
            candidate_labels, 
            hypothesis_template=hypothesis_template, 
            multi_label=True
        )
        
        detected_dimensions = []
        for label, score in zip(result['labels'], result['scores']):
            if score >= 0.45:
                clean_label = label.split(". ", 1)[-1] if ". " in label else label
                detected_dimensions.append(clean_label)
                
        if not detected_dimensions:
            return tuple()
            
        sent_result = self.sentiment(text)[0]
        stars = int(sent_result['label'].split()[0])
        polarity = (stars - 3) / 2.0
        
        result_tuple = tuple((dim, polarity) for dim in detected_dimensions)
        _disk_cache[text] = result_tuple
        
        # Periodically save if the cache grows
        if len(_disk_cache) % 20 == 0:
            save_cache()
            
        return result_tuple

    def analyze_feedback(self, text: str) -> list[tuple[str, float]]:
        return list(self._analyze_cached(text))

import asyncio
from sqlmodel import select
from models.survey_response import SurveyResponse
from models.survey_question import SurveyQuestion
from core.database import async_session_factory

async def analyze_response_background(response_id: str):
    """Background task to analyze survey response text and save to ml_sentiments column."""
    try:
        # Run pipeline in a background thread to avoid blocking the event loop
        def compute_sentiments(answers, questions):
            import time
            analyzer = FeedbackAnalyzer.get_instance()
            sentiments = {}
            for qid, ans in answers.items():
                if isinstance(ans, str) and ans.strip():
                    q = questions.get(qid)
                    if q and q.question_type == "text":
                        prompt = f"Question: {q.question_text} Answer: {ans}"
                        print(f"      -> Analyzing text: {ans[:30]}...")
                        t0 = time.time()
                        # analyzer.analyze_feedback is synchronous and blocking
                        res = analyzer.analyze_feedback(prompt)
                        t1 = time.time()
                        if res:
                            print(f"      -> Result: {res} (took {t1 - t0:.2f}s)")
                            sentiments[qid] = res
            return sentiments

        async with async_session_factory() as session:
            # Load the response
            response = await session.get(SurveyResponse, response_id)
            if not response or response.is_deleted:
                return

            # Load the questions for text mapping
            questions_result = await session.exec(
                select(SurveyQuestion).where(
                    SurveyQuestion.survey_id == response.survey_id,
                    SurveyQuestion.is_deleted.is_(False)
                )
            )
            questions = {str(q.id): q for q in questions_result.all()}
            
            # Execute the CPU-bound inference in a separate thread
            sentiments = await asyncio.to_thread(compute_sentiments, response.answers, questions)
            
            # Save back to database
            response.ml_sentiments = sentiments
            session.add(response)
            await session.commit()
            logger.info(f"Successfully computed ML sentiments for response {response_id}")
            
    except Exception as e:
        logger.error(f"Error computing background ML sentiments for {response_id}: {e}")

