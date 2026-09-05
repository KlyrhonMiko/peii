# Analytics Calculation Reference

This document explains how the analytics engine — implemented in
`backend/services/survey_analytics_service.py` — computes the **PEII score** and
**sentiment scores** from raw survey responses.

For the underlying mathematical formula and academic rationale, see
[`peii-formula.md`](./peii-formula.md). For the ML pipeline that produces pre-computed
sentiments, see [`ml.md`](./ml.md).

---

## PEII Score

### Domain Weights

Five domains are scored and weighted using AHP-derived weights that sum to `1.0`:

| Domain | Weight |
|---|---|
| A. Employability and Economic Mobility | 0.30 |
| B. Family Upliftment and Financial Stability | 0.25 |
| C. Personal Development and Life Quality | 0.20 |
| D. Civic Engagement and Community Contribution | 0.15 |
| E. Government Trust and LGU Support Valuation | 0.10 |

These weights are hard-coded in `DOMAIN_WEIGHTS` and are not stored in the database.

### Question Pairing (Pre vs. Post)

Each domain's survey section contains an even number of Likert-scale questions. The
service splits them down the middle:

- **First half** → `pre` questions (pre-graduation baseline, "Before")
- **Second half** → `post` questions (post-graduation outcome, "After")

This split happens at ingestion time by section, not by question label.

### Per-Response Accumulation

For every valid survey response:

1. The respondent's **batch year** is read from the "Year Graduated" profile question.
   Responses without a batch year are skipped.
2. If a `department` filter is active, only responses whose "Degree Program" maps to the
   requested department are included (see `DEPARTMENT_MAPPING` in the service).
3. For each domain, the response's Likert answers are summed into running
   `pre_sum / pre_count` and `post_sum / post_count` accumulators, keyed by batch year.

### Cohort Aggregation

After all responses are processed, the service computes per-cohort domain averages:

```
pre_avg  = pre_sum  / pre_count    (0.0 if no answers)
post_avg = post_sum / post_count   (0.0 if no answers)
```

When **"All Batches"** is requested, the accumulators from every individual year are
merged before averaging, so the result reflects the entire population rather than a
simple mean of cohort means.

### PEII Score Formula

For each domain `j`:

```
gain_j = post_avg_j - pre_avg_j
```

The overall PEII score is the sum of weighted gains across all five domains:

```
PEII = sum(gain_j * weight_j)   for j in A..E
```

The result is an unbounded float on the same scale as the Likert responses (1-5). A
score of `0.0` indicates no net change; positive values indicate improvement; negative
values indicate regression.

### PEII Index (Base-100)

To enable cohort comparison, the service normalizes each cohort's PEII score against the
**2023 baseline cohort**:

```
peii_index = (cohort.peii_score / baseline_2023.peii_score) * 100
```

The 2023 cohort is always assigned an index of `100.0`. Cohorts scoring above `100`
showed greater improvement than the 2023 class; cohorts below `100` showed less.

This index is only computed when the 2023 cohort has a `peii_score > 0`.

---

## Sentiment Score

Each open-ended feedback answer receives a **sentiment score** in the range `[-1.0, 1.0]`
where `-1.0` is strongly negative and `+1.0` is strongly positive.

Sentiment is determined by one of two paths, in priority order:

### Path 1 — ML-Based (Primary)

Pre-computed ML results are stored in `SurveyResponse.ml_sentiments`, a JSON dict
keyed by question ID. Each entry is a list of `(dimension, polarity)` tuples produced
by the external ML pipeline (see `ml.md`).

#### Model

Both dimension classification and sentiment scoring use a single model loaded via
Hugging Face `transformers.pipeline`:

