# Researcher Route Guide

## Scope
This guide covers `src/app/researcher/`, including the researcher layout, dashboard,
and survey management/detail/settings routes.

## Current Responsibilities
- `layout.tsx` owns the researcher shell, sticky top bar, and `SidebarProvider`.
- `dashboard/page.tsx` lists active surveys, defaults to the first title containing
  both "PEII" and "Survey" as words, and lets users choose another. It owns department/batch
  filter state for the selected survey, derives summary values, and renders the unified analytics
  dashboard including cohort trends, PEII dimensions, and sentiment divergence chart wrappers.
  The Total Responses tile shows "respondents / alumni" and the response rate. The tile is a
  toggle (collapsed by default) that opens the rate panel inside the Key Metrics grid, directly
  under the tile on phones, with a "By batch" (default) / "By college" switch (`/alumni-counts/total` plus the PEII
  `batch_distribution`, `batch_college_distribution`, and `batch_degree_distribution`). Batches
  without responses remain outside overall and college denominators. All selected canonical
  degree programs need explicit registrar totals (zero is valid); blank totals and missing or
  unknown respondent degrees withhold affected rates and display recorded subtotals with an
  incomplete label. Overall rates are hidden if any responding batch is incomplete. Demographics
  and alumni results are keyed to filters and refresh requests, so delayed or superseded requests
  cannot mix a previous filter's numerator or denominator. The tile falls back to the sample-size
  label when its denominator is unknown. Surveys never read alumni counts.
- `survey/page.tsx` authenticates with `surveys.read` and composes the live
   `SurveyManagement` client component. That component owns survey CRUD, structure
   editing/reordering, retention settings, response, aggregate, raw, identity,
   export, and erasure workflows. Aggregates are available for every survey status and may change
   while an active survey receives responses. Raw/export reads may access archived surveys but
   still exclude expired/deleted responses; identity reads are separately capability-gated;
   nested detail/settings pages remain placeholders but require `surveys.read` and
   `surveys.manage` respectively.

## Researcher Rules
- Keep shared portal chrome in `layout.tsx`; do not duplicate it in child pages.
- Keep route pages focused on composition: headers, cards, filters, chart containers, and
  page-level copy.
- Move reusable analytics cards, filters, chart wrappers, legends, and display helpers to
  `src/components/`.
- Keep Recharts out of server route files. Import client chart wrappers from
  `src/components/Client*.tsx`.
- Preserve the current analytics tone: compact surfaces, subtle borders, restrained
  shadows, and indigo/slate accents.
- Pass explicit capability data from the route. Do not treat portal authentication as survey
  authorization; the shared survey workspace is global RBAC without ownership or membership.
- CSV export availability requires both `survey_responses.export` and the server-only
  `CSV_EXPORT_ENABLED` release flag passed by `survey/page.tsx`; never expose that flag through a
  `NEXT_PUBLIC_*` variable.
