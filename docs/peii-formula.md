# PEII Scoring Formula

This document explains how the **Pasig Education Impact Index (PEII)** is computed from
survey responses. The source of truth is `formula.pdf` in this directory; this file
exists to make the formula easy to read and reference during implementation.

---

## Overview

The PEII measures how much a graduate's life improved across five domains as a result of
their education at PLP. It is computed from paired **pre-graduation (Before)** and
**post-graduation (After)** Likert-scale survey responses, then weighted by domain
importance and finally normalized into a cohort-level index.

The computation has five sequential steps.

---

## Likert Scale

All survey items use a 5-point scale:

| Response | Score |
|---|---|
| Strongly Agree | 5 |
| Agree | 4 |
| Neutral | 3 |
| Disagree | 2 |
| Strongly Disagree | 1 |

---

## Step 1 — Domain Mean Score (Dⱼ)

Each **domain** (survey section) contains multiple question items. The domain mean score
is the arithmetic mean of all item scores within that domain.

```
Dⱼ = (Σ Xᵢⱼ) / n
```

**Variables:**
- `Dⱼ` — Mean score for domain `j`
- `Xᵢⱼ` — Individual respondent's Likert score on item `i` in domain `j`
- `n` — Number of items in domain `j`

This is computed **twice** for each domain — once for the **Before** responses
(pre-graduation baseline) and once for the **After** responses (post-graduation outcome).

**Example — Employability domain, 5 items:**

| Item | Score Before | Score After |
|---|---|---|
| Q1 | 3 | 5 |
| Q2 | 2 | 4 |
| Q3 | 3 | 4 |
| Q4 | 2 | 3 |
| Q5 | 4 | 4 |

```
D_E (Before) = (3 + 2 + 3 + 2 + 4) / 5 = 14 / 5 = 2.80
D_E (After)  = (5 + 4 + 4 + 3 + 4) / 5 = 20 / 5 = 4.00
```

---

## Step 2 — Gain Score (Gⱼ)

The gain score measures how much improvement occurred within a domain between the
Before and After measurements.

```
Gⱼ = Dⱼ_After − Dⱼ_Before
```

**Variables:**
- `Gⱼ` — Gain score for domain `j`
- `Dⱼ_After` — Domain mean score from post-graduation responses
- `Dⱼ_Before` — Domain mean score from pre-graduation responses

**Example — Employability:**
```
G_E = 4.00 − 2.80 = 1.20
```

---

## Step 3 — Weighted Gain (wⱼ × Gⱼ)

Each domain carries a pre-assigned **AHP weight** that reflects its relative importance
to overall educational impact. All weights sum to **1.0**.

| Domain | Weight (wⱼ) |
|---|---|
| Employability & Economics | 0.30 |
| Family & Finance | 0.25 |
| Personal Development | 0.20 |
| Civic Engagement | 0.15 |
| Governance & Support | 0.10 |

The weighted contribution of domain `j` = `wⱼ × Gⱼ`.

**Example:**

| Domain | Gain (Gⱼ) | Weight (wⱼ) | Weighted (wⱼGⱼ) |
|---|---|---|---|
| Employability | 1.20 | 0.30 | 0.360 |
| Family | 1.00 | 0.25 | 0.250 |
| Personal | 1.10 | 0.20 | 0.220 |
| Civic | 0.70 | 0.15 | 0.105 |
| Governance | 0.80 | 0.10 | 0.080 |

---

## Step 4 — Overall PEII Score

The PEII score is the sum of all weighted domain gains:

```
PEII = Σ (wⱼ × Gⱼ)   for all domains j
```

**Example:**
```
PEII = 0.360 + 0.250 + 0.220 + 0.105 + 0.080 = 1.015
```

A PEII of **1.015** indicates moderate overall improvement across all domains. Higher
values reflect greater positive educational impact; a score near 0 means little change;
negative values are theoretically possible but indicate regression.

---

## Step 5 — Base-100 Cohort Index

To allow meaningful **comparison across graduating cohorts**, each cohort's mean PEII is
normalized relative to a selected **baseline cohort** (currently: 2023).

```
PEII_Index_c = (PEII_c / PEII_base) × 100
```

**Variables:**
- `PEII_Index_c` — Index value for cohort `c`
- `PEII_c` — Mean PEII score of cohort `c`
- `PEII_base` — Mean PEII score of the baseline cohort (2023 = 1.015)

**Example:**

| Cohort | Mean PEII | Index | Interpretation |
|---|---|---|---|
| 2023 (Base) | 1.015 | 100.00 | Reference level |
| 2024 | 1.715 | 118.23 | 18.23% higher average improvement |
| 2025 | 0.90 | 88.67 | 11.33% lower average improvement |

The index is used for **institutional monitoring** and cohort comparison, not for
measuring individual improvement. Differences between cohorts may be influenced by
external factors such as economic conditions or labor market changes.

---

## Population and Sampling

The target population is graduates of PLP from academic years 2023, 2024, and 2025.
A **stratified purposive sampling** approach is used, grouping respondents by cohort year.

Minimum response rate targets by cohort size:

| Cohort Size | Minimum Response Rate |
|---|---|
| Small (< 100) | 70% |
| Medium (100–300) | 60% |
| Large (> 300) | 50% |

These thresholds ensure statistical validity before PEII scores are reported.

---

## Implementation Notes

- **Domains map to survey sections.** Each section in the backend represents one domain.
  Domain mean scores are computed from the aggregated scale responses within that section.
- **Before/After pairing.** The survey must distinguish pre-graduation and post-graduation
  responses — either through separate surveys, separate sections, or a question-level
  label. This split is required to compute the gain score (Step 2).
- **The five AHP weights are fixed** and defined in this document. They are not stored
  in the database and must be hard-coded in any scoring implementation.
- **The radar chart** on the analytics page visualizes `Dⱼ_Before` vs `Dⱼ_After` per
  domain, giving a visual representation of the gain across all five dimensions.
- **The Base-100 Index** (Step 5) requires at least two cohorts with computed PEII scores
  and a designated baseline cohort. It is displayed on the cohort trend chart.
