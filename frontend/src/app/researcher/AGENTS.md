# Researcher Route Guide

## Scope
This guide covers `src/app/researcher/`, including the researcher layout, dashboard,
analytics, survey management/detail/settings, and model routes.

## Current Responsibilities
- `layout.tsx` owns the researcher shell, sticky top bar, and `SidebarProvider`.
- `dashboard/page.tsx` owns department/batch filter state, derives summary values, and
  renders the cohort trend chart wrapper.
- `analytics/page.tsx` owns interactive filters and renders PEII dimensions and sentiment
  divergence chart wrappers.
- `survey/page.tsx` authenticates with `surveys.read` and composes the live
  `SurveyManagement` client component. That component owns survey CRUD, structure
  editing/reordering, distribution, response, aggregate, raw, export, and erasure workflows;
  nested detail/settings pages remain placeholders.
- `models/page.tsx` loads the authenticated model catalog server-side from
  `BACKEND_INTERNAL_URL`.

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

## Data And Charts
- If chart or summary-card data becomes dynamic, define explicit data types.
- Move data shaping into typed helpers, server loaders, or service functions rather than
  burying transformations inside JSX.
- Keep chart dimensions stable so responsive containers do not collapse.
- Isolate interactive controls when practical. The current dashboard and analytics routes
  are client components because they own filter state consumed by metrics and charts.

## Styling
- Prefer shared card and chart components for repeated analytics surfaces.
- Keep operational density high; avoid marketing-style sections inside the portal.
- Use semantic theme tokens where practical, especially when touching shared components.
