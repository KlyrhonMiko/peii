# Core Guide

## Purpose
`core/` is the shared infrastructure layer. Code here should be useful across the
backend without knowing about one resource such as users.

## Belongs Here
- Application settings and repo-root `.env` loading.
- Database engine creation and session dependency wiring.
- FastAPI dependencies that are genuinely cross-resource.
- Global response-envelope helpers.
- Global exception handlers.
- App-wide infrastructure imported by `main.py`, Alembic, tests, or multiple routers.

## Does Not Belong Here
- Resource-specific query-param parsing, filter models, or sort allow-lists.
- ORM query construction for one resource.
- Business rules, conflict checks, password hashing, soft-delete workflows, or commits.
- Resource-specific response shaping beyond shared envelope and metadata helpers.
- Authentication or permission helpers that are not wired through real route dependencies.

## Current Files
- `config.py` owns `Settings`, loads the repo-root `.env`, and exposes `database_url`
  and `is_sqlite`.
- `database.py` owns the SQLModel engine and `get_session()` generator dependency.
  It imports live models so SQLModel metadata is populated before tests create tables.
- `deps.py` defines `DBSession` and shared list/audit query dependencies only.
- `responses.py` owns `success_response()`, `error_response()`, and
  `list_meta_response()`.
- `handlers.py` translates `AppError`, `RequestValidationError`, and `IntegrityError`
  into the universal error envelope.
- `exceptions.py` owns small application exception types that handlers can render.

## Settings Rules
- Add new runtime settings to `Settings` with explicit types.
- Update the repo-root `.env.example` in the same change when a setting is added,
  renamed, or removed.
- Keep environment-derived decisions centralized here. Other modules should read
  `settings` or the exported computed properties instead of parsing environment variables.
- Be careful with import-time side effects: settings and engine creation happen when the
  app, Alembic, or tests import this layer.

## Database Rules
- Keep `get_session()` as the common FastAPI dependency shape.
- If a new model table is added, update the model metadata import path so
  `SQLModel.metadata.create_all(...)` in tests and Alembic autogenerate can see it.
- Keep SQLite-specific engine options in `database.py`; do not scatter database URL
  inspection across services or routers.

## Response And Error Rules
- Preserve the top-level response shape: `data`, `message`, `errors`, `meta`.
- Keep success responses typed through `APIResponse[T]` where possible.
- Keep list metadata assembly centralized in `list_meta_response()`, but pass in the
  endpoint-specific filter schema from the route.
- For expected domain failures, raise `AppError` from services and let `handlers.py`
  produce the HTTP response.
