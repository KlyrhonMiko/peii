# Backend Guide

## Scope
This file applies to everything under `backend/` unless a deeper `AGENTS.md` overrides it.

## Development Flow
- Treat `backend/README.md` plus the committed config files here as the source of truth for commands and structure.
- Run backend work from `backend/`.
- Use `python3.14 -m venv .venv`, `./.venv/bin/pip install -r requirements.txt`, `./.venv/bin/uvicorn main:app --reload`, `env DEBUG=false ./.venv/bin/pytest -q`, `./.venv/bin/ruff check .`, `./.venv/bin/mypy .`, and `alembic upgrade head` as the normal command surface.
- The app loads the repo-root `.env` through `core/config.py`; keep `.env.example` aligned when config keys or modes change.
- Database selection is environment-driven through `DB_MODE`, `LOCAL_DATABASE_URL`, and `SUPABASE_DATABASE_URL`.

## Architecture
- `main.py` wires `FastAPI`, CORS, exception handlers, and the versioned API router.
- Keep routers thin. Parse HTTP input in routers, keep business rules and ORM queries in `services/`, and keep shared infrastructure in `core/`.
- Prefer explicit Pydantic schemas over ad hoc dict payloads.
- Keep route registration centralized in `routers/api.py`.
- There is no real authentication or authorization dependency wired yet. Do not describe route protection as implemented unless you add the full login and current-user flow.

## API Contracts
- Preserve the universal response envelope from `core/responses.py`: `data`, `message`, `errors`, `meta`.
- Keep success and error payloads going through `success_response()` and `error_response()`.
- Keep list responses on the shared shape returned by `list_meta_response()`: `meta.pagination` plus `meta.filters`.
- `meta.pagination` is shared across list endpoints. `meta.filters` always exists structurally, but its fields are endpoint-specific.
- Custom app failures should continue to raise `core.exceptions.AppError` so `core/handlers.py` can convert them into the shared error envelope.

## Filtering And Sorting
- Shared list params belong in `schemas/common.py` and `core/deps.py` only when they are genuinely cross-resource.
- Keep resource-specific query parsing near the resource route, as `routers/users.py` does with `get_user_list_query_params()`.
- Put resource-specific filter schemas in the owning schema module, for example `schemas/user.py`.
- Map allowed `sort_by` fields explicitly per service. Never pass raw client field names directly into ORM ordering.
- Use `utils/sorting.py:stable_order_by()` so primary sort ties fall back to `id`.

## Data And Persistence
- The shared SQLModel base in `models/base_model.py` defines UUIDv7 ids, audit timestamps, soft-delete fields, and `performed_by`.
- Current persistence uses SQLModel with explicit `select(...)` queries and service-level filter helpers.
- When a model needs to be visible to SQLModel metadata or Alembic autogenerate, ensure it is imported from the live metadata wiring modules such as `core/database.py` and `alembic/env.py`.
- Treat `include_deleted` as query behavior, not as permission enforcement.

## Validation
- Backend gate from `backend/`: `./.venv/bin/ruff check .`, `./.venv/bin/mypy .`, `env DEBUG=false ./.venv/bin/pytest -q`.
- If PATH does not expose the tools, fall back to the repo-local binaries in `backend/.venv/bin/`.
- The root `.pre-commit-config.yaml` currently runs backend `ruff`, `mypy`, and `pytest` before a commit completes, and reruns `pytest` on `pre-push`.
- Keep tests deterministic. The current suite uses an async `httpx` client against a localhost `uvicorn` server plus a dependency override to an in-memory SQLite engine in `tests/conftest.py`.

## Migrations
- For any `models/` change, run `alembic revision --autogenerate -m "..."` first, inspect the generated diff, then make manual fixes only if needed.
- Add new migration files. Do not rewrite old shared revisions.
- Commit model, schema, service or router contract, and migration changes together when they are part of one backend feature.
