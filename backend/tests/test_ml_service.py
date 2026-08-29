import pytest
from fastapi import HTTPException

from services import ml_service


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
