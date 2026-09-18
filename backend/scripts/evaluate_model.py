import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

import numpy as np
import torch
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline

# Ensure backend modules can be resolved
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from services.ml_service import _calibrate_polarity, _classify_intent
except ImportError:
    # Standalone fallback if services.ml_service dependencies are not in path
    _classify_intent = None  # type: ignore
    _calibrate_polarity = None  # type: ignore

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

ZERO_SHOT_MODEL_ID = "MoritzLaurer/mDeBERTa-v3-base-mnli-xnli"
LORA_MODEL_DIR = BACKEND_DIR / "ml_models" / "peii_sentiment_v1_lora"
DATA_DIR = BACKEND_DIR / "data"

LABEL_MAP = {"NEGATIVE": 0, "NEUTRAL": 1, "POSITIVE": 2}
INV_LABEL_MAP = {0: "NEGATIVE", 1: "NEUTRAL", 2: "POSITIVE"}
ZERO_SHOT_CANDIDATES = ["positive", "neutral", "negative"]
ZERO_SHOT_HYPOTHESIS = "The sentiment of this feedback is {}."


def load_test_data(file_path: Path) -> dict[str, list[Any]]:
    data: dict[str, list[Any]] = {
        "text": [],
        "response_text": [],
        "question_text": [],
        "question_intent": [],
        "label": [],
    }
    if not file_path.exists():
        raise FileNotFoundError(f"Dataset not found at {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            # Intent conditioning format used by PEII fine-tuning
            prompt_text = (
                f"Context: {item.get('question_intent', 'general')}. "
                f"Question: {item.get('question_text', '')} </s> "
                f"Answer: {item.get('response_text', '')} </s>"
            )
            label = LABEL_MAP.get(item.get("label_sentiment", ""))

            if label is not None:
                data["text"].append(prompt_text)
                data["response_text"].append(item.get("response_text", ""))
                data["question_text"].append(item.get("question_text", ""))
                data["question_intent"].append(item.get("question_intent", "general"))
                data["label"].append(label)

    return data


def print_formatted_confusion_matrix(cm: np.ndarray, target_names: list[str]) -> None:
    header = f"{'Actual \\ Predicted':<20} | " + " | ".join(f"{name:>10}" for name in target_names) + " | Total"
    divider = "-" * len(header)
    print("\n" + divider)
    print(header)
    print(divider)
    for i, row in enumerate(cm):
        row_str = f"{target_names[i]:<20} | " + " | ".join(f"{val:>10}" for val in row) + f" | {sum(row):>5}"
        print(row_str)
    print(divider)
    col_totals = [sum(cm[r][c] for r in range(len(cm))) for c in range(len(target_names))]
    print(f"{'Total Predicted':<20} | " + " | ".join(f"{val:>10}" for val in col_totals) + f" | {sum(col_totals):>5}")
    print(divider + "\n")


def evaluate_predictions(name: str, labels: list[int], predictions: list[int]) -> dict[str, Any]:
    target_names = [INV_LABEL_MAP[i] for i in range(3)]

    logger.info(f"\n=== CLASSIFICATION REPORT: {name} ===")
    report = classification_report(
        labels,
        predictions,
        labels=[0, 1, 2],
        target_names=target_names,
        zero_division=0.0,
    )
    print(report)

    logger.info(f"=== CONFUSION MATRIX: {name} ===")
    cm = confusion_matrix(labels, predictions, labels=[0, 1, 2])
    print_formatted_confusion_matrix(cm, target_names)

    acc = accuracy_score(labels, predictions)
    macro_f1 = f1_score(labels, predictions, average="macro", zero_division=0.0)
    weighted_f1 = f1_score(labels, predictions, average="weighted", zero_division=0.0)

    print(f"=== {name} SUMMARY METRICS ===")
    print(f"Total Evaluated Samples : {len(labels)}")
    print(f"Overall Accuracy        : {acc:.4f} ({acc * 100:.2f}%)")
    print(f"Macro F1-Score          : {macro_f1:.4f}")
    print(f"Weighted F1-Score       : {weighted_f1:.4f}")
    print("======================================\n")

    return {
        "name": name,
        "accuracy": acc,
        "macro_f1": macro_f1,
        "weighted_f1": weighted_f1,
        "samples": len(labels),
    }


def evaluate_zero_shot(
    test_data: dict[str, list[Any]],
    batch_size: int = 16,
) -> dict[str, Any]:
    model_display_name = f"Zero-Shot + Calibration ({ZERO_SHOT_MODEL_ID})"
    logger.info(f"Loading zero-shot pipeline: {ZERO_SHOT_MODEL_ID}...")
    device = 0 if torch.cuda.is_available() else -1
    classifier = pipeline(
        "zero-shot-classification",
        model=ZERO_SHOT_MODEL_ID,
        device=device,
    )

    labels = test_data["label"]
    response_texts = test_data["response_text"]
    q_texts = test_data["question_text"]
    logger.info(f"Running calibrated zero-shot inference on {len(response_texts)} samples...")

    # Run inference in batches
    predictions: list[int] = []
    results = classifier(
        response_texts,
        candidate_labels=ZERO_SHOT_CANDIDATES,
        hypothesis_template=ZERO_SHOT_HYPOTHESIS,
        multi_label=False,
        batch_size=batch_size,
    )

    for i, res in enumerate(results):
        scores_dict = {
            label: score for label, score in zip(res["labels"], res["scores"])
        }
        ans = response_texts[i]
        q_text = q_texts[i]

        if _classify_intent is not None and _calibrate_polarity is not None:
            intent = _classify_intent(ans, q_text)
            polarity = _calibrate_polarity(
                scores_dict.get("positive", 0.0),
                scores_dict.get("negative", 0.0),
                intent,
            )
            if polarity < 0:
                pred_idx = LABEL_MAP["NEGATIVE"]
            elif polarity > 0:
                pred_idx = LABEL_MAP["POSITIVE"]
            else:
                pred_idx = LABEL_MAP["NEUTRAL"]
        else:
            top_label = res["labels"][0].upper()
            pred_idx = LABEL_MAP.get(top_label, 1)

        predictions.append(pred_idx)

    return evaluate_predictions(model_display_name, labels, predictions)


def evaluate_lora(test_data: dict[str, list[Any]]) -> dict[str, Any] | None:
    model_display_name = f"Fine-Tuned LoRA ({LORA_MODEL_DIR.name})"

    if not LORA_MODEL_DIR.exists():
        logger.warning(
            f"LoRA model directory not found at {LORA_MODEL_DIR}. "
            f"Skipping LoRA evaluation. Run train_sentiment.py first to train it."
        )
        return None

    try:
        from peft import PeftConfig, PeftModel
    except ImportError:
        logger.error("peft package is required to evaluate LoRA models. Install with: pip install peft")
        return None

    logger.info(f"Loading LoRA model from {LORA_MODEL_DIR}...")
    config = PeftConfig.from_pretrained(str(LORA_MODEL_DIR))
    tokenizer = AutoTokenizer.from_pretrained(str(LORA_MODEL_DIR))

    base_model = AutoModelForSequenceClassification.from_pretrained(
        config.base_model_name_or_path,
        num_labels=3,
        ignore_mismatched_sizes=True,
    )
    model = PeftModel.from_pretrained(base_model, str(LORA_MODEL_DIR))

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()

    labels = test_data["label"]
    prompts = test_data["text"]
    logger.info(f"Running LoRA inference on {len(prompts)} samples...")

    predictions: list[int] = []
    with torch.no_grad():
        for prompt in prompts:
            inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=256).to(device)
            outputs = model(**inputs)
            pred = torch.argmax(outputs.logits, dim=1).item()
            predictions.append(pred)

    return evaluate_predictions(model_display_name, labels, predictions)


