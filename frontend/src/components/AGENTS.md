# Shared Component Guide

## Scope
This guide covers `src/components/`, which contains product-level reusable UI.

Follow `ui/AGENTS.md` when editing primitive building blocks under `src/components/ui/`.

## Current Responsibilities
- `app-sidebar.tsx` and `nav-bar.tsx` contain shared portal navigation.
- `AdminUserManagement.tsx`, `AdminRoleManagement.tsx`, `AdminAuditLogs.tsx`, and
  `AdminAlumniCounts.tsx` contain live permission-aware administration workflows. The alumni
  grid uses `lib/degree-programs.ts`, downloads a prefilled CSV template, imports a CSV into the
  grid as unsaved changes (each imported batch column replaces that column), and saves through
  one full replacement; `ResponseRateBreakdown.tsx` renders the controlled "By batch" /
  "By college" horizontal bar chart from `responseCoverage()` in plain HTML (shared
  `rateScale()` axis, rate at the bar tip, respondents / alumni column; labels stack on phones).
  It follows the dashboard's borderless style: a hairline top rule instead of a card, micro-label
  column headers, slate bars with only the leading rate in the indigo accent, and no gridlines;
  `SentimentTest.tsx` holds the development
  sentiment-analysis utility surfaced only in non-production builds.
- `DashboardFilters.tsx`, `ProgramFilter.tsx`, and `SurveySelect.tsx` provide product
  filtering and selection controls.
- `ClientCohortTrendChart.tsx`, `ClientPEIIDimensionsTrendChart.tsx`,
  `ClientPEIIHistoricalTrendChart.tsx`, and `ClientSentimentDivergenceChart.tsx` isolate
  client-only dynamic chart imports.
- `ClientSurveyForm.tsx` renders the Google-authenticated identified survey intake with
  section-per-page navigation, Phase 1 POST, and Phase 2 PATCH behavior.
- Public response withdrawal is removed; `/survey/withdraw` returns not found.
- `SurveyManagement.tsx` is the client-side shared-workspace survey management surface. It
  gates CRUD, retention settings, structure editing, aggregates, raw responses, CSV export, and
  erasure by the capabilities passed by the route. Response operations preserve separate global
  RBAC capabilities and archived-survey access rules.
- `SurveyResponsesPanel.tsx` shows aggregates, raw records, export, erasure, and the
  capability-gated "Import responses" action. The import flow lives in
  `survey-response-import/`: `ResponseImportDialog.tsx` (upload → review → import state
  machine), `ResponseImportMappingTable.tsx` (column-to-question mapping),
  `ResponseImportValueIssues.tsx` (unmatched choice values), `ResponseImportSummary.tsx` (row
  outcomes, errors, duplicates), and `import-helpers.ts`. The server maps columns and dry-runs;
  user edits are sent as overrides only on "Check again", and commit sends the preview's
  `structure_version`.
- `SurveyShareLinkDialog.tsx` (formerly `SurveyDistributionManager.tsx`) shows the public
  shareable survey link (`/survey/{surveyId}`); the distribution feature was removed.
- `ReportTable.tsx` renders one `peii-report.ts` table spec in the paper's style (numbered
  title, ruled header, bold totals, then `Note.`, `Method.`, and any consistency warning).
  `DataMethodPanel.tsx` is the "Data and method" toggle under one chart, holding only that
  chart's tables. In a row of charts (ancestor `data-table-row`) the open tables portal into the
  row's full-width `data-table-slot`, so neighbouring charts keep their size and level; while the
  chart exports (`capturing`) they render inline so the PNG carries them. The toggle is
  `data-export-exclude`. `ReportFigure.tsx` renders a dashboard chart by `ReportFigureId` for the
  report. `MethodAppendix.tsx` typesets Chapter 2 Eq. 1–5 in MathML (native browser math, no
  library; element types in `src/types/mathml.d.ts`), with Eq. 4 built from `DIMENSION_WEIGHTS`. `PrintableReport.tsx` is the print-first sheet for `/researcher/dashboard/report`: it
  loads the survey title by business code (and checks it matches the UUID), the PEII analytics,
  and alumni totals, renders each block as Figure N (the chart) then its Table N, numbers figures
  and tables separately, appends the method section. "Save as PDF" downloads
  `PEII Printable Report - YYYY-MM-DD.pdf` through `lib/report-pdf.ts`; elements marked
  `data-pdf-block` (header, section headings, figures, print tables, appendix blocks) are the
  capture units. Verbatim feedback and
  model/system evaluation results are deliberately left out.
- `OutcomeDonutCard.tsx` is the single layout for the Employment donut row (fixed-height
  header, donut, summary label, legend) plus `likertDonutData()`. `ClientHiringVelocity`,
  `ClientEmploymentStability`, `ClientKeyOutcomes`, and `ClientDegreeAlignment` only map
  their aggregate into it; change shared layout there so the four cards stay level.
- `CohortTrendChart.tsx` contains a filter-aware Recharts bar chart;
  `PEIIDimensionsTrendChart.tsx`, `PEIIHistoricalTrendChart.tsx`, and `SentimentDivergenceChart.tsx`
  contain analytics charts.

## Component Rules
- Prefer `PascalCase` filenames and exported component names for new product components.
  Existing shell files `app-sidebar.tsx` and `nav-bar.tsx` are established exceptions.
- Keep components typed. Do not introduce `any`.
- Use `import type` for type-only imports.
- Product components may compose `src/components/ui/` primitives, but should not recreate
  primitive behavior locally.
- If hard-coded demo data becomes dynamic, define explicit props and data types.
- Favor small helpers for formatting, color mapping, and display logic instead of large
  inline JSX expressions.
- Keep route-specific copy in routes unless the component is intentionally reusable.
- Keep capability checks explicit and separate: aggregate, raw, identity, export, and erase are
  not interchangeable permissions. The identity operation requires both raw and identity
  capability. The shared workspace is global RBAC, not survey ownership or membership.
- Treat export availability as permission plus the server-provided release flag. Client
  components must not read deployment environment variables directly.

## Server And Client Boundaries
- Add `"use client"` only to components that need hooks, browser APIs, event handlers, or
  client-only libraries.
- Keep client-only chart libraries behind the small `Client*.tsx` dynamic wrappers.
- Do not use `next/dynamic(..., { ssr: false })` directly in server route files.
- Keep props crossing server-to-client boundaries narrow and serializable.

## Navigation Components
- Keep navigation components aligned with App Router paths.
- Prefer `next/link` in page-level navigation. When a Base UI primitive requires custom
  rendering, use its `render={...}` API correctly.
- Active-state logic should be explicit and based on current route state.

## Chart Strategy
- Recharts components belong here, not in route files.
- Tooltip, axis, and formatter callback types must be concrete and local to the chart
  when library types are awkward.
- Keep responsive containers and stable parent dimensions so charts render reliably.
- Keep chart colors centralized in helpers or theme tokens when they are reused.
- When changing chart behavior, verify the rendered chart in the browser.
