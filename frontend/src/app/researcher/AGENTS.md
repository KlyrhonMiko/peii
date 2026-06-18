# Researcher Route Guide

## Scope
This guide covers `src/app/researcher/`, including the researcher layout, dashboard, and
analytics routes.

## Current Responsibilities
- `layout.tsx` owns the researcher shell, sticky top bar, and `SidebarProvider`.
- `dashboard/page.tsx` composes summary cards and the cohort trend chart wrapper.
- `analytics/page.tsx` composes the feature-importance chart wrapper.

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

## Data And Charts
- If chart or summary-card data becomes dynamic, define explicit data types.
- Move data shaping into typed helpers, server loaders, or service functions rather than
  burying transformations inside JSX.
- Keep chart dimensions stable so responsive containers do not collapse.
- If filters become interactive, isolate the interactive controls in client components
  instead of making the full route a client component.

## Styling
- Prefer shared card and chart components for repeated analytics surfaces.
- Keep operational density high; avoid marketing-style sections inside the portal.
- Use semantic theme tokens where practical, especially when touching shared components.
