import asyncio
import json
import logging
import sys
from pathlib import Path
import random

# Ensure Python can find the core and models folders
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import select
from core.database import async_session_factory
from models.survey_response import SurveyResponse
from models.survey_question import SurveyQuestion
from models.false_positive_feedback import FalsePositiveFeedback
from services.survey_analytics_service import _is_placeholder
from services.ml_service import _classify_intent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def export_dataset():
    out_file = Path(__file__).resolve().parent.parent / "data" / "ml_dataset_v1.jsonl"
    out_file.parent.mkdir(exist_ok=True)
    
    async with async_session_factory() as session:
        logger.info("Fetching all survey questions...")
        questions = (await session.exec(select(SurveyQuestion))).all()
        question_map = {str(q.id): q for q in questions}
        
        logger.info("Fetching false positive feedbacks...")
        fps = (await session.exec(select(FalsePositiveFeedback))).all()
        fp_map = {(str(fp.response_id), str(fp.question_id)): fp.polarity_override for fp in fps}
        
        logger.info("Fetching survey responses...")
        responses = (await session.exec(
            select(SurveyResponse).where(SurveyResponse.is_deleted == False)
        )).all()
        
        dataset = []
        
        for response in responses:
            if not response.answers:
                continue
                
            for q_id_str, ans in response.answers.items():
                if not isinstance(ans, str) or not ans.strip():
                    continue
                    
                if _is_placeholder(ans):
                    continue
                    
                q = question_map.get(q_id_str)
                if not q or q.question_type != "text":
                    continue
                    
                q_text_lower = q.question_text.lower()
                if any(kw in q_text_lower for kw in ["email", "name", "number"]):
                    continue
                
                # Determine ground truth polarity
                polarity = None
                is_override = False
                
                override = fp_map.get((str(response.id), q_id_str))
                if override is not None:
                    polarity = override
                    is_override = True
                else:
                    # Accept high-confidence predictions vetted by cross-check heuristics
                    # Extract from ml_sentiments if available
                    if response.ml_sentiments and q_id_str in response.ml_sentiments:
                        ml_res = response.ml_sentiments[q_id_str]
                        if ml_res and len(ml_res) > 0:
                            # ml_res is a list of [dimension, polarity] or tuple (dimension, polarity)
                            # they all should have the same polarity in the current logic
                            polarity = ml_res[0][1] if isinstance(ml_res[0], (list, tuple)) else None
                
                if polarity is None:
                    continue
                
                label_sentiment = "NEUTRAL"
                if polarity > 0:
                    label_sentiment = "POSITIVE"
                elif polarity < 0:
                    label_sentiment = "NEGATIVE"
                    
                # Extract dimensions
                dimensions = []
                if response.ml_sentiments and q_id_str in response.ml_sentiments:
                    ml_res = response.ml_sentiments[q_id_str]
                    if ml_res:
                        dimensions = [item[0] for item in ml_res if isinstance(item, (list, tuple))]
                
                intent = _classify_intent(ans, q.question_text)
                
                # Format intent-conditioned input: 
                # Context: {intent}. Question: {q.question_text} \n Answer: {ans}
                
                dataset.append({
                    "response_id": str(response.id),
                    "question_id": q_id_str,
                    "question_text": q.question_text,
                    "question_intent": intent,
                    "response_text": ans,
                    "label_sentiment": label_sentiment,
                    "polarity": polarity,
                    "dimensions": dimensions,
                    "is_human_override": is_override
                })
        
        logger.info(f"Extracted {len(dataset)} valid records.")
        
        # Shuffle and split 80/10/10
        random.seed(42)
        random.shuffle(dataset)
        
        n = len(dataset)
        train_end = int(n * 0.8)
        val_end = int(n * 0.9)
        
        splits = {
            "train": dataset[:train_end],
            "val": dataset[train_end:val_end],
            "test": dataset[val_end:]
        }
        
        for split_name, data in splits.items():
            split_file = out_file.with_name(f"ml_dataset_v1_{split_name}.jsonl")
            with open(split_file, "w", encoding="utf-8") as f:
                for item in data:
                    f.write(json.dumps(item) + "\n")
            logger.info(f"Saved {len(data)} records to {split_file}")
            
        with open(out_file, "w", encoding="utf-8") as f:
            for item in dataset:
                f.write(json.dumps(item) + "\n")
        logger.info(f"Saved complete dataset to {out_file}")

if __name__ == "__main__":
    asyncio.run(export_dataset())
