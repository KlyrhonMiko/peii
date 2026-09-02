import logging
import re
import torch
from transformers import pipeline
import json
import os
import atexit

logger = logging.getLogger(__name__)

CACHE_FILE = "ml_cache.json"
# Bump this version whenever the scoring/calibration logic changes.
# The loader will auto-migrate older caches to the new version.
CACHE_VERSION = 2

# ---------------------------------------------------------------------------
# Intent detection — Tagalog + English regex patterns
# ---------------------------------------------------------------------------

# Signals that an answer is a constructive suggestion / improvement request
_SUGGESTION_RE = re.compile(
    r"\b(sana|gusto\s+ko|hopefully|suggestion\s+ko|para\s+sa\s+akin|"
    r"tingin\s+ko|i\s+wish|kailangan|paki[-\s]|mas\s+pagtuunan|"
    r"mag[-\s]?focus|i[-\s]?update|magkaroon|na\s+i-improve|"
    r"sana\s+po|sana\s+sa\s+susunod|wish\s+(?:ko|namin|natin)|"
    r"dapat|more\s+focus|focus\s+on|improve|tinuturo|mas\s+tinuturo)\b",
    re.IGNORECASE,
)

# Signals that an answer expresses gratitude / life-changing impact
_GRATITUDE_RE = re.compile(
    r"\b(salamat|thankful|appreciated|pasasalamat|god\s*bless|"
    r"changed\s+my\s+life|natutulungan|tuloy[-\s]tuloy|nagpapasalamat|"
    r"maraming\s+salamat|malaki\s+ang|blessing|grateful)\b",
    re.IGNORECASE,
)

# Genuine negative signals (complaints, dissatisfaction)
_NEGATIVE_RE = re.compile(
    r"\b(masama|mahirap|hindi\s+maganda|malala|problema|disappointing|"
    r"frustrated|inadequate|poor\b|lacking|hindi\s+gusto|ayaw)\b",
    re.IGNORECASE,
)

# Question-level pattern: if the question is about suggestions/improvements,
# treat ALL answers as suggestion-type regardless of phrasing.
_IMPROVEMENT_QUESTION_RE = re.compile(
    r"\b(improve|wish|suggest|focus|skills|recommendation|feedback|"
    r"what\s+would\s+you\s+change|what\s+specific)\b",
    re.IGNORECASE,
)

# Question-level pattern: if the question asks for a message to leaders/LGU,
# treat answers as gratitude-type (unless the answer has no gratitude signals).
_GRATITUDE_QUESTION_RE = re.compile(
    r"\b(message|share|leader|government|lgu|pasig\s+city|"
    r"what\s+would\s+you\s+like\s+to\s+say)\b",
    re.IGNORECASE,
)


def _classify_intent(answer_text: str, question_text: str = "") -> str:
    """
    Classify the semantic intent of a survey response.

    Returns one of:
      - 'suggestion' : a constructive improvement request (inherently 0.0–0.5 polarity)
      - 'gratitude'  : an expression of thanks / positive impact (full range)
      - 'general'    : everything else (standard model output, no override)

    Question context is the strongest signal and overrides answer-level patterns.
    """
    if question_text:
        if _IMPROVEMENT_QUESTION_RE.search(question_text):
            # The whole question is about improvements → treat answer as suggestion
            return "suggestion"
        if _GRATITUDE_QUESTION_RE.search(question_text):
            # Message-to-leaders question: gratitude only if the answer actually says so
            if _GRATITUDE_RE.search(answer_text):
                return "gratitude"
            return "general"

    # Fallback: answer-level signals
    if _GRATITUDE_RE.search(answer_text):
        return "gratitude"
    if _SUGGESTION_RE.search(answer_text):
        return "suggestion"
    return "general"


