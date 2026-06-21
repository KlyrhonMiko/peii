# Models Guide

## Purpose
`models/` defines SQLModel persistence classes and shared model bases. Models describe
database shape; they should not know about HTTP requests.

## Current Pattern
- Shared table fields live in `models/base_model.py`.
- `BaseModel` provides UUIDv7 `id`, timestamps, soft-delete fields, and `performed_by`.
- Resource tables inherit from `BaseModel` and set `table=True`.
- Current tables use explicit `Field(...)` constraints, indexes, uniqueness, and
  max lengths.
- `models/__init__.py` exports live table classes for metadata registration.

## Model Rules
- Keep models focused on persisted columns and field-level database constraints.
- Use `Field(...)` for max lengths, indexes, uniqueness, nullability, and defaults that
  are part of the database contract.
- Every new table should include a human-readable business id column for UI display and
  support workflows. Keep the UUID `id` inherited from `BaseModel` as the primary key.
- Name resource business id fields explicitly, for example `user_id`, `survey_id`, or
  `response_id`, and make them unique and indexed.
- Keep request parsing, query-param defaults, filter behavior, and sort allow-lists out
  of model classes.
- Keep business rules and commits in services, not model methods.
- Use precise persisted names. If the database column is intentionally named `password`,
  keep that name in the model even though the stored value is an Argon2 hash.
- Do not expose sensitive fields by making them convenient on read schemas. Schema files
  own API visibility.

## Adding Or Changing Tables
- Export new models from `models/__init__.py`.
- Update metadata wiring in `core/database.py` and `alembic/env.py` when needed so
  tests and Alembic autogenerate see the table.
- If a field is added, renamed, retyped, made nullable/non-nullable, indexed, or removed,
  treat it as a migration-triggering model change.
- For new tables, choose the business id prefix while adding the model so service,
  schema, tests, and migration code use one consistent convention.
- Keep model constraints aligned with schema validation and service conflict checks.


## Timezone and Driver Rules
- Postgres `TIMESTAMP WITHOUT TIME ZONE` columns will reject timezone-aware Python datetimes when using `asyncpg`.
- Always strip timezone info using `dt.replace(tzinfo=None)` or the helper `utc_now()` before writing datetimes to the database.

## Migration Discipline
- After every table-shape change, run
  `alembic revision --autogenerate -m "describe change"` from `backend/`.
- Review the generated migration before editing it.
- Make only narrow manual migration fixes, such as data backfills before adding a
  non-null constraint.
- Add a new revision for follow-up schema changes. Do not rewrite older shared revisions.
