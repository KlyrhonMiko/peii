# Architectural Plan: Multilingual Feedback Classification & Divergence Analysis

This technical plan outlines the end-to-end framework for classifying Tagalog, English, and Taglish survey responses across five developmental dimensions and mathematically identifying divergence against quantitative formula improvements.

---

## 1. System Objectives & Architecture Overview

*   **Primary Objective:** Automatically map unstructured, mixed-language student responses to five distinct outcome dimensions and detect discrepancies where quantitative metrics disagree with qualitative sentiment.
*   **Target Hardware:** Oracle Cloud Always Free Ampere A1 Compute (4 OCPUs, 24 GB RAM, ARM64 architecture, CPU-only inference).
*   **Operational Pipeline:** Contextual Text Aggregation $\rightarrow$ Zero-Shot Semantic Classification $\rightarrow$ Sentiment Intensity Extraction $\rightarrow$ Normalization & Divergence Computation $\rightarrow$ Analytical Reporting.

---

## 2. Text Ingestion & Context Engineering

Open-ended feedback in institutional surveys often produces short fragments that lack independent meaning. The ingestion layer enriches each text entry before routing it into natural language models.

*   **Prompt-Response Concatenation:** Pair the question intent directly with the raw answer to maintain structural context (e.g., prefixing *"Question: What improvements should PLP implement? Answer: Sana dagdagan..."*).
*   **Zero Translation Policy:** Maintain raw Tagalog and Taglish text without auto-translating into English. Preserving local idioms, colloquial complaints, and conversational code-switching is critical for retaining genuine emotional intensity.
*   **Multi-Response Disaggregation:** Treat each of the 3 survey questions as a separate data point mapped to the student's unique ID, allowing one student to register distinct sentiment profiles across multiple dimensions.

---

## 3. Dimension Mapping via Zero-Shot Classification

To categorize text across the 5 dimensions without manual annotation or custom model training, the system uses a multilingual cross-lingual Natural Language Inference (XNLI) framework.

*   **Candidate Label Design:** Expand shorthand categories into descriptive semantic anchors to optimize vector matching across English and Taglish:
    *   *Employability & Economic Mobility:* Technical competency, job readiness, industry tools, certifications, and career placement.
    *   *Family Upliftment & Financial Stability:* Household finances, supporting parents, poverty reduction, and family living standards.
    *   *Personal Development & Quality of Life:* Soft skills, self-confidence, critical thinking, mental well-being, and work-life balance.
    *   *Community Contribution & Civic Engagement:* Public service, giving back to the community, ethics, and local social impact.
    *   *LGU & Institutional Support Valuation:* City government funding, university management, facility quality, and leadership support.
*   **Hypothesis Framing:** Format the inference task using an explicit contextual template: `"This student feedback directly concerns {}."`
*   **Multi-Label Evaluation:** Enable independent probability thresholds ($P \ge 0.45$) for each dimension. Responses that address both financial capability and career development will register across both relevant axes.

---

## 4. Sentiment Intensity & Polarity Scoring

Standard binary sentiment (positive vs. negative) fails to capture nuanced institutional feedback. The pipeline extracts granular polarity scaled continuously.

*   **Model Criteria:** A multilingual sentiment analyzer trained across diverse linguistic corpora to evaluate mixed Taglish phrasing reliably.
*   **Scale Normalization:** Convert ordinal output ratings into a normalized continuous polarity score:
    *   $S \in [-1.0, 1.0]$, where $-1.0$ represents severe dissatisfaction, $0.0$ represents neutral/objective suggestions, and $+1.0$ represents strong endorsement.
*   **Aspect Contextualization:** Differentiate between critical tone and actionable suggestions. Questions 1 and 2 naturally prompt recommendations for improvement; scores near neutral or mild negative should be treated as constructive critique rather than active grievance.

---

## 5. Quantitative-Qualitative Divergence Model

The core diagnostic compares the mathematical score improvement calculated by the institutional formula against the actual sentiment extracted from the feedback.

*   **Quantitative Formula Delta ($\Delta Q$):** The measured growth on a given dimension:
    $$\Delta Q = \text{Post-Grad Outcome} - \text{Pre-Grad Baseline}$$
    *Normalized to the range $[-1.0, 1.0]$.*
*   **Divergence Metric ($D$):** For any dimension $d$ identified in the text:
    $$D_d = \Delta Q_d - S_d$$
*   **Divergence Thresholding:**
    *   **$|D_d| < 0.40$ (Aligned Alignment):** Quantitative gains match student sentiment. High score accompanied by positive feedback validates institutional progress.
    *   **$D_d \ge 0.60$ (The "Blind Spot" / False Positive):** The quantitative formula indicates substantial improvement ($\Delta Q > 0$), but qualitative sentiment is negative ($S < 0$). Suggests the scoring metric rewards surface achievements while students experience operational deficits (e.g., outdated lab infrastructure or lack of hands-on tools).
    *   **$D_d \le -0.60$ (The "Hidden Win" / False Negative):** The quantitative score shows low or stagnant growth ($\Delta Q \approx 0$), but qualitative sentiment is enthusiastic ($S > 0$). Suggests institutional impact is occurring in areas uncaptured by current quantitative key performance indicators.

---

## 6. Execution Workflow on OCI Ampere A1 (ARM64)

*   **Thread & Resource Orchestration:** Configure the runtime environment to pin tasks explicitly across all 4 available ARM cores, preventing execution bottlenecks.
*   **Sequential Pipeline Execution:** Execute zero-shot dimension mapping and sentiment extraction sequentially within single batch iterations to keep peak memory utilization under 4 GB, well within the 24 GB RAM ceiling.
*   **Chunked Batch Processing:** Process survey cohorts in chunks of 16 to 32 entries. This maximizes multi-core CPU utilization while preventing thread timeouts during long NLI evaluations.
*   **Audit Trail & Export:** Store results structured with student identifiers, assigned dimensions, model confidence percentages, sentiment polarity, quantitative baseline deltas, and divergence classifications for direct visualization on radar charts.