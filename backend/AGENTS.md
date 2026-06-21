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

### Runtime Configuration
- `core/config.py` loads the repo-root `.env` with Pydantic settings. No default fallbacks exist for settings (except optional ones); missing config will fail-fast at startup.
- Keep `.env.example` aligned whenever backend config keys, modes, or expected formats change.
- Database selection is environment-driven:
  - `DB_MODE=local` uses `LOCAL_DATABASE_URL`.
  - `DB_MODE=supabase` uses `SUPABASE_DATABASE_URL`.
- Async database connections dynamically convert the DB URL from sync driver to async (`postgresql+asyncpg` or `sqlite+aiosqlite`).
- PgBouncer transaction pooling port (6543) requires prepared statements to be disabled using `prepared_statement_cache_size=0` query parameter and custom database connection args (`statement_cache_size=0`, dynamic `prepared_statement_name_func`).
- `SQL_ECHO` controls SQLAlchemy logging; keep normal development output quiet unless debugging SQL specifically.
- `LOG_JSON` controls whether structured logs are formatted as JSON lines (for production aggregators) or colored console logs (for local development).
- `BACKEND_CORS_ORIGINS` is parsed as a list by settings. Keep examples valid for Pydantic.

## Architecture
- `main.py` wires the FastAPI app, CORS, exception handlers, the versioned router from `routers/api.py`, and the ASGI `RequestIdMiddleware`.
- Going to the root URL `/` redirects visitors directly to `/api/v1/docs` (OpenAPI Swagger UI).
- Keep route registration centralized in `routers/api.py`; do not mount feature routers directly from `main.py`.
- Keep routers thin: parse HTTP input, depend on shared async dependencies, call async services, and assemble the shared response envelope. All endpoint handlers are `async def`.
- Keep ORM queries, transactions, conflict checks, business rules, soft-delete behavior, and persistence transforms in `services/`.
- Keep SQLModel table definitions and field-level persistence constraints in `models/`.
- Keep request, response, and query-param shapes in `schemas/`.
- Keep shared infrastructure in `core/`:
  - `context.py` defines thread-safe request ID context variables.
  - `logging.py` sets up `structlog` with automated request ID injection.
  - `middleware.py` defines the ASGI request tracing propagator.
- Only put a helper in `utils/` when it is genuinely reusable outside one resource.
- Prefer explicit typed schemas and return models over ad hoc dictionaries at API boundaries.

## API Contract
- Preserve the universal response envelope: `data`, `message`, `errors`, `meta`.
- Successful responses should go through `core.responses.success_response()`.
- Expected app failures should raise `core.exceptions.AppError` so `core.handlers` can render the shared error envelope.
- Validation failures and SQL integrity failures are handled globally in `core/handlers.py`; do not reimplement those shapes per route.
- A unique trace ID is automatically generated or propagated in response headers (`X-Request-ID`) and response body `meta.request_id`.
- List responses use `core.responses.list_meta_response()` and must include:
  - `meta.pagination`: shared pagination fields.
  - `meta.filters`: the endpoint-specific filters that were applied.
- Keep `meta.filters` structurally present for list endpoints even when individual filter values are `None`.

## Data And Persistence
- The shared SQLModel base is `models/base_model.py`. It provides UUIDv7 ids, `created_at`, `updated_at`, soft-delete fields, and `performed_by`.
- Every new table should also have a human-readable, UI-facing business id generated through `utils.identifiers.generate_business_id()`. Keep the UUID `id` as the internal primary key; the business id is for display, search, sorting, and user-facing references.
- All resource mutations (create, update, delete, restore) must write an entry to the `audit_logs` table (via `record_audit` in `services.audit_service`).
- Timezone handling: Base helper `utc_now` must strip timezone info (`tzinfo=None`) when writing to `TIMESTAMP WITHOUT TIME ZONE` postgres columns to prevent `asyncpg` validation failures.
- Persistence uses explicit SQLModel asynchronous queries (`await session.exec(statement)`).
- New models must be exported from `models/__init__.py` and imported by metadata wiring such as `core/database.py` and `alembic/env.py` so tests, table creation, and Alembic autogenerate see them.
- Treat `include_deleted` as query behavior. It is not authorization.
- The current user `password` column stores an Argon2 hash, not plaintext. Request schemas may accept password input, but read schemas must not expose it.

## Human-Readable Business IDs
- Use `utils.identifiers.generate_business_id(prefix)` for UI-facing ids.
- Name the persisted field after the resource, for example `user_id`, not `business_id`, when that is the clearest API contract for the table.
- Business id columns should be unique, indexed, non-null after migration backfill, and long enough for the configured prefix plus random suffix.
- Generate business ids in services during create flows. Do not accept them from create or update request payloads unless a feature explicitly requires an imported external id.
- Expose business ids from read schemas when the frontend needs a stable human-readable reference.
- Include business ids in list search and `sort_by` allow-lists when the UI displays or filters by them.
- Do not use business ids as a substitute for authorization or as proof that a record is safe to access.

## Filtering And Sorting
- Shared list query fields live in `schemas/common.py` and `core/deps.py` only when they are truly cross-resource.
- Resource-specific query parsing stays with the resource route, as `routers/users.py` does with `get_user_list_query_params()`.
- Resource-specific filter/query schemas stay in the owning schema module.
- Each service must map allowed `sort_by` values to ORM columns explicitly.
- Never pass raw client field names into ORM ordering.
- Use `utils.sorting.stable_order_by()` for sorted lists so ties fall back to `id`.

## Authentication Boundary
- User records and Argon2 password hashing exist, but full authentication is not wired.
- Do not describe login, current-user loading, route protection, or authorization as implemented unless the backend includes real route dependencies and tests for that flow.
- When auth is added, document the dependency path and enforce it per route rather than relying on comments, naming, or response messaging.

## Migrations
- For every `models/` change that alters table shape, run `alembic revision --autogenerate -m "describe change"` first.
- Review the generated diff before making manual edits. Manual edits should be narrow and explainable from the model change, data backfill, or database limitation.
- When adding a required business id to an existing table, use a safe migration sequence: add nullable, backfill existing rows with unique prefixed values, alter to non-null, then add the unique index.
- Add a new revision for new schema work. Do not rewrite older shared or applied revisions.
- Keep model, schema, service/router contract, tests, and migration files in sync when one feature touches all of them.

## Testing Standards
- Tests live under `tests/` and are discovered by `pytest.ini`.
- The API tests are async, marked with `pytest.mark.anyio`, and use an `httpx.AsyncClient` against the running Uvicorn server thread.
- `tests/conftest.py` overrides `get_session()` (sync) and `get_async_session()` (async) with in-memory SQLite database setups; keep this deterministic pattern unless a test specifically needs another database.
- Assert that API response bodies contain `meta.request_id`.
- Verify database state and side effects (like audit logs) using direct async session queries.
- Cover response-envelope changes, list metadata, filtering, sorting, soft delete/restore, conflict behavior, and persistence transforms such as password hashing.
- When adding a business id to a resource, cover creation, read-schema exposure, prefix shape, search/sort behavior when applicable, and the fact that create/update payloads do not control the generated value.
