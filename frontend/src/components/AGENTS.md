# Shared Component Guidelines

## Scope
This guide covers `src/components/`, which contains product-level reusable UI such as charts and navigation components.

Follow `ui/AGENTS.md` when editing primitive building blocks under `src/components/ui/`.

## Current Responsibilities
- `app-sidebar.tsx` contains the shared sidebar navigation used by the portal shell.
- `CohortTrendChart.tsx` contains the Recharts line chart used on the dashboard.
- `FeatureImportanceChart.tsx` contains the Recharts bar chart used on analytics pages.

## Standards
- Use `PascalCase` filenames and exported component names.
- Keep components typed. Do not introduce `any`; chart formatters and third-party callback surfaces still need concrete narrow types.
- Product-level components may compose primitives from `src/components/ui/`, but they should not reimplement those primitives.
- If a component contains hard-coded demo data today and is becoming dynamic, separate the data shape from the rendering logic with explicit props.
- Favor small helper functions for chart formatting, color mapping, and display logic instead of large inline expressions.
- Keep navigation components aligned with app-router expectations and shared route structure.

## Chart Strategy
- Recharts components belong here, not in route files.
- Tooltip and axis formatters must be typed without `any`.
- Keep chart data arrays and derived labels close to the component unless they are shared across pages.
- Preserve responsive containers and dashboard-friendly dimensions.
