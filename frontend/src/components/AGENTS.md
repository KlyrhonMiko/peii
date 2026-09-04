# Shared Component Guide

## Scope
This guide covers `src/components/`, which contains product-level reusable UI.

Follow `ui/AGENTS.md` when editing primitive building blocks under `src/components/ui/`.

## Current Responsibilities
- `app-sidebar.tsx` and `nav-bar.tsx` contain shared portal navigation.
- `AdminUserManagement.tsx`, `AdminRoleManagement.tsx`, and `AdminAuditLogs.tsx` contain
  live permission-aware administration workflows; `SentimentTest.tsx` holds the development
  sentiment-analysis utility surfaced only in non-production builds.
- `DashboardFilters.tsx`, `ProgramFilter.tsx`, and `SurveySelect.tsx` provide product
  filtering and selection controls.
- `ClientCohortTrendChart.tsx`, `ClientPEIIDimensionsChart.tsx`,
  `ClientPEIIHistoricalTrendChart.tsx`, and `ClientSentimentDivergenceChart.tsx` isolate
  client-only dynamic chart imports.
- `ClientSurveyForm.tsx` renders the Google-authenticated identified survey intake with
  section-per-page navigation, Phase 1 POST, and Phase 2 PATCH behavior.
- `public-survey/WithdrawalForm.tsx` renders the public code-based response withdrawal flow.
- `SurveyManagement.tsx` is the client-side shared-workspace survey management surface. It
  gates CRUD, retention settings, structure editing, aggregates, raw responses, CSV export, and
  erasure by the capabilities passed by the route. Response operations preserve separate global
  RBAC capabilities and archived-survey access rules.
- `SurveyShareLinkDialog.tsx` (formerly `SurveyDistributionManager.tsx`) shows the public
  shareable survey link (`/survey/{surveyId}`); the distribution feature was removed.
- `CohortTrendChart.tsx` contains a filter-aware Recharts bar chart;
  `PEIIDimensionsChart.tsx`, `PEIIHistoricalTrendChart.tsx`, and `SentimentDivergenceChart.tsx`
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
