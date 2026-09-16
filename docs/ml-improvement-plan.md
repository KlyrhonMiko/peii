# Machine Learning Model Improvement Plan: Active Learning & Domain Fine-Tuning

This document details the end-to-end technical plan for advancing the PEII qualitative sentiment and dimension classification system from heuristic/database overrides to a natively accurate, fine-tuned multilingual model powered by an active learning feedback loop.

---

## 1. Executive Summary & Problem Context

The PEII platform analyzes open-ended student survey responses written in English, Tagalog, and Taglish across 5 developmental dimensions:
1. **Employability and Economic Mobility**
2. **Family Upliftment and Financial Stability**
3. **Personal Development and Life Quality**
4. **Civic Engagement and Community Contribution**
5. **Government Trust and LGU Support Valuation**

### Current Architecture Limitations
* **Zero-Shot Mismatch:** The current inference engine in [`backend/services/ml_service.py`](file:///d:/projects/peii/backend/services/ml_service.py) utilizes zero-shot models (`MoritzLaurer/mDeBERTa-v3-base-mnli-xnli` and `distilbert-base-uncased-finetuned-sst-2-english`). These general-purpose models lack contextual knowledge of Philippine higher education, LGU scholarships, and localized linguistic nuances.
* **Constructive Suggestion Inversion:** Suggestions answering *"What skills do you wish were taught?"* (e.g., *"Sana madagdagan ang hands-on training sa programming"*) are regularly flagged as **Negative** because words like *"sana"*, *"kailangan"*, and *"lacked"* trigger dissatisfaction detectors in standard sentiment models.
* **Over-Reliance on Overrides:** To achieve accurate dashboard reporting, the system currently relies on:
  1. Runtime keyword scoring and hybrid cross-checking in [`backend/services/survey_analytics_service.py`](file:///d:/projects/peii/backend/services/survey_analytics_service.py).
  2. Manual database overrides in the `FalsePositiveFeedback` table (currently 167 records).
  3. Pre-filtering 89 non-substantive placeholder comments (`"None"`, `"."`, `"N/A"`).

### Strategic Objective
Transition from reactive post-processing heuristics to a **natively accurate, fine-tuned transformer model** that trains directly on human-verified feedback, closing the loop with continuous active learning.

---

## 2. Target System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Researcher Dashboard                            │
│  - Views 277 substantive comments (89 placeholders isolated)           │
│  - Flags misclassifications with 1 click ("Mark False Positive")       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Human-in-the-Loop Annotation DB                      │
│  - `false_positive_feedbacks` table (167 verified ground-truth labels) │
│  - `ml_training_data.jsonl` audit log with (prompt, corrected_result)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Training & Data Preparation Pipeline                 │
│  1. `export_training_data.py`: Extract (Question, Text, True Label)   │
│  2. Exclude placeholders (_is_placeholder)                             │
│  3. Intent conditioning: [QUESTION_TYPE] + [PROMPT] + [TEXT]           │
│  4. Stratified Train / Validation / Test split (80 / 10 / 10)          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  Supervised Fine-Tuning (SFT)                          │
│  Base Checkpoint: `dost-asti/RoBERTa-tl-sentiment-analysis` or        │
│                   `MoritzLaurer/mDeBERTa-v3-base`                      │
│  Multi-Task Heads:                                                     │
│    - Head A: 3-Class Sentiment Polarity (-0.5, 0.0, +0.5)              │
│    - Head B: Multi-Label PEII Dimension Classification (5 dims)       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Deployment & Batch Inference                       │
│  1. Quantize / Export weights for OCI Ampere A1 (ARM64 CPU)            │
│  2. Update `FeedbackAnalyzer` in `backend/services/ml_service.py`      │
│  3. Batch re-run via `backend/run_ml.py` to refresh `ml_sentiments`    │
│  4. Invalidate analytics cache (`ml_cache.json` & Redis)               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Implementation Phases

### Phase 1: Ground-Truth Dataset Extraction & Curation

We already possess high-quality human corrections stored in the PostgreSQL database. Phase 1 consolidates this into an ML training format.

1. **Dataset Export Script (`backend/scripts/export_ml_dataset.py`):**
   - Query all substantive responses from `survey_responses` where `is_deleted = False`.
   - Exclude any text matching `_is_placeholder(text)`.
   - Join with `false_positive_feedbacks` on `(response_id, question_id)`:
     - If a `polarity_override` exists, assign the ground truth polarity ($0.5$ for Positive, $0.0$ for Neutral, $-0.5$ for Negative).
     - If no FP record exists, accept high-confidence predictions vetted by cross-check heuristics.
   - Structure output into standardized JSONL records:
     ```json
     {
       "response_id": "8f8b8e0e-...",
       "question_id": "4b60e65e-...",
       "question_text": "What specific skills or knowledge do you wish were taught?",
       "question_intent": "suggestion",
       "response_text": "Sana mas marami pang hands-on exercises sa programming.",
       "label_sentiment": "NEUTRAL",
       "polarity": 0.0,
       "dimensions": ["Employability and Economic Mobility"]
     }
     ```

2. **Dataset Stratification & Balancing:**
   - Partition into 80% Train, 10% Validation, and 10% Test.
   - Maintain proportional distribution across the 3 sentiment classes and 5 developmental dimensions.

---

### Phase 2: Model Architecture & Intent Conditioning

Standard sentiment models fail when isolated from question context. Phase 2 introduces **intent-conditioned input formatting**.

1. **Input Representation:**
   Format each sample to explicitly provide question context and conversational intent to the transformer using natural language or standard model separators (to avoid out-of-vocabulary custom token issues):
   ```text
   Context: suggestion. Question: What specific skills do you wish were taught? </s> Answer: Sana mas marami pang hands-on exercises. </s>
   ```
   *Why this works:* Conditioning the model on the `suggestion` intent prevents the encoder from penalizing constructive critique words (*"sana"*, *"wish"*, *"more"*, *"improve"*).

2. **Base Model Candidates:**
   * **Option A (Recommended for Tagalog/Taglish):** `dost-asti/RoBERTa-tl-sentiment-analysis`
     * Pre-trained specifically on Philippine language corpora by DOST-ASTI.
     * Exceptional vocabulary coverage for Tagalog stop words, particles, and slang.
   * **Option B (Recommended for Cross-Lingual Stability):** `MoritzLaurer/mDeBERTa-v3-base`
     * State-of-the-art multilingual encoder supporting English, Tagalog, and code-switched text.
     * High zero-shot transfer capability fine-tuned via cross-entropy loss.

3. **Classification Heads (Phased Approach):**
   * **Phase 2A (Sentiment Head):** Multi-class classification with 3 logits:
     $$\hat{y}_{\text{sent}} \in \{\text{Negative } (-0.5), \text{ Neutral } (0.0), \text{ Positive } (+0.5)\}$$
   * **Phase 2B (Dimension Head - Deferred):** Given the small initial dataset (~300 samples), training a multi-label dimension head concurrently risks degrading sentiment performance. We will introduce sigmoid multi-label output across the 5 PEII dimensions in a later iteration once data volume exceeds 1,000 verified samples.

---

### Phase 3: Fine-Tuning Execution & Evaluation

1. **Training Strategy & Hyperparameters:**
   * **Parameter-Efficient Fine-Tuning (PEFT):** Given the small training set (~290 samples), full fine-tuning poses a high risk of catastrophic forgetting and overfitting. We will utilize **LoRA (Low-Rank Adaptation)** on the query and value attention matrices (rank $r=8$, $\alpha=16$) to train only a small fraction of parameters while preserving the base model's Tagalog/English representations.
   * Optimizer: AdamW (`lr=2e-4` for LoRA, `weight_decay=0.01`)
   * Scheduler: Linear warmup with cosine decay (10% warmup steps)
   * Batch Size: 16 (gradient accumulation steps = 2 if VRAM is constrained)
   * Epochs: 10–15 (LoRA typically requires slightly more epochs than full FT; early stopping on validation macro F1)
   * Loss Function: Class-weighted Cross-Entropy Loss to counter class imbalance between Positive and Needs Attention responses.

2. **Evaluation Metrics & Acceptance Gates:**
   * **Primary Metric:** Macro-averaged F1 Score $\ge 0.88$ on validation and test splits.
   * **False Negative Suppression:** False negative rate on constructive suggestion answers must decrease by at least $80\%$ relative to the baseline zero-shot model.
   * **Tagalog Precision:** Manual evaluation of a 50-sample Tagalog holdout set must achieve $\ge 90\%$ agreement with human annotators.

---

### Phase 4: Production Deployment & Batch Re-scoring

1. **Model Export & Optimization for OCI Ampere A1 (ARM64):**
   * Convert fine-tuned PyTorch weights into ONNX format or PyTorch TorchScript.
   * Apply dynamic 8-bit quantization (`torch.quantization.quantize_dynamic`) to reduce memory footprint from ~500 MB to ~130 MB, accelerating CPU inference on ARM64 OCPUs.

2. **Serving Integration in [`backend/services/ml_service.py`](file:///d:/projects/peii/backend/services/ml_service.py):**
   * Update `FeedbackAnalyzer` to load the local fine-tuned weights rather than downloading public checkpoints from Hugging Face.
   * Deprecate heuristic fallback keyword scoring once validation confirms high native accuracy.

3. **Batch Re-scoring Script (`backend/run_ml.py`):**
   * Execute batch inference across all existing `survey_responses`.
   * Update the `SurveyResponse.ml_sentiments` JSONB column.
   * Invalidate runtime caches (`ml_cache.json` and Redis) via `ainvalidate_survey_analytics(survey_id)`.

---

## 5. The Continuous Active Learning Flywheel

```
┌────────────────────────────┐
│   New Survey Responses     │
└─────────────┬──────────────┘
              │
              ▼
┌────────────────────────────┐
│   Fine-Tuned Model Runs    │ ───► Standard Accuracy (>90%)
└─────────────┬──────────────┘
              │
              ▼ (Rare edge case / novel slang)
┌────────────────────────────┐
│ Researcher Overrides in UI │ ───► Appends to `FalsePositiveFeedback`
└─────────────┬──────────────┘
              │
              ▼ (Batch trigger: every N new corrections)
┌────────────────────────────┐
│ Scheduled Retraining Job   │ ───► Model checkpoint updated v2 -> v3
└────────────────────────────┘
```

1. **Trigger Threshold:** When $\ge 50$ new corrections accumulate in `false_positive_feedbacks`, an automated GitHub Action or backend maintenance job is scheduled.
2. **Regression Testing:** Automated validation verifies that the newly trained checkpoint maintains $100\%$ accuracy on all previously verified legacy corrections before deployment.
3. **Zero Downtime Reload:** The FastAPI background worker swaps the model pipeline atomically without service disruption.

---

## 6. Implementation Checklist & Deliverables

| Task ID | Task Description | Deliverable File | Target Output |
| :--- | :--- | :--- | :--- |
| **M1** | Dataset Extraction Script | `backend/scripts/export_ml_dataset.py` | `data/ml_dataset_v1.jsonl` (366 items labeled) |
| **M2** | Fine-Tuning Training Script | `backend/scripts/train_sentiment.py` | PyTorch training pipeline with wandb/local logging |
| **M3** | Evaluation Benchmark Suite | `backend/scripts/evaluate_model.py` | Confusion matrix, F1 report across EN & TL |
| **M4** | Model Packaging & Quantization | `backend/ml_models/peii_sentiment_v1/` | Quantized ONNX / TorchScript model artifact |
| **M5** | Service Pipeline Integration | `backend/services/ml_service.py` | Load fine-tuned checkpoint in `FeedbackAnalyzer` |
| **M6** | Batch DB Re-scoring & Audit | `backend/run_ml.py` | Refreshed `ml_sentiments` on all active surveys |
| **M7** | Verification on Dashboard | Researcher Dashboard UI | 100% clean sentiment distribution without runtime band-aids |
