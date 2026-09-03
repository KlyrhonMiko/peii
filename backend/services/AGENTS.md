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

Phase 3 response behavior is kept in `response_service.py`,
`response_retention_service.py`, `response_export_service.py`, and
`survey_analytics_service.py`. The retention service is invoked by the external
`scripts/purge_expired_responses.py` job; it is not run by an application timer.
The generated Graduate Tracer questionnaire uses question `config.survey_phase`: Phase 1 creates
one response row and Phase 2 locks and merges into that row. Surveys without phase metadata retain
the single-submit path.

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
  4. Transform or delegate sensitive values through the owning external system.
  5. Apply updates.
  6. Add/flush rows, then commit the mutation and audit events through
     `commit_with_audit(...)`.
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
- Supabase Auth owns passwords. Login and password-change services forward credentials to
  Supabase and do not persist them in the local user table.
- Never return, log, audit, or include credentials/tokens in change dictionaries.
- Supabase Auth remains the sole password system; no local password hashing utility is used.

## Async & Auditing Rules
- Database and network service operations should be asynchronous and use `AsyncSession`.
  Pure and CPU-facing helpers may remain synchronous; the ML catalog is a current example.
- Every mutating operation (create, update, soft-delete, restore, reorder, revoke, or compound write) must commit through `commit_with_audit` from `services.audit_service`.
- Do not call `session.commit()` directly from resource services. Domain rows and audit rows must be committed in the same transaction; audit failures must roll back the mutation.
- Service operations that mutate data must accept an optional `ip_address: str | None = None` parameter and pass it to the audit logger.
- On updates, calculate a before/after diff (excluding sensitive values and system metadata) and supply it as a `changes` dictionary to `AuditEvent`.
- Most expected service failures use `AppError`. `ml_service.py` currently raises FastAPI
  `HTTPException`, so its errors do not use the shared application envelope.

## Survey Concurrency And Privacy
- Mutations that can touch a survey lifecycle acquire locks in one order: survey first, then
  responses ordered by UUID. Distribution locking was removed with `f88b9c1d0000`. The only
  public token references left are the Google respondent survey token (`/survey/{token}`) paired
  with the backend proof, not distribution tokens.
- Keep survey access global and capability-based. Raw reads, identity reads, exports, aggregates,
  and erasure remain distinct operations. The identity read requires both raw-read and
  identity-read capability; raw, aggregate, and CSV contracts remain identity-free.
- `survey_privacy.py` centralizes the `k=5` threshold for permission-aware survey list/detail
  response-count projection. Aggregate responses intentionally return exact totals and cells for
  groups of any size; keep aggregate access capability-gated and do not describe it as anonymous.
  Response erasure clears answer/linkage data, stores minimal tombstone/receipt state, and
  requires a UUID idempotency key; all-scope erasure is valid only after archive.

## Soft Delete
- Treat soft delete as state mutation on the row: `is_deleted`, `deleted_at`,
  `performed_by`, and `updated_at`.
- Default reads should hide soft-deleted rows unless the service method or query params
  explicitly allow them.
- Restores should validate that the row is actually deleted before mutating it.
