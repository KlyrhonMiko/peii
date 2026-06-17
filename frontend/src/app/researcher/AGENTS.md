# Researcher Route Guidelines

## Scope
This guide covers `src/app/researcher/` and its dashboard and analytics routes.

## Current Responsibilities
- `layout.tsx` owns the shared researcher shell, sticky top bar, and sidebar provider wiring.
- `dashboard/page.tsx` renders summary cards and the cohort trend chart.
- `analytics/page.tsx` renders the feature-importance view.

## Standards
- Keep the shared portal chrome in `layout.tsx`; do not duplicate it in child pages.
- Keep page files focused on composition of cards, filters, charts, and section copy.
- Shared researcher widgets belong in `src/components/`, not inline in route files.
- Preserve the current portal tone: compact analytics surfaces, subtle borders, restrained shadows, and indigo/slate accents.
- If charts or summary cards become data-driven, move data shaping into typed helpers or server-side loaders instead of burying transformation logic inside JSX.
