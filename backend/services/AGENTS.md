# Services Guide

## Purpose
`services/` owns business logic and ORM query construction.

## Rules
- Apply resource-specific filters here, not in routers.
- Keep query building explicit and readable. Prefer small helper functions for repeated filter application.
- For list endpoints, return both the page of rows and the filtered total when the frontend needs pagination controls.
- Raise `AppError` for expected domain failures so the shared exception handlers preserve the universal error envelope.
- Keep write flows explicit: validate conflicts, transform payload fields such as passwords, apply updates, then commit and refresh.

## Sorting
- Primary `sort_by` mapping is resource-specific and should stay in the owning service.
- Use `utils/sorting.py:stable_order_by()` so tied primary sort values fall back to `id`.
- Never trust arbitrary client field names as ORM columns.

## Soft Delete
- Apply `include_deleted` explicitly in service queries.
- Keep "not found" behavior consistent for soft-deleted rows when `include_deleted` is not allowed on that service path.
- When mutating soft-delete state, keep `deleted_at`, `performed_by`, and `updated_at` aligned in the same service operation.
