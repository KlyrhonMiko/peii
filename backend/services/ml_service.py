import asyncio
import atexit
import json
import os
import re
from threading import Lock

import langdetect
import torch
from fastapi import HTTPException
from sqlmodel import col, select
from transformers import pipeline

from core.analytics_cache import ainvalidate_survey_analytics
from core.config import settings
from core.database import async_session_factory
from core.logging import get_logger
from models.survey_question import SurveyQuestion
from models.survey_response import SurveyResponse
from schemas.ml import SentimentResponse
from services.audit_service import AuditEvent, commit_with_audit
from utils.feedback_heuristics import heuristic_dimension

logger = get_logger(__name__)

# Published local-inference compatibility contract.
TL_MODEL_ID = "dost-asti/RoBERTa-tl-sentiment-analysis"
EN_MODEL_ID = "distilbert-base-uncased-finetuned-sst-2-english"

tl_pipeline = None
en_pipeline = None
_pipelines_lock = Lock()

_TAGALOG_KEYWORDS = {
    "ang",
    "ng",
    "mga",
    "sa",
    "ako",
    "ito",
    "yan",
    "lang",
    "pa",
    "na",
    "ba",
    "daw",
    "din",
    "rin",
    "naman",
    "po",
    "medyo",
    "pangit",
    "ganda",
    "sobra",
    "talaga",
    "kaya",
    "bakit",
    "ano",
    "sino",
    "saan",
    "kailan",
    "paano",
    "hindi",
    "oo",
    "wala",
    "meron",
    "may",
    "masaya",
    "malungkot",
    "nakakainis",
    "nakakabagot",
    "niya",
    "niyo",
    "nila",
    "namin",
    "tayo",
    "kami",
    "kayo",
    "sila",
    "ko",
    "mo",
    "ni",
    "si",
}


def get_pipelines():
    """Lazily load the published Tagalog and English inference pipelines."""
    global en_pipeline, tl_pipeline

    with _pipelines_lock:
        if tl_pipeline is None:
            logger.info("ml_model_loading", model_id=TL_MODEL_ID, language="tl")
            try:
                tl_pipeline = pipeline(
                    "text-classification",
                    model=TL_MODEL_ID,
                    tokenizer=TL_MODEL_ID,
                )
            except Exception as exc:
                logger.error(
                    "ml_model_load_failed",
                    model_id=TL_MODEL_ID,
                    language="tl",
                    error_type=type(exc).__name__,
                )
                raise RuntimeError("Failed to load Tagalog ML model.") from exc

        if en_pipeline is None:
            logger.info("ml_model_loading", model_id=EN_MODEL_ID, language="en")
            try:
                en_pipeline = pipeline(
                    "text-classification",
                    model=EN_MODEL_ID,
                    tokenizer=EN_MODEL_ID,
                )
            except Exception as exc:
                logger.error(
                    "ml_model_load_failed",
                    model_id=EN_MODEL_ID,
                    language="en",
                    error_type=type(exc).__name__,
                )
                raise RuntimeError("Failed to load English ML model.") from exc

    return tl_pipeline, en_pipeline


def get_models() -> list[dict[str, str]]:
    """Return the published model catalog without initializing model weights."""
    return [
        {
            "id": TL_MODEL_ID,
            "name": "Tagalog Sentiment Analyzer (RoBERTa)",
            "type": "sentiment-analysis",
            "description": (
                "Fine-tuned RoBERTa model for sentiment analysis on Tagalog and Taglish text."
            ),
        },
        {
            "id": EN_MODEL_ID,
            "name": "English Sentiment Analyzer (DistilBERT)",
            "type": "sentiment-analysis",
            "description": "DistilBERT model fine-tuned on SST-2 for English sentiment analysis.",
        },
    ]


def _select_sentiment_model(text: str, requested_model: str | None) -> str:
    if requested_model == EN_MODEL_ID:
        return EN_MODEL_ID
    if requested_model == TL_MODEL_ID:
        return TL_MODEL_ID

    words = set(re.findall(r"\b\w+\b", text.lower()))
    if any(word in _TAGALOG_KEYWORDS for word in words):
        return TL_MODEL_ID

    try:
        if langdetect.detect(text) == "en":
            return EN_MODEL_ID
    except langdetect.lang_detect_exception.LangDetectException:
        pass
    return TL_MODEL_ID


def _analyze_sentiment_sync(text: str, requested_model: str | None) -> SentimentResponse:
    tl_pipe, en_pipe = get_pipelines()
    active_model = _select_sentiment_model(text, requested_model)

    if active_model == EN_MODEL_ID:
        logger.info("ml_model_selected", model_id=EN_MODEL_ID, language="en")
        results = en_pipe(text)
    else:
        logger.info("ml_model_selected", model_id=TL_MODEL_ID, language="tl")
        results = tl_pipe(text)

    if not results:
        raise RuntimeError("Model returned no predictions.")

    prediction = results[0]
    raw_label = prediction.get("label", "UNKNOWN").upper()
    score = prediction.get("score", 0.0)

    label = "NEUTRAL"
    if raw_label in ["POSITIVE", "POS", "LABEL_1"]:
        label = "POSITIVE"
    elif raw_label in ["NEGATIVE", "NEG", "LABEL_0"]:
        label = "NEGATIVE"
    elif raw_label in ["NEUTRAL", "NEU", "LABEL_2"]:
        label = "NEUTRAL"

    sentiment_score = 0.0
    if label == "POSITIVE":
        sentiment_score = score
    elif label == "NEGATIVE":
        sentiment_score = -score

    return SentimentResponse(
        label=label,
        score=score,
        sentiment_score=sentiment_score,
        model=active_model,
    )