def _calibrate_polarity(pos: float, neg: float, intent: str) -> float:
    """
    Intent-aware polarity calibration on top of the raw model probabilities.

    - 'gratitude' : Trust the model fully. Warm gratitude legitimately scores 1.0.
    - 'suggestion': Constructive suggestions are inherently mild. Clamp to [0.0, 0.5].
                    Genuine complaints (high neg) can reach -0.5 but never -1.0.
                    This eliminates the 0.0 / 1.0 outlier problem for suggestion answers.
    - 'general'   : Standard rounding to nearest 0.5 step, no override.
    """
    raw = pos - neg

    if intent == "gratitude":
        return round(raw * 2) / 2.0

    if intent == "suggestion":
        if neg > 0.45:
            # Explicitly critical feedback → mild negative, never extreme
            return -0.5
        # Constructive/hopeful phrasing → dampen toward center to avoid 1.0 inflation
        dampened = raw * 0.55
        polarity = round(dampened * 2) / 2.0
        # Clamp: pure suggestions cannot be strongly negative without hitting the
        # neg > 0.45 branch above
        return max(0.0, min(0.5, polarity))

    # General: standard behaviour
    return round(raw * 2) / 2.0


# ---------------------------------------------------------------------------
# Cache management — versioning + backward-compatible migration
# ---------------------------------------------------------------------------

def _migrate_cache(data: dict) -> dict:
    """
    Migrate a v1 cache to v2.

    v1 scores were computed without intent-awareness, which caused:
      - suggestion answers to score 1.0 (over-confident positive from Tagalog starters)
      - suggestion answers to score 0.0 (model read hopeful phrases as neutral)

    Migration rules for 'suggestion' intent entries:
      - score  1.0  →  0.5   (cap inflated positives)
      - score -1.0  → -0.5   (cap inflated negatives)
      - score  0.0  →  0.5   (bump neutral-scored hopeful suggestions, unless genuinely negative)
    """
    migrated: dict = {"__version__": CACHE_VERSION}
    fixed = 0

    for key, value in data.items():
        if key == "__version__":
            continue

        # Parse question and answer from the prompt key
        # Key format: "Question: {q_text} Answer: {a_text}"
        q_text, a_text = "", key
        if "Question:" in key and "Answer:" in key:
            parts = key.split("Answer:", 1)
            q_text = parts[0].replace("Question:", "").strip()
            a_text = parts[1].strip()

        intent = _classify_intent(a_text, q_text)
        new_value = []

        for category, score in value:
            if intent == "suggestion":
                if score == 1.0:
                    new_value.append([category, 0.5])
                    fixed += 1
                elif score == -1.0:
                    new_value.append([category, -0.5])
                    fixed += 1
                elif score == 0.0 and not _NEGATIVE_RE.search(a_text):
                    # Hopeful suggestions with no negative keywords → bump to 0.5
                    new_value.append([category, 0.5])
                    fixed += 1
                else:
                    new_value.append([category, score])
            else:
                new_value.append([category, score])

        migrated[key] = new_value

    if fixed:
        logger.info(
            f"Cache migration v1→v2: corrected {fixed} intent-unaware polarity scores."
        )

    return migrated


def _load_cache() -> dict:
    if not os.path.exists(CACHE_FILE):
        return {"__version__": CACHE_VERSION}
    try:
        with open(CACHE_FILE, "r") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"__version__": CACHE_VERSION}
        version = data.get("__version__", 1)
        if version < CACHE_VERSION:
            logger.info(f"Migrating ML cache from v{version} → v{CACHE_VERSION}...")
            return _migrate_cache(data)
        return data
    except Exception:
        return {"__version__": CACHE_VERSION}


_disk_cache = _load_cache()


def save_cache():
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(_disk_cache, f)
    except Exception:
        pass


atexit.register(save_cache)


# ---------------------------------------------------------------------------
# Main analyzer
# ---------------------------------------------------------------------------

