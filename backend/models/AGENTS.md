# Models Guide

## Purpose
`models/` defines SQLModel persistence classes and shared model bases. Models describe
database shape; they should not know about HTTP requests.

## Current Pattern
- Shared table fields live in `models/base_model.py`.
- `TimestampedUUIDModel` provides UUIDv7 `id`, timestamps, soft-delete fields, and
  `performed_by`; `BaseModel` is the common resource base.
- Resources commonly inherit `BaseModel`; RBAC and membership tables inherit
  `TimestampedUUIDModel`; `AuditLog` has a direct `SQLModel` shape.
- Current tables use explicit `Field(...)` constraints, indexes, uniqueness, and
  max lengths.
- `models/__init__.py` exports live table classes for metadata registration.

## Model Rules
- Keep models focused on persisted columns and field-level database constraints.
- Use `Field(...)` for max lengths, indexes, uniqueness, nullability, and defaults that
  are part of the database contract.
- Add a human-readable business id when a top-level resource needs a stable UI/support
  reference. Internal, association, and audit tables do not require one.
- Name business id fields explicitly, such as `user_id` or `survey_id`, and make exposed
  identifiers unique and indexed.
- Keep request parsing, query-param defaults, filter behavior, and sort allow-lists out
  of model classes.
- Keep business rules and commits in services, not model methods.
- The local `User` model links to Supabase with `auth_user_id` and does not persist a
  password.
- Do not expose sensitive fields by making them convenient on read schemas. Schema files
  own API visibility.

## Adding Or Changing Tables
- Export new models from `models/__init__.py`.
- Update metadata wiring in `core/database.py` and `alembic/env.py` when needed so
  tests and Alembic autogenerate see the table.
- If a field is added, renamed, retyped, made nullable/non-nullable, indexed, or removed,
  treat it as a migration-triggering model change.
- When adding a business id, choose its prefix with the model so service, schema, tests,
  and migration code use one convention.
- Keep model constraints aligned with schema validation and service conflict checks.


## Timezone and Driver Rules
- Postgres `TIMESTAMP WITHOUT TIME ZONE` columns will reject timezone-aware Python datetimes when using `asyncpg`.
- Always strip timezone info using `dt.replace(tzinfo=None)` or the helper `utc_now()` before writing datetimes to the database.

## Migration Discipline
- After every table-shape change, run
  `./.venv/bin/alembic revision --autogenerate -m "describe change"` from `backend/`.
- Review the generated migration before editing it.
- Make only narrow manual migration fixes, such as data backfills before adding a
  non-null constraint.
- Add a new revision for follow-up schema changes. Do not rewrite older shared revisions.
