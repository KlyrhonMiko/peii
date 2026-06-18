# Backend Guide

## Scope
This file applies to all of `backend/`. Directory-local guides add stricter rules for their
own area:

- `core/AGENTS.md`
- `models/AGENTS.md`
- `schemas/AGENTS.md`
- `routers/AGENTS.md`
- `services/AGENTS.md`
- `utils/AGENTS.md`
- `tests/AGENTS.md`
- `alembic/AGENTS.md`
- `alembic/versions/AGENTS.md`

Read this file first, then the guide closest to the files you are changing.

## Command Surface
- Run backend commands from `backend/` unless a command explicitly says otherwise.
- Use the repo-local virtualenv: `python3.14 -m venv .venv` and
  `./.venv/bin/pip install -r requirements.txt`.
- Start the API with `./.venv/bin/uvicorn main:app --reload`.
- Apply migrations with `alembic upgrade head`.
- Run the backend validation gate with:
  - `./.venv/bin/ruff check .`
  - `./.venv/bin/mypy .`
  - `env DEBUG=false ./.venv/bin/pytest -q`
- The committed config is Python 3.14-oriented: `ruff.toml` targets `py314`, `mypy.ini`
  uses `python_version = 3.14`, and the Docker image is `python:3.14-slim`.
- The root `.pre-commit-config.yaml` runs backend Ruff, mypy, and pytest on
  `pre-commit`; pytest also runs on `pre-push`.

## Runtime Configuration
- `core/config.py` loads the repo-root `.env` with Pydantic settings.
- Keep `.env.example` aligned whenever backend config keys, modes, or expected formats change.
- Database selection is environment-driven:
  - `DB_MODE=local` uses `LOCAL_DATABASE_URL`.
  - `DB_MODE=supabase` uses `SUPABASE_DATABASE_URL`.
- `SQL_ECHO` controls SQLAlchemy logging; keep normal development output quiet unless
  debugging SQL specifically.
- `BACKEND_CORS_ORIGINS` is parsed as a list by settings. Keep examples valid for Pydantic.

## Architecture
- `main.py` only wires the FastAPI app, CORS, exception handlers, and the versioned
  router from `routers/api.py`.
- Keep route registration centralized in `routers/api.py`; do not mount feature routers
  directly from `main.py`.
- Keep routers thin: parse HTTP input, depend on shared dependencies, call services, and
  assemble the shared response envelope.
- Keep ORM queries, transactions, conflict checks, business rules, soft-delete behavior,
  and persistence transforms in `services/`.
- Keep SQLModel table definitions and field-level persistence constraints in `models/`.
- Keep request, response, and query-param shapes in `schemas/`.
- Keep shared infrastructure in `core/`, and only put a helper in `utils/` when it is
  genuinely reusable outside one resource.
- Prefer explicit typed schemas and return models over ad hoc dictionaries at API boundaries.

## API Contract
- Preserve the universal response envelope: `data`, `message`, `errors`, `meta`.
- Successful responses should go through `core.responses.success_response()`.
- Expected app failures should raise `core.exceptions.AppError` so `core.handlers` can
  render the shared error envelope.
- Validation failures and SQL integrity failures are handled globally in `core/handlers.py`;
  do not reimplement those shapes per route.
- List responses use `core.responses.list_meta_response()` and must include:
  - `meta.pagination`: shared pagination fields.
  - `meta.filters`: the endpoint-specific filters that were applied.
- Keep `meta.filters` structurally present for list endpoints even when individual filter
  values are `None`.

## Data And Persistence
- The shared SQLModel base is `models/base_model.py`. It provides UUIDv7 ids,
  `created_at`, `updated_at`, soft-delete fields, and `performed_by`.
- Persistence currently uses explicit SQLModel `select(...)` queries and service-level
  helper functions for filters.
- New models must be exported from `models/__init__.py` and imported by metadata wiring
  such as `core/database.py` and `alembic/env.py` so tests, table creation, and Alembic
  autogenerate see them.
- Treat `include_deleted` as query behavior. It is not authorization.
- The current user `password` column stores an Argon2 hash, not plaintext. Request schemas
  may accept password input, but read schemas must not expose it.

## Filtering And Sorting
- Shared list query fields live in `schemas/common.py` and `core/deps.py` only when they
  are truly cross-resource.
- Resource-specific query parsing stays with the resource route, as `routers/users.py`
  does with `get_user_list_query_params()`.
- Resource-specific filter/query schemas stay in the owning schema module.
- Each service must map allowed `sort_by` values to ORM columns explicitly.
- Never pass raw client field names into ORM ordering.
- Use `utils.sorting.stable_order_by()` for sorted lists so ties fall back to `id`.

## Authentication Boundary
- User records and Argon2 password hashing exist, but full authentication is not wired.
- Do not describe login, current-user loading, route protection, or authorization as
  implemented unless the backend includes real route dependencies and tests for that flow.
- When auth is added, document the dependency path and enforce it per route rather than
  relying on comments, naming, or response messaging.

## Migrations
- For every `models/` change that alters table shape, run
  `alembic revision --autogenerate -m "describe change"` first.
- Review the generated diff before making manual edits. Manual edits should be narrow and
  explainable from the model change, data backfill, or database limitation.
- Add a new revision for new schema work. Do not rewrite older shared or applied revisions.
- Keep model, schema, service/router contract, tests, and migration files in sync when one
  feature touches all of them.

## Testing Standards
- Tests live under `tests/` and are discovered by `pytest.ini`.
- The current API tests are async, marked with `pytest.mark.anyio`, and use an `httpx`
  client against a local Uvicorn server.
- `tests/conftest.py` overrides `get_session()` with an in-memory SQLite SQLModel engine;
  keep this deterministic pattern unless a test specifically needs another database.
- Cover response-envelope changes, list metadata, filtering, sorting, soft delete/restore,
  conflict behavior, and persistence transforms such as password hashing.
