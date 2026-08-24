# PEII

PEII is a full-stack survey and analytics application for alumni employability research.
The repository contains a Next.js portal and public survey frontend plus a FastAPI API
for authentication, RBAC, survey management, responses, audit logs, and sentiment models.

## Applications

- `frontend/`: Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Base UI, Supabase SSR,
  Recharts, and Vitest.
- `backend/`: FastAPI, SQLModel, Alembic, PostgreSQL, Supabase Auth, Ruff, mypy, and pytest
  on Python 3.14.

## Prerequisites

- Node.js and npm compatible with Next.js 16
- Python 3.14
- PostgreSQL 17 for a host-managed local database, Docker with Docker Compose, or a
  configured Supabase database
- A Supabase project for authentication

## Configuration

Copy `.env.example` to `.env` at the repository root and replace every placeholder. Backend
settings have no defaults and application imports fail when required values are missing.

Database URLs depend on where the backend runs:

- Docker Compose uses the `postgres` service hostname.
- A backend started directly on the host normally uses `localhost` for local PostgreSQL.
- A frontend started directly on the host should use a `BACKEND_INTERNAL_URL` with
  `localhost`; the example's `backend` hostname is for Compose.
- `DB_MODE=supabase` selects `SUPABASE_DATABASE_URL`; Compose still starts its PostgreSQL
  and Adminer services unless they are explicitly omitted.

Keep `SUPABASE_SECRET_KEY` server-only. `NEXT_PUBLIC_API_URL` is intentionally exposed to
the browser for public survey and development sentiment requests.

## Production

The approved deployment topology uses a managed Next.js host, managed Python web service,
managed PostgreSQL, Supabase Auth, and managed Redis for distributed rate limiting. Run
Alembic exactly once as a release job before promoting API replicas; do not let each API
replica migrate independently. Docker deployment is out of scope.

See [production decisions](docs/production-decisions.md),
[privacy and retention](docs/privacy-and-retention.md), and the
[deployment roadmap](docs/deployment-roadmap.md) for the required host, privacy, retention,
recovery, release, and Phase 1A rollout policies. Provider, region, domain, consent, and
rate-limit implementation details must be completed before public launch.

## Local Development

Start the backend from `backend/`:

```bash
python3.14 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/alembic upgrade head
./.venv/bin/python scripts/seed_rbac.py
./.venv/bin/python scripts/bootstrap_admin.py
./.venv/bin/uvicorn main:app --reload
```

Start the frontend from `frontend/`:

```bash
npm install
npm run dev
```

The frontend is available at `http://localhost:3000`; API documentation is available at
`http://localhost:8000/api/v1/docs`.

## Docker Compose

From the repository root:

```bash
docker compose up --build
```

Compose defines frontend (`3000`), backend (`8000`), PostgreSQL (`5432`), and Adminer
(`8080`). The current Compose startup does not apply Alembic migrations automatically;
initialize a new database before relying on the application services.

## Validation

Run frontend checks from `frontend/`:

```bash
npm run lint
npm test
npm run build
```

Run backend checks from `backend/`:

```bash
./.venv/bin/ruff check .
./.venv/bin/mypy .
env DEBUG=false ./.venv/bin/pytest -q
```

The normal backend suite skips PostgreSQL integration tests when `TEST_DATABASE_URL` is
absent. Run those tests against an isolated PostgreSQL database with:

```bash
TEST_DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/peii_test \
  env DEBUG=false ./.venv/bin/pytest -q -m integration --require-postgres
```

See `frontend/AGENTS.md`, `backend/AGENTS.md`, and the nested `AGENTS.md` files for local
architecture and contribution rules.
