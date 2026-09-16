import json
import logging
from pathlib import Path
import torch
from torch import nn
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
    DataCollatorWithPadding
)
from peft import LoraConfig, get_peft_model, TaskType
from sklearn.metrics import f1_score, accuracy_score
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
MODEL_ID = "dost-asti/RoBERTa-tl-sentiment-analysis"
OUTPUT_DIR = str(Path(__file__).resolve().parent.parent / "ml_models" / "peii_sentiment_v1_lora")
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

LABEL_MAP = {"NEGATIVE": 0, "NEUTRAL": 1, "POSITIVE": 2}

def load_data(split):
    file_path = DATA_DIR / f"ml_dataset_v1_{split}.jsonl"
    data = {"text": [], "label": []}
    if not file_path.exists():
        raise FileNotFoundError(f"Dataset file {file_path} not found. Run export_ml_dataset.py first.")
        
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            item = json.loads(line)
            # Intent conditioning format
            text = f"Context: {item['question_intent']}. Question: {item['question_text']} </s> Answer: {item['response_text']} </s>"
            label = LABEL_MAP.get(item["label_sentiment"])
            
            if label is not None:
                data["text"].append(text)
                data["label"].append(label)
                
    return Dataset.from_dict(data)

def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=1)
    
    macro_f1 = f1_score(labels, predictions, average="macro")
    accuracy = accuracy_score(labels, predictions)
    
    return {
        "accuracy": accuracy,
        "macro_f1": macro_f1
    }

class CustomTrainer(Trainer):
    def __init__(self, class_weights=None, **kwargs):
        super().__init__(**kwargs)
        self.class_weights = class_weights
        if self.class_weights is not None:
            self.class_weights = self.class_weights.to(self.args.device)
            
    def compute_loss(self, model, inputs, return_outputs=False, num_items_in_batch=None):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits
        
        if self.class_weights is not None:
            loss_fct = nn.CrossEntropyLoss(weight=self.class_weights)
        else:
            loss_fct = nn.CrossEntropyLoss()
            
        loss = loss_fct(logits.view(-1, self.model.config.num_labels), labels.view(-1))
        return (loss, outputs) if return_outputs else loss

def main():
    logger.info("Loading tokenizer and datasets...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    
    train_dataset = load_data("train")
    val_dataset = load_data("val")
    
    def tokenize_function(examples):
        return tokenizer(examples["text"], truncation=True, max_length=256)
        
    tokenized_train = train_dataset.map(tokenize_function, batched=True)
    tokenized_val = val_dataset.map(tokenize_function, batched=True)
    
    # Calculate class weights for imbalanced data
    labels = train_dataset["label"]
    class_counts = np.bincount(labels)
    total = len(labels)
    # Inverse frequency weighting
    class_weights = total / (len(class_counts) * class_counts)
    class_weights_tensor = torch.FloatTensor(class_weights)
    logger.info(f"Class counts: {class_counts}")
    logger.info(f"Class weights: {class_weights}")
    
    logger.info("Loading base model...")
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_ID, 
        num_labels=3,
        ignore_mismatched_sizes=True # Ignore size mismatch since we're replacing the head (if base model had different num_labels)
    )
    
    # Set up LoRA
    logger.info("Setting up LoRA configuration...")
    peft_config = LoraConfig(
        task_type=TaskType.SEQ_CLS,
        inference_mode=False,
        r=8,
        lora_alpha=16,
        lora_dropout=0.1,
        target_modules=["query", "value"] 
    )
    
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()
    
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        learning_rate=2e-4,
        per_device_train_batch_size=8,
        gradient_accumulation_steps=2, # Effective batch size 16
        per_device_eval_batch_size=16,
        num_train_epochs=15,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        lr_scheduler_type="cosine",
        warmup_ratio=0.1,
        logging_dir=f"{OUTPUT_DIR}/logs",
        logging_steps=10,
        report_to="none" # Disable wandb for now unless specified
    )
    
    trainer = CustomTrainer(
        class_weights=class_weights_tensor,
        model=model,
        args=training_args,
        train_dataset=tokenized_train,
        eval_dataset=tokenized_val,
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )
    
    logger.info("Starting training...")
    trainer.train()
    
    logger.info(f"Saving fine-tuned model to {OUTPUT_DIR}")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    
    # Evaluate on best model
    logger.info("Evaluating best model...")
    metrics = trainer.evaluate()
    logger.info(f"Validation metrics: {metrics}")

if __name__ == "__main__":
    main()
