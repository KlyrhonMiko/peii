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
  `batch_distribution` and `batch_college_distribution`). Cohorts without responses or without an
  alumni total are left out of the overall and college rates and named in a note. The tile falls
  back to the sample-size label when no total is stored. Surveys never read alumni counts.
  `ExportableSection` takes the chart's `tables` (from the same `buildReportTables()` specs as the
  report) and renders a `DataMethodPanel` under the chart; its own export captures the chart with
  those tables and downloads `PEII - <chart name> - YYYY-MM-DD.png` (local date). Multi-chart rows
  carry `data-table-row` and end with a `data-table-slot`. Export is a menu: "Printable report"
  opens `dashboard/report` in a new tab with `survey` (UUID), `code` (business ID), and the current
  filters; "Chart images" keeps the PNG ZIP.
- `dashboard/report/page.tsx` reads those query parameters (404 without `survey` and `code`) and
  renders `PrintableReport`. The researcher layout and `nav-bar.tsx` hide portal chrome in print;
  `globals.css` sets the A4 `@page` and hides the sidebar.
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
