# Admin Route Guide

## Scope
This guide covers `src/app/admin/` and nested admin routes.

## Current Responsibilities
- `users/page.tsx` currently renders an admin portal shell and a placeholder
  user-management view.
- Admin routes currently reuse the shared sidebar primitives rather than owning a separate
  shell.

## Admin Rules
- Keep admin pages aligned with the shared portal chrome unless requirements clearly
  diverge.
- Do not grow placeholder pages into large monoliths. Extract real tables, filters, forms,
  and dialogs into `src/components/`.
- Use typed admin data models before connecting pages to backend responses.
- Keep role/access wording explicit and operational.
- Use shared UI primitives for buttons, cards, inputs, sheets, skeletons, and separators.
- For destructive or permission-sensitive admin actions, require explicit confirmation UI
  and clear status messaging.

## Data And API Contracts
- Keep frontend user/admin types aligned with backend schemas before wiring live data.
- Do not assume authentication or authorization exists just because admin pages exist.
- When route protection is added, document the frontend guard and backend enforcement path.

## Styling
- Keep admin screens dense, scannable, and work-focused.
- Preserve the existing light surfaces, subtle borders, and compact typography.
- Prefer reusable table/filter components once admin data becomes real.
