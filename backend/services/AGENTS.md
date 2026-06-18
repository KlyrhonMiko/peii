# Services Guide

## Purpose
`services/` owns resource behavior: ORM query construction, business rules, conflict
checks, persistence transforms, transaction boundaries, and domain errors.

## Service Rules
- Accept typed schema objects and SQLModel sessions from routers.
- Build SQLModel statements explicitly with `select(...)`, `where(...)`, and small helper
  functions for repeated filters.
- Apply resource-specific filters in services, not routers.
- Keep HTTP-specific parsing, `Query(...)`, status-code declarations, and response
  envelopes out of services.
- Raise `AppError` for expected domain failures so global handlers preserve the shared
  error shape.
- Let unexpected errors surface unless there is a concrete domain message to return.

## List Query Rules
- For paginated list endpoints, return both the page of rows and the filtered total.
- Apply the same filters to the data query and count query.
- Keep `include_deleted` explicit in query helpers.
- Keep search behavior resource-specific and test it at the API level.

## Sorting Rules
- Keep `sort_by` to ORM-column mapping in the owning service.
- Never trust raw client field names as SQLModel columns.
- Use `utils.sorting.stable_order_by()` for list ordering so primary sort ties fall back
  to `id`.
- Add tests for tie behavior when sorting logic changes.

## Write Flow Rules
- Keep write flows explicit and readable:
  1. Load or check existing rows.
  2. Validate uniqueness or domain conflicts.
  3. Generate backend-owned fields such as human-readable business ids.
  4. Transform sensitive fields such as passwords.
  5. Apply updates.
  6. `session.add(...)`, `session.commit()`, and `session.refresh(...)`.
- Use `services.base_service.apply_updates()` for generic update application when it fits.
- Do not silently swallow integrity errors. Prefer preflight conflict checks for expected
  user-facing conflicts, while global handlers remain a fallback.

## Business IDs
- Generate UI-facing business ids in create flows with
  `utils.identifiers.generate_business_id(prefix)`.
- Do not trust business id values from client create/update payloads unless implementing a
  deliberate import or external-system mapping feature.
- Keep prefixes resource-specific and stable once exposed, for example `USER`.
- If a generated value collides with a unique index, handle it as a retryable generation
  concern or let the global integrity handler catch the unexpected fallback.
- Include business id fields in search and sort mappings when the corresponding schema and
  UI expose them.

## Password And Sensitive Data
- Hash password input with `utils.security.hash_password()` before storing it.
- The current `User.password` model field stores an Argon2 hash despite the column name.
- Do not return password data from services for API use; routers should convert to read
  schemas that exclude it.

## Soft Delete
- Treat soft delete as state mutation on the row: `is_deleted`, `deleted_at`,
  `performed_by`, and `updated_at`.
- Default reads should hide soft-deleted rows unless the service method or query params
  explicitly allow them.
- Restores should validate that the row is actually deleted before mutating it.
