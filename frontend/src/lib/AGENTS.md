# Utility Guide

## Scope
This guide covers `src/lib/`.

## Current Responsibilities
- `utils.ts` provides `cn()`, the shared `clsx` plus `tailwind-merge` class helper used
  by UI primitives and components.

## Utility Rules
- Keep `src/lib/` for small framework-agnostic helpers and narrowly shared frontend
  utilities.
- Utilities should be deterministic and side-effect light.
- Prefer tiny composable helpers over catch-all utility modules.
- Keep type signatures explicit and reusable.
- Use `unknown` plus narrowing for uncertain external values.
- Do not add React hooks, JSX components, route logic, or browser subscriptions here.
- If a helper becomes React-specific, move it to `src/hooks/` or `src/components/`.

## `cn()` Usage
- Use `cn()` for conditional and merged class names.
- Do not manually concatenate Tailwind classes when conditions or user-provided
  `className` values are involved.
- Keep `cn()` as the single class merge helper unless a clear repo-wide need emerges.

## API And Data Helpers
- If frontend API helpers are added later, keep response types aligned with backend
  schemas and the shared envelope shape.
- Keep fetch/base URL configuration centralized rather than scattering literal URLs across
  pages.
