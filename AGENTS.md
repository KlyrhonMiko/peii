# Repository Guidelines

## Project Structure & Module Organization
This repo has two apps: `frontend/` for the Next.js 16 UI and `backend/` for the FastAPI API. Frontend routes live in `frontend/src/app`; static files live in `frontend/public`.

Frontend guidance is intentionally delegated to the deeper guides under `frontend/`. Start with `frontend/AGENTS.md`, then follow the directory-local guide for the area you are changing:
- `frontend/src/app/AGENTS.md`
- `frontend/src/app/admin/AGENTS.md`
- `frontend/src/app/researcher/AGENTS.md`
- `frontend/src/app/survey/AGENTS.md`
- `frontend/src/components/AGENTS.md`
- `frontend/src/components/ui/AGENTS.md`
- `frontend/src/hooks/AGENTS.md`
- `frontend/src/lib/AGENTS.md`

Backend guidance is intentionally delegated to the deeper guides under `backend/`. Start with `backend/AGENTS.md`, then follow the directory-local guide for the area you are changing:
- `backend/core/AGENTS.md`
- `backend/models/AGENTS.md`
- `backend/schemas/AGENTS.md`
- `backend/routers/AGENTS.md`
- `backend/services/AGENTS.md`
- `backend/utils/AGENTS.md`
- `backend/tests/AGENTS.md`
- `backend/alembic/AGENTS.md`
- `backend/alembic/versions/AGENTS.md`

Do not duplicate or invent frontend-local or backend-local practices at the repo root when a deeper guide already defines them.

## Build, Test, and Development Commands
Frontend commands run from `frontend/`: `npm install`, `npm run dev`, `npm run lint`, `npm run build`, and `npm run start`. The exact frontend linting, component, routing, and build expectations live in `frontend/AGENTS.md` and its deeper guides.

Backend commands run from `backend/`:
- `python3.14 -m venv .venv && ./.venv/bin/pip install -r requirements.txt` installs backend dependencies into the repo-local venv.
- `./.venv/bin/uvicorn main:app --reload` starts the API. The backend loads the repo-root `.env`.
- `env DEBUG=false ./.venv/bin/pytest -q`, `./.venv/bin/ruff check .`, and `./.venv/bin/mypy .` run tests, linting, and type checks.
- `alembic upgrade head` applies schema migrations.
- `alembic revision --autogenerate -m "add users table"` creates a new migration after model changes.

Use `docker compose up --build` from the repo root when you need the full stack: frontend, backend, PostgreSQL, and Adminer.

## Coding Style & Naming Conventions
Follow the current Python style in `backend/`: 100-character lines, double quotes where the formatter chooses them, and import ordering that satisfies Ruff. Use `PascalCase` for React components and SQLModel classes, `snake_case` for Python modules, and `test_*.py` for deterministic pytest files.

For frontend architecture, route boundaries, component layering, hook patterns, strict TypeScript expectations, and lint/build conventions, defer to the deeper `frontend/**/AGENTS.md` files instead of restating those rules here.

For backend architecture, response contracts, filtering, sorting, service patterns, test conventions, and migration handling, defer to the deeper `backend/**/AGENTS.md` files instead of restating those rules here.

## Testing, Linting, and Pre-Commit Practice
Before committing backend work, run `./.venv/bin/ruff check .`, `./.venv/bin/mypy .`, and `env DEBUG=false ./.venv/bin/pytest -q` from `backend/`; for frontend work, run `npm run lint` and `npm run build` from `frontend/`.

This repo now commits a shared pre-commit configuration at `.pre-commit-config.yaml`. The current hook strategy is:
- `pre-commit`: backend `ruff`, backend `mypy`, backend `pytest`, frontend `lint`, frontend `build`
- `pre-push`: backend `pytest`, frontend `build`

This is intentionally strict. Expect `git commit` to run the full backend test suite and the frontend production build before a commit is created.

## Migration & Configuration Practices
Load runtime settings from the repo-root `.env`; update `.env.example` whenever config keys change.

For any `backend/models/` change, the migration flow is mandatory: run `alembic revision --autogenerate -m "..."` first, review the generated diff, then make manual fixes only if needed. Do not hand-write a fresh migration before autogenerate, and do not rewrite shared migration files; add a new revision instead.

Backend model, schema, service, router, and migration changes should stay in sync. The exact directory-level expectations live in the deeper backend guides.

## Commit & Pull Request Guidelines
History is still minimal, so use short imperative commits such as `Add user service pagination` or `Create health endpoint tests`. PRs should describe scope, note env or migration changes, include screenshots for UI updates, and list the validation you ran.
