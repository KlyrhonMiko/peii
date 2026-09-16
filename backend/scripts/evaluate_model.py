import argparse
import json
import logging
from pathlib import Path
import torch
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, f1_score
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel, PeftConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent / "ml_models" / "peii_sentiment_v1_lora"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
LABEL_MAP = {"NEGATIVE": 0, "NEUTRAL": 1, "POSITIVE": 2}
INV_LABEL_MAP = {0: "NEGATIVE", 1: "NEUTRAL", 2: "POSITIVE"}

def load_test_data(file_path: Path):
    data = {"text": [], "label": []}
    if not file_path.exists():
        raise FileNotFoundError(f"Dataset not found at {file_path}")
        
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            item = json.loads(line)
            text = f"Context: {item['question_intent']}. Question: {item['question_text']} </s> Answer: {item['response_text']} </s>"
            label = LABEL_MAP.get(item["label_sentiment"])
            
            if label is not None:
                data["text"].append(text)
                data["label"].append(label)
    return data

def print_formatted_confusion_matrix(cm, target_names):
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

def main():
    parser = argparse.ArgumentParser(description="Evaluate PEII Sentiment Analysis Model")
    default_dataset = DATA_DIR / "ml_thesis_benchmark.jsonl"
    if not default_dataset.exists():
        default_dataset = DATA_DIR / "ml_dataset_v1_test.jsonl"
        
    parser.add_argument(
        "--dataset",
        type=str,
        default=str(default_dataset),
        help=f"Path to evaluation JSONL dataset (default: {default_dataset})",
    )
    args = parser.parse_args()

    dataset_path = Path(args.dataset).resolve()

    if not MODEL_DIR.exists():
        logger.error(f"Trained model not found at {MODEL_DIR}. Please run train_sentiment.py first.")
        return
        
    logger.info("Loading tokenizer and LoRA model...")
    config = PeftConfig.from_pretrained(str(MODEL_DIR))
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
    
    # Load base model
    base_model = AutoModelForSequenceClassification.from_pretrained(
        config.base_model_name_or_path,
        num_labels=3,
        ignore_mismatched_sizes=True
    )
    # Load PEFT weights
    model = PeftModel.from_pretrained(base_model, str(MODEL_DIR))
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    model.eval()
    
    test_data = load_test_data(dataset_path)
    logger.info(f"Loaded {len(test_data['text'])} test samples from {dataset_path.name}.")
    
    predictions = []
    labels = test_data['label']
    
    logger.info("Running inference on evaluation set...")
    with torch.no_grad():
        for text in test_data['text']:
            inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=256).to(device)
            outputs = model(**inputs)
            pred = torch.argmax(outputs.logits, dim=1).item()
            predictions.append(pred)
            
    target_names = [INV_LABEL_MAP[i] for i in range(3)]
    
    logger.info("\n=== CLASSIFICATION REPORT ===")
    report = classification_report(
        labels,
        predictions,
        labels=[0, 1, 2],
        target_names=target_names,
        zero_division=0.0,
    )
    print(report)
    
    logger.info("=== CONFUSION MATRIX ===")
    cm = confusion_matrix(labels, predictions, labels=[0, 1, 2])
    print_formatted_confusion_matrix(cm, target_names)

    acc = accuracy_score(labels, predictions)
    macro_f1 = f1_score(labels, predictions, average="macro", zero_division=0.0)
    weighted_f1 = f1_score(labels, predictions, average="weighted", zero_division=0.0)
    
    print("=== THESIS DEFENSE SUMMARY METRICS ===")
    print(f"Total Evaluated Samples : {len(labels)}")
    print(f"Overall Accuracy        : {acc:.4f} ({acc*100:.2f}%)")
    print(f"Macro F1-Score          : {macro_f1:.4f}")
    print(f"Weighted F1-Score       : {weighted_f1:.4f}")
    print("======================================\n")

if __name__ == "__main__":
    main()