def print_comparison_table(results: list[dict[str, Any]]) -> None:
    if not results:
        return

    name_col_width = max(len(r["name"]) for r in results)
    name_col_width = max(name_col_width, 42)

    header = (
        f"{'Model Architecture':<{name_col_width}} | "
        f"{'Accuracy':>10} | "
        f"{'Macro F1':>10} | "
        f"{'Weighted F1':>12} | "
        f"{'Samples':>8}"
    )
    divider = "=" * len(header)

    print("\n" + divider)
    print("                     THESIS DEFENSE COMPARATIVE SUMMARY TABLE")
    print(divider)
    print(header)
    print("-" * len(header))
    for res in results:
        print(
            f"{res['name']:<{name_col_width}} | "
            f"{res['accuracy']:>10.4f} | "
            f"{res['macro_f1']:>10.4f} | "
            f"{res['weighted_f1']:>12.4f} | "
            f"{res['samples']:>8}"
        )
    print(divider + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate PEII Sentiment Analysis Models for Thesis")
    default_dataset = DATA_DIR / "ml_thesis_benchmark.jsonl"
    if not default_dataset.exists():
        default_dataset = DATA_DIR / "ml_dataset_v1_test.jsonl"

    parser.add_argument(
        "--dataset",
        type=str,
        default=str(default_dataset),
        help=f"Path to evaluation JSONL dataset (default: {default_dataset})",
    )
    parser.add_argument(
        "--model",
        type=str,
        choices=["all", "zero-shot", "lora"],
        default="all",
        help="Which model(s) to evaluate: 'all', 'zero-shot' (with calibration), or 'lora' (default: all)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Batch size for zero-shot pipeline inference (default: 16)",
    )
    args = parser.parse_args()

    dataset_path = Path(args.dataset).resolve()
    test_data = load_test_data(dataset_path)
    logger.info(f"Loaded {len(test_data['label'])} test samples from {dataset_path.name}.")

    summary_results: list[dict[str, Any]] = []

    if args.model in ("all", "zero-shot"):
        zs_res = evaluate_zero_shot(test_data, batch_size=args.batch_size)
        summary_results.append(zs_res)

    if args.model in ("all", "lora"):
        lora_res = evaluate_lora(test_data)
        if lora_res:
            summary_results.append(lora_res)

    if len(summary_results) > 1:
        print_comparison_table(summary_results)


if __name__ == "__main__":
    main()