| Task | Pipeline type | Model |
|---|---|---|
| Dimension classification | `zero-shot-classification` | [`MoritzLaurer/mDeBERTa-v3-base-mnli-xnli`](https://huggingface.co/MoritzLaurer/mDeBERTa-v3-base-mnli-xnli) |
| Sentiment scoring | `zero-shot-classification` | Same model — second pass |

`mDeBERTa-v3-base-mnli-xnli` is a multilingual DeBERTa model fine-tuned on MNLI + XNLI.
It supports cross-lingual inference across English, Tagalog, and Taglish without
translation. The model runs on GPU when available; otherwise it falls back to CPU
(as deployed on the OCI Ampere A1 instance).

#### Step 1 — Dimension Classification

The model is called with `multi_label=True` and the five PEII domain labels as candidates:

```
hypothesis_template = "This student feedback directly concerns {}."
threshold = 0.70   # labels scoring below this are discarded
```

If no label exceeds the threshold, the answer is skipped (no ML result stored for it).

#### Step 2 — Sentiment Scoring

A second pass on the same model classifies the answer into `positive / neutral / negative`:

```
hypothesis_template = "The sentiment of this feedback is {}."
multi_label = False
```

Raw probabilities (`pos`, `neg`) are fed into `_calibrate_polarity()`, which applies
**intent-aware calibration** based on the answer's semantic intent:

| Intent | Detection | Calibration rule |
|---|---|---|
| `suggestion` | Question asks for improvements, or answer contains words like `sana`, `dapat`, `improve`, `gusto ko` | Clamp polarity to `[0.0, 0.5]`; if `neg > 0.45`, return `-0.5` |
| `gratitude` | Answer contains `salamat`, `thankful`, `nagpapasalamat`, `changed my life`, etc. | Trust model fully: `round((pos − neg) × 2) / 2` |
| `general` | Everything else | Standard rounding to nearest `0.5` step |

The final polarity is one of: `-1.0`, `-0.5`, `0.0`, `0.5`, or `1.0`.

#### Caching

Results are keyed by the full prompt string
(`"Question: {question_text} Answer: {answer_text}"`) and persisted to `ml_cache.json`.
The cache is versioned (`CACHE_VERSION = 2`). Stale v1 caches are auto-migrated on load
— correction rules cap suggestion answers that were incorrectly scored `1.0` or `-1.0`
in v1.

#### When ML results exist for a question:

1. `avg_polarity` = mean of all polarity values for that question
2. The **primary dimension** is taken from the first tuple in the list (highest-confidence
   classification)
3. The answer is appended to `qualitative_feedbacks` with `sentiment_score = avg_polarity`

### Path 2 — Heuristic Fallback

When no ML results are stored for a question, a keyword-based fallback runs:

**Polarity:**

| Condition | Score |
|---|---|
| Contains a critical keyword (`sana`, `ayusin`, `kulang`, `more`, `lack`, `improve`, `wala`, `needs`, `better`) | `-0.5` |
| Contains a positive keyword (`good`, `happy`, `great`, `excellent`, `keep up`, `thanks`, `salamat`) | `+0.5` |
| Neither | `0.0` |

**Dimension classification** (keyword-based, first match wins):

| Dimension | Keywords |
|---|---|
| Employability and Economic Mobility | `job`, `work`, `career`, `salary`, `employ`, `income`, `trabaho`, `sweldo`, `pera`, `promot`, `hire`, `opportunity`, `business`, `negosyo`, `workplace`, `professional` |
| Family Upliftment and Financial Stability | `family`, `pamilya`, `financial`, `children`, `parents`, `anak`, `magulang`, `bahay`, `house`, `budget`, `gastos`, `kapatid`, `tulong sa pamilya`, `provide` |
| Personal Development and Life Quality | `skill`, `learn`, `grow`, `develop`, `confidence`, `happy`, `health`, `buhay`, `sarili`, `improve`, `training`, `aral`, `knowledge`, `natutunan`, `experience`, `mindset` |
| Civic Engagement and Community Contribution | `community`, `help`, `others`, `society`, `volunteer`, `tulong`, `kapwa`, `barangay`, `lipunan`, `tao`, `serve`, `serbisyo`, `contribute` |
| Government Trust and LGU Support Valuation | `gov`, `mayor`, `lgu`, `support`, `trust`, `gobyerno`, `program`, `scholar`, `city`, `pasig`, `officials`, `leader`, `public` |
| General Feedback *(default)* | *(no match)* |

### False Positive Overrides

Researchers can flag any qualitative answer as a **false positive** via
`FalsePositiveFeedback`. The override is applied to the computed `avg_polarity`
*before* the feedback is written to the output:

| Override value | Effect |
|---|---|
| `polarity_override = None` | Flip sign: `avg_polarity = -avg_polarity` |
| `polarity_override = <float>` | Replace entirely: `avg_polarity = polarity_override` |

This correction is applied to both ML-classified and heuristic-classified answers.

### Classification Thresholds

Sentiment scores are bucketed for the **Feedback Classification** chart:

| Range | Label |
|---|---|
| `> 0.3` | Positive |
| `-0.3` to `0.3` (inclusive) | Neutral |
| `< -0.3` | Negative |

### Output Ordering

All qualitative feedbacks are sorted by `sentiment_score` ascending (most negative /
most critical first) to surface actionable insights at the top of the list.

---

## Filters

Both the PEII score and sentiment data respect the same two optional filters:

| Filter | Effect |
|---|---|
| `batch_year` | Only include responses where the respondent's "Year Graduated" matches. Pass `"All Batches"` or omit for the full population. |
| `department` | Only include responses where the respondent's degree maps to the department via `DEPARTMENT_MAPPING`. Pass `"All Departments"` or omit to skip. |

---

## Related Documents

- [`peii-formula.md`](./peii-formula.md) — Academic formula derivation and worked examples
- [`ml.md`](./ml.md) — ML pipeline architecture for dimension classification and sentiment
- [`production-decisions.md`](./production-decisions.md) — Deployment and infrastructure decisions