class FeedbackAnalyzer:
    _instance = None

    def __init__(self):
        logger.info("Initializing NLP pipelines... This may take a moment to download models.")
        try:
            # Auto-detect GPU for massive speedups on local dev, fallback to CPU for deployment
            device = 0 if torch.cuda.is_available() else -1
            self.classifier = pipeline(
                "zero-shot-classification",
                model="MoritzLaurer/mDeBERTa-v3-base-mnli-xnli",
                device=device,
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

    def _analyze_cached(self, text: str, answer: str = None) -> tuple:
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
            "Government Trust and LGU Support Valuation",
        ]

        result = self.classifier(
            text,
            candidate_labels,
            hypothesis_template="This student feedback directly concerns {}.",
            multi_label=True,
        )

        detected_dimensions = [
            label
            for label, score in zip(result["labels"], result["scores"])
            if score >= 0.70
        ]

        if not detected_dimensions:
            return tuple()

        # --- Intent-aware sentiment scoring ---
        sentiment_input = answer if answer else text

        # Extract question context from the prompt key for smarter intent detection
        q_text = ""
        if "Question:" in text and "Answer:" in text:
            q_text = text.split("Answer:", 1)[0].replace("Question:", "").strip()

        intent = _classify_intent(sentiment_input, q_text)

        sent_result = self.classifier(
            sentiment_input,
            ["positive", "neutral", "negative"],
            hypothesis_template="The sentiment of this feedback is {}.",
            multi_label=False,
        )

        scores_dict = {
            label: score
            for label, score in zip(sent_result["labels"], sent_result["scores"])
        }

        polarity = _calibrate_polarity(
            scores_dict.get("positive", 0.0),
            scores_dict.get("negative", 0.0),
            intent,
        )

        result_tuple = tuple((dim, polarity) for dim in detected_dimensions)
        _disk_cache[text] = result_tuple

        # Periodically flush to disk as the cache grows
        if len(_disk_cache) % 20 == 0:
            save_cache()

        return result_tuple

    def analyze_feedback(self, text: str, answer: str = None) -> list[tuple[str, float]]:
        return list(self._analyze_cached(text, answer))


# ---------------------------------------------------------------------------
# Background task (called per response by the FastAPI app and run_ml.py)
# ---------------------------------------------------------------------------

    def register_false_positive(self, text: str):
        logger.info(f"Registering false positive for text: {text[:50]}...")
        # 1. Flip sentiment immediately in cache
        current_res = self.analyze_feedback(text)
        if current_res:
            logger.info(f"      -> Original Result: {current_res}")
            # Reconstruct with opposite polarity
            new_res = tuple((dim, -polarity) for dim, polarity in current_res)
            logger.info(f"      -> Corrected Result: {new_res}")
            _disk_cache[text] = new_res
            save_cache()
            logger.info("      -> Cache updated successfully.")
            
            # 2. Append to a JSONL file for future model fine-tuning
            try:
                import os, json
                training_file = "ml_training_data.jsonl"
                with open(training_file, "a") as f:
                    entry = {
                        "text": text,
                        "original_result": current_res,
                        "corrected_result": new_res,
                        "is_false_positive": True
                    }
                    f.write(json.dumps(entry) + "\n")
                logger.info(f"      -> Appended to training data file: {training_file}")
            except Exception as e:
                logger.error(f"Failed to write to training data: {e}")
        else:
            logger.warning(f"      -> No original result found in cache or model for text: {text[:50]}...")
            # Still append to the training data file so the model can learn from its blind spots!
            try:
                import os, json
                training_file = "ml_training_data.jsonl"
                with open(training_file, "a") as f:
                    entry = {
                        "text": text,
                        "original_result": [],
                        "corrected_result": [],
                        "is_false_positive": True,
                        "note": "Heuristic fallback"
                    }
                    f.write(json.dumps(entry) + "\n")
                logger.warning(f"      -> Appended heuristic fallback to training data file: {training_file}")
            except Exception as e:
                logger.error(f"Failed to write to training data: {e}")

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
                        q_text_lower = q.question_text.lower()
                        if any(kw in q_text_lower for kw in ["email", "name", "number"]):
                            continue

                        prompt = f"Question: {q.question_text} Answer: {ans}"
                        print(f"      -> Analyzing text: {ans[:30]}...")
                        t0 = time.time()
                        # analyzer.analyze_feedback is synchronous and blocking
                        res = analyzer.analyze_feedback(prompt, ans)
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
                    SurveyQuestion.is_deleted.is_(False),
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


