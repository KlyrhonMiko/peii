import pytest
from fastapi import HTTPException

from services import ml_service


def test_model_catalog_does_not_load_pipelines(monkeypatch: pytest.MonkeyPatch) -> None:
    def unexpected_load(*args: object, **kwargs: object) -> object:
        raise AssertionError("Model catalog must not load inference pipelines")

    monkeypatch.setattr(ml_service, "pipeline", unexpected_load)

    models = ml_service.get_models()

    assert [model["id"] for model in models] == [
        ml_service.TL_MODEL_ID,
        ml_service.EN_MODEL_ID,
    ]


@pytest.mark.anyio
async def test_analyze_sentiment_honors_explicit_model_and_returns_signed_score(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Pipeline:
        def __call__(self, text: str) -> list[dict[str, object]]:
            return [{"label": "LABEL_0", "score": 0.8}]

    tagalog_pipeline = Pipeline()
    english_pipeline = Pipeline()
    monkeypatch.setattr(
        ml_service,
        "get_pipelines",
        lambda: (tagalog_pipeline, english_pipeline),
    )

    prediction = await ml_service.analyze_sentiment(
        "This should use the requested model.",
        ml_service.EN_MODEL_ID,
    )

    assert prediction.label == "NEGATIVE"
    assert prediction.score == 0.8
    assert prediction.sentiment_score == -0.8
    assert prediction.model == ml_service.EN_MODEL_ID


@pytest.mark.anyio
async def test_analyze_sentiment_routes_tagalog_and_english_automatically(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class Pipeline:
        def __init__(self, prediction: dict[str, object]) -> None:
            self.prediction = prediction
            self.calls: list[str] = []

        def __call__(self, text: str) -> list[dict[str, object]]:
            self.calls.append(text)
            return [self.prediction]

    tagalog_pipeline = Pipeline({"label": "POS", "score": 0.6})
    english_pipeline = Pipeline({"label": "NEG", "score": 0.7})
    monkeypatch.setattr(
        ml_service,
        "get_pipelines",
        lambda: (tagalog_pipeline, english_pipeline),
    )
    monkeypatch.setattr(ml_service.langdetect, "detect", lambda text: "en")

    tagalog_prediction = await ml_service.analyze_sentiment("Maganda ang serbisyo.")
    english_prediction = await ml_service.analyze_sentiment("The service was disappointing.")

    assert tagalog_prediction.model == ml_service.TL_MODEL_ID
    assert tagalog_prediction.sentiment_score == 0.6
    assert english_prediction.model == ml_service.EN_MODEL_ID
    assert english_prediction.sentiment_score == -0.7
    assert tagalog_pipeline.calls == ["Maganda ang serbisyo."]
    assert english_pipeline.calls == ["The service was disappointing."]


class CaptureLogger:
    def __init__(self) -> None:
        self.events: list[tuple[str, dict[str, object]]] = []

    def info(self, event: str, **kwargs: object) -> None:
        self.events.append((event, kwargs))

    def error(self, event: str, **kwargs: object) -> None:
        self.events.append((event, kwargs))


@pytest.mark.anyio
async def test_inference_failure_has_generic_detail_and_safe_structured_log(monkeypatch) -> None:
    logger = CaptureLogger()
    raw_error = "private inference backend response"
    inference_text = "secret respondent answer"

    def failed_pipelines():
        raise RuntimeError(raw_error)

    monkeypatch.setattr(ml_service, "logger", logger)
    monkeypatch.setattr(ml_service, "get_pipelines", failed_pipelines)

    with pytest.raises(HTTPException) as raised:
        await ml_service.analyze_sentiment(inference_text)

    assert raised.value.status_code == 500
    assert raised.value.detail == "Local inference failed."
    assert raw_error not in str(logger.events)
    assert inference_text not in str(logger.events)
    assert ("sentiment_analysis_failed", {"error_type": "RuntimeError"}) in logger.events
