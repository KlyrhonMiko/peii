import json
import logging
from pathlib import Path
import torch
import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import PeftModel, PeftConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent / "ml_models" / "peii_sentiment_v1_lora"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
LABEL_MAP = {"NEGATIVE": 0, "NEUTRAL": 1, "POSITIVE": 2}
INV_LABEL_MAP = {0: "NEGATIVE", 1: "NEUTRAL", 2: "POSITIVE"}

def load_test_data():
    file_path = DATA_DIR / "ml_dataset_v1_test.jsonl"
    data = {"text": [], "label": []}
    if not file_path.exists():
        raise FileNotFoundError(f"Test dataset not found at {file_path}")
        
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            item = json.loads(line)
            text = f"Context: {item['question_intent']}. Question: {item['question_text']} </s> Answer: {item['response_text']} </s>"
            label = LABEL_MAP.get(item["label_sentiment"])
            
            if label is not None:
                data["text"].append(text)
                data["label"].append(label)
    return data

def main():
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
    
    test_data = load_test_data()
    logger.info(f"Loaded {len(test_data['text'])} test samples.")
    
    predictions = []
    labels = test_data['label']
    
    logger.info("Running inference on test set...")
    with torch.no_grad():
        for text in test_data['text']:
            inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=256).to(device)
            outputs = model(**inputs)
            pred = torch.argmax(outputs.logits, dim=1).item()
            predictions.append(pred)
            
    # Evaluation
    target_names = [INV_LABEL_MAP[i] for i in range(3)]
    
    logger.info("\n--- Classification Report ---")
    report = classification_report(labels, predictions, target_names=target_names)
    print(report)
    
    logger.info("\n--- Confusion Matrix ---")
    cm = confusion_matrix(labels, predictions)
    print(cm)

if __name__ == "__main__":
    main()
