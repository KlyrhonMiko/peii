# Repository Guide

## Scope
This repo contains two applications:

- `frontend/`: Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, and shadcn-style
  source components backed by Base UI primitives.
- `backend/`: FastAPI, SQLModel, Alembic, Python 3.14, Ruff, mypy, and pytest.

This root guide is the entrypoint only. Frontend-local and backend-local practices live in
the deeper guides below. Read the closest guide before editing files in that area.

## Guide Hierarchy
Start frontend work with `frontend/AGENTS.md`, then use the local guide:

- `frontend/src/app/AGENTS.md`
- `frontend/src/app/admin/AGENTS.md`
- `frontend/src/app/researcher/AGENTS.md`
- `frontend/src/app/survey/AGENTS.md`
- `frontend/src/components/AGENTS.md`
- `frontend/src/components/ui/AGENTS.md`
- `frontend/src/hooks/AGENTS.md`
- `frontend/src/lib/AGENTS.md`

Start backend work with `backend/AGENTS.md`, then use the local guide:

- `backend/core/AGENTS.md`
- `backend/models/AGENTS.md`
- `backend/schemas/AGENTS.md`
- `backend/routers/AGENTS.md`
- `backend/services/AGENTS.md`
- `backend/utils/AGENTS.md`
- `backend/tests/AGENTS.md`
- `backend/alembic/AGENTS.md`
- `backend/alembic/versions/AGENTS.md`

Do not duplicate detailed frontend or backend rules at the repo root when a deeper guide
already owns them.

## Project Structure
- `frontend/src/app/` contains App Router layouts, pages, route segments, and
  `globals.css`.
- `frontend/src/components/` contains product-level reusable UI.
- `frontend/src/components/ui/` contains generic shadcn-style primitives.
- `frontend/src/hooks/` and `frontend/src/lib/` contain reusable hooks and utilities.
- `frontend/public/` contains static assets.
- `backend/main.py` wires FastAPI, CORS, exception handlers, and the API router.
- `backend/core/` contains settings, database wiring, shared dependencies, responses, and
  handlers.
- `backend/models/`, `schemas/`, `routers/`, `services/`, and `utils/` define the API
  layers.
- `backend/alembic/` contains migration runtime config and revision history.
- `backend/tests/` contains deterministic pytest coverage.

## Command Surface
Frontend commands run from `frontend/`:

- `npm install`
- `npm run dev`
- `npm run lint`
- `npm run build`
- `npm run start`

Backend commands run from `backend/`:

- `python3.14 -m venv .venv`
- `./.venv/bin/pip install -r requirements.txt`
- `./.venv/bin/uvicorn main:app --reload`
- `./.venv/bin/ruff check .`
- `./.venv/bin/mypy .`
- `env DEBUG=false ./.venv/bin/pytest -q`
- `alembic upgrade head`
- `alembic revision --autogenerate -m "describe change"`

Use `docker compose up --build` from the repo root when you need the full stack:
frontend, backend, PostgreSQL, and Adminer.

## Validation
Before committing frontend work, run from `frontend/`:

- `npm run lint`
- `npm run build`

Before committing backend work, run from `backend/`:

- `./.venv/bin/ruff check .`
- `./.venv/bin/mypy .`
- `env DEBUG=false ./.venv/bin/pytest -q`

The root `.pre-commit-config.yaml` is intentionally strict:

- `pre-commit`: backend Ruff, backend mypy, backend pytest, frontend lint,
  frontend build.
- `pre-push`: backend pytest, frontend build.

Expect `git commit` to run the backend test suite and the frontend production build.

## Frontend Standards
- Defer detailed frontend rules to `frontend/AGENTS.md` and its nested guides.
- Preserve strict TypeScript and type-aware ESLint settings.
- Prefer server components by default; use `"use client"` only when client behavior is
  required.
- Prefer existing `src/components/ui/` primitives, semantic tokens, and `cn()` before
  custom markup.
- Keep Recharts and other client-only libraries behind focused client components.
- Do not assume route protection or auth exists just because an admin page exists.

## Backend Standards
- Defer detailed backend rules to `backend/AGENTS.md` and its nested guides.
- Keep routers thin, services responsible for business logic and ORM queries, schemas for
  API contracts, and models for persistence shape.
- Preserve the shared response envelope: `data`, `message`, `errors`, and `meta`.
- The current user `password` column stores an Argon2 hash; read schemas must not expose
  password data.
- Do not describe login, current-user loading, authorization, or route protection as
  implemented unless real dependencies and tests exist.

## Migration And Configuration Practices
- Runtime settings load from the repo-root `.env`.
- Update `.env.example` whenever config keys, modes, or expected formats change.
- For every backend model change that alters table shape, the migration flow is mandatory:
  run `alembic revision --autogenerate -m "..."` first, review the generated diff, then
  make narrow manual fixes only if needed.
- Add new Alembic revisions for new schema work. Do not rewrite older shared or applied
  revisions.
- Keep backend model, schema, service/router behavior, tests, and migrations aligned in
  the same feature change.

## Commit And Pull Request Guidelines
Use short imperative commits, such as `Add user service pagination` or
`Create health endpoint tests`.

PRs should describe scope, note env or migration changes, include screenshots for UI
updates, and list the validation commands that ran.