async def analyze_sentiment(
    text: str,
    requested_model: str | None = None,
) -> SentimentResponse:
    """Run published local sentiment inference without blocking the event loop."""
    try:
        return await asyncio.to_thread(_analyze_sentiment_sync, text, requested_model)
    except Exception as exc:
        logger.error("sentiment_analysis_failed", error_type=type(exc).__name__)
        raise HTTPException(status_code=500, detail="Local inference failed.") from exc

CACHE_FILE = "ml_cache.json"
# Bump this version whenever the scoring/calibration logic changes.
# The loader will auto-migrate older caches to the new version.
CACHE_VERSION = 6

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
    Migrate older caches to the current version.
    """
    migrated: dict = {"__version__": CACHE_VERSION}
    logger.info(
        "Cache migration: Purging all cached ML results to force heuristic re-evaluation."
    )
    return migrated


def _load_cache() -> dict:
    if not os.path.exists(CACHE_FILE):
        return {"__version__": CACHE_VERSION}
    try:
        with open(CACHE_FILE) as f:
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
            
            # Load the custom sentiment model if it exists
            model_dir = os.path.join(
                os.path.dirname(__file__), "..", "ml_models", "peii_sentiment_v1_onnx"
            )
            self.sentiment_model = None
            self.sentiment_tokenizer = None
            
            if os.path.exists(model_dir):
                logger.info(f"Loading custom ONNX sentiment model from {model_dir}...")
                try:
                    import onnxruntime as ort
                    from optimum.onnxruntime import ORTModelForSequenceClassification
                    from transformers import AutoTokenizer

                    provider = "CPUExecutionProvider"
                    session_options = ort.SessionOptions()
                    session_options.log_severity_level = 3

                    self.sentiment_model = ORTModelForSequenceClassification.from_pretrained(
                        model_dir,
                        provider=provider,
                        session_options=session_options,
                    )
                    self.sentiment_tokenizer = AutoTokenizer.from_pretrained(model_dir)
                    logger.info("Custom ONNX model loaded successfully.", provider=provider)
                except Exception as ex:
                    logger.warning(f"Failed to load ONNX model: {ex}. Falling back to zero-shot.")
            
            self._ready = True
        except Exception as e:
            logger.error(f"Failed to initialize NLP pipelines: {e}")
            self._ready = False

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _analyze_cached(
        self, text: str, answer: str | None = None, ignore_cache: bool = False
    ) -> tuple:
        if not ignore_cache and text in _disk_cache:
            # Reconstruct tuples from JSON lists
            return tuple((k, v) for k, v in _disk_cache[text])

        if not self._ready:
            return tuple()

        candidate_labels = [
            "Employability and Economic Mobility",
            "Family Upliftment and Financial Stability",
            "Personal Development and Life Quality",
            "Civic Engagement and Community Contribution",
            "Governance Trust and LGU Support Valuation",
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

        # --- Intent-aware sentiment scoring and heuristic fallback context ---
        sentiment_input = answer if answer else text

        # Extract question context from the prompt key for smarter intent detection
        q_text = ""
        if "Question:" in text and "Answer:" in text:
            q_text = text.split("Answer:", 1)[0].replace("Question:", "").strip()

        # If no specific dimension passed the >= 0.70 threshold, use the
        # keyword-based heuristic fallback before defaulting to "General Feedback"
        # so feedback answers receive their appropriate PEII dimension.
        if not detected_dimensions:
            h_dim = heuristic_dimension(sentiment_input.lower(), q_text.lower())
            detected_dimensions = [h_dim]

        intent = _classify_intent(sentiment_input, q_text)

        if self.sentiment_model and self.sentiment_tokenizer:
            # Use local fine-tuned ONNX model
            prompt = f"Context: {intent}. Question: {q_text} </s> Answer: {sentiment_input} </s>"
            inputs = self.sentiment_tokenizer(
                prompt, return_tensors="pt", truncation=True, max_length=256
            )
            
            with torch.no_grad():
                outputs = self.sentiment_model(**inputs)
                pred_idx = torch.argmax(outputs.logits, dim=1).item()
                
            # 0: NEGATIVE, 1: NEUTRAL, 2: POSITIVE
            if pred_idx == 0:
                polarity = -0.5
            elif pred_idx == 2:
                polarity = 0.5
            else:
                polarity = 0.0
        else:
            # Fallback zero-shot inference
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

    def analyze_feedback(
        self,
        text: str,
        answer: str | None = None,
        ignore_cache: bool = False,
    ) -> list[tuple[str, float]]:
        return list(self._analyze_cached(text, answer, ignore_cache=ignore_cache))


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
        else:
            logger.warning(
                f"      -> No original result found in cache or model for text: {text[:50]}..."
            )


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
                    col(SurveyQuestion.is_deleted).is_(False),
                )
            )
            questions = {str(q.id): q for q in questions_result.all()}

            # Execute the CPU-bound inference in a separate thread
            sentiments = await asyncio.to_thread(compute_sentiments, response.answers, questions)

            # Save back to database (audited as a system-actor background write)
            response.ml_sentiments = sentiments
            session.add(response)
            await commit_with_audit(
                session,
                [
                    AuditEvent(
                        action="ml_sentiments_computed",
                        resource_type="survey_response",
                        resource_id=str(response.id),
                        performed_by=settings.SYSTEM_ACTOR_ID,
                    )
                ],
            )
            await ainvalidate_survey_analytics(response.survey_id)
            logger.info(f"Successfully computed ML sentiments for response {response_id}")

    except Exception as e:
        logger.error(f"Error computing background ML sentiments for {response_id}: {e}")
