# Utility Guide

## Scope
This guide covers `src/lib/`.

## Current Responsibilities
- `utils.ts` provides `cn()` and `formatDate()`.
- `api.ts` owns the authenticated browser API envelope/error client. `api.raw` passes string
  and `FormData` bodies through unchanged and sets no Content-Type for `FormData`.
- `public-survey.ts` owns the public survey phase contract, submission payload, envelope parsing and retry-after helpers.
- `users.ts`, `rbac.ts`, `audit.ts`, and `surveys.ts` own domain types, mapping, and operations.
  `audit.ts` maps the read-only audit trail list/detail endpoints through `/api/backend`;
  `alumni-counts.ts` lists/replaces registrar totals, fetches the filter-matched alumni totals
  (overall, per batch, per batch and college), and owns `responseCoverage()`: a cohort counts
  toward the overall and college rates only when it has both responses and an alumni total;
  `alumni-csv.ts` owns the alumni CSV template (`college,degree_program,<year>...`) builder and
  strict parser; `csv.ts` is the shared quoted-CSV row parser; `degree-programs.ts` is the
  frontend degree-by-college list (mirror of the backend `DEPARTMENT_MAPPING`);
  `surveys.ts`
  includes retention-aware survey settings, aggregate, paginated raw-response,
  prepared export (returns a signed download URL that the browser opens), multipart response
  import preview/commit (`previewSurveyResponseImport`, `importSurveyResponses`), and erasure
  operations;
  survey response idempotency is survey-scoped and
  there is no distribution feature.
- `peii-report.ts` turns one `PEIIAnalyticsResponse` plus `responseCoverage()` into the
  Chapter 3 report tables (`buildReportTables()`, `buildReportSections()`) and the Chapter 2
  method appendix tables (`methodTables()`). Every note is generated from the data,
  never copied from the paper. It also owns the response-target rule (`responseTarget()`: 70%
  below 100 graduates, 60% for 100-300, 50% above 300; needed = ceil), `peiiTier()`, and
  `DIMENSION_WEIGHTS`, a copy of the backend `DOMAIN_WEIGHTS` (the API does not return weights).
  The WLC table re-adds weight × gain and sets `warning` when the total drifts more than 0.005
  from `cohort_result.peii_score`; update both copies together. Method text describes what the
  backend computes: pooled item means per wave, gain, weighted sum, index against Batch 2023.
  Per-chart tables (`metrics`, `time-to-job`, `employment-type`, `stability`, `alignment`, plus the
  income and channel distributions) state how each chart's headline figure is computed.
  `buildReportSections()` returns blocks of an optional figure (`ReportFigureId`) and its tables;
  trend figures need two or more batches. `peii-report.test.ts` asserts the paper's Chapter 3
  values from live-captured inputs. `dates.ts` `localDateStamp()` gives the local YYYY-MM-DD
  used in export file names. `report-pdf.ts` builds the report PDF in the browser: it captures
  each `data-pdf-block` with `html-to-image` and places it on A4 pages with `jspdf`
  (`layoutBlocks()` keeps figures and headings whole, splits tables of 90 mm or more only between
  rows with at least 30 mm on each side, and honours `data-pdf-break-before`), then adds a
  "Page n of N" footer. Pages are JPEG images, so PDF text is not selectable.
- `auth.ts` owns server-side current-user and permission guards, including the account profile
  fields consumed by the shared Settings page.
- `supabase/` owns the server client and cookie policy.
- `safe-redirect.ts` and `backend-proxy-policy.ts` own navigation and backend endpoint
  security policy. Focused Vitest tests are colocated with these modules.
- `survey-oauth-state.ts` and `supabase/survey-server.ts` own the server-only, flow-bound Google
  survey OAuth state and respondent session boundary. Keep `SURVEY_OAUTH_STATE_KEY` server-only.

## Utility Rules
- Keep `src/lib/` for framework-agnostic helpers and narrowly shared Next.js/frontend
  infrastructure. Retain `server-only` boundaries and never import those modules into
  client components.
- Pure helpers should be deterministic. Data/auth infrastructure may perform explicitly
  bounded fetch, session, cookie, and redirect effects.
- Prefer tiny composable helpers over catch-all utility modules.
- Keep type signatures explicit and reusable.
- Use `unknown` plus narrowing for uncertain external values.
- Do not add route components, route handlers, React hooks, JSX components, or browser
  subscriptions here. Shared routing-security helpers may live here.
- If a helper becomes React-specific, move it to `src/hooks/` or `src/components/`.

## `cn()` Usage
- Use `cn()` for conditional and merged class names.
- Do not manually concatenate Tailwind classes when conditions or user-provided
  `className` values are involved.
- Keep `cn()` as the single class merge helper unless a clear repo-wide need emerges.

## API And Data Helpers
- Keep `api.ts`, `users.ts`, `rbac.ts`, and `surveys.ts` aligned with backend schemas and
  the shared envelope shape.
- Forward the effective capability set to researcher UI; authentication is not sufficient for
  survey operations. Survey response idempotency is survey-scoped; the distribution feature was
  removed, so there is no distribution token to guard.
- Authenticated browser calls use `api.ts` and `/api/backend`. Server-only calls use
  `BACKEND_INTERNAL_URL`; the server-rendered identified survey page may use it for the survey
  GET after Google OAuth, while browser submission uses the focused same-origin
  `/api/survey/[token]` BFF.
