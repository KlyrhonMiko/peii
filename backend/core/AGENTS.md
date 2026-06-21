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
- `config.py` owns `Settings`, loads the repo-root `.env`, and exposes `database_url`, `async_database_url`, and `is_sqlite`. It has no default values (fails fast if config is missing).
- `database.py` owns both sync (`engine`/`get_session`) and async (`async_engine`/`get_async_session`) database engines and session factories. It configures PgBouncer-compatible connection args for async operations.
- `deps.py` defines `DBSession` (sync) and `AsyncDBSession` (async), along with shared query parameters.
- `context.py` defines thread-safe ContextVar (`request_id_ctx`) for tracing requests.
- `logging.py` configures `structlog` for structured logging, supporting dev-friendly ConsoleRenderer and prod-friendly JSONRenderer, with automated request ID injection.
- `middleware.py` defines ASGI `RequestIdMiddleware` for request ID propagation in headers/context.
- `responses.py` owns `success_response()`, `error_response()`, and `list_meta_response()`. Both `success_response` and `error_response` automatically inject the active request ID into `meta.request_id`.
- `handlers.py` translates `AppError`, `RequestValidationError`, and `IntegrityError` into the universal error envelope and structured-logs them using `structlog`.
- `exceptions.py` owns small application exception types that handlers can render.

## Settings Rules
- Add new runtime settings to `Settings` with explicit types and no default fallbacks unless optional.
- Update the repo-root `.env.example` in the same change when a setting is added, renamed, or removed.
- Keep environment-derived decisions centralized here. Other modules should read settings or the exported computed properties instead of parsing environment variables.
- Be careful with import-time side effects: settings and engine creation happen when the app, Alembic, or tests import this layer.

## Database Rules
- Use `get_async_session()` as the standard FastAPI dependency for async route handlers.
- If a new model table is added, update the model metadata import path in `core/database.py` so tests and Alembic autogenerate can see it.
- Keep PgBouncer connection args (`prepared_statement_name_func`, etc.) configured cleanly in `database.py` for all PostgreSQL connections.

## Response And Error Rules
- Preserve the top-level response shape: `data`, `message`, `errors`, `meta`.
- Success and error helpers automatically extract and attach `request_id` context.
- Keep success responses typed through `APIResponse[T]` where possible.
- Keep list metadata assembly centralized in `list_meta_response()`, but pass in the endpoint-specific filter schema from the route.
- For expected domain failures, raise `AppError` from services and let `handlers.py` produce the HTTP response.
- Use `structlog` inside `handlers.py` to record failures with comprehensive context.
