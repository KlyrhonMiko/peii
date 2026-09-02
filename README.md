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
- `DB_MODE=supabase` selects `SUPABASE_DATABASE_URL`; Compose can still start its local
  PostgreSQL service, while Adminer is available only through the `tools` profile.
- Local Compose sets `DATABASE_TLS_MODE=disable` by default. Production Supabase deployments
  must use `DATABASE_TLS_MODE=require`. For psycopg2/Alembic, that setting uses
  `sslmode=require`: it encrypts transport but does not verify the server certificate or
  hostname. Asyncpg uses `ssl="require"` so the Supavisor pooler connection follows the same
  encryption-only transition. Provider SSL enforcement and eventual CA-backed `verify-full` for
  every database path remain manual follow-up items with an explicitly recorded owner and deadline.

Keep `SUPABASE_SECRET_KEY` server-only. `NEXT_PUBLIC_API_URL` is intentionally exposed to
the browser for development sentiment requests. After isolated Google authentication, the
server-rendered identified survey page may fetch its survey GET from FastAPI through
`BACKEND_INTERNAL_URL`; browser submission uses the focused same-origin `/api/survey/[token]`
BFF. Public withdrawal remains a direct, code-only API operation. `SURVEY_OAUTH_STATE_KEY` is
server-only and must be a random value of
at least 32 bytes. The backend uses `GOOGLE_OAUTH_CLIENT_ID`, a dedicated random-at-least-32-byte
`SURVEY_RESPONDENT_HMAC_SECRET`, a Google session max age (default 300 seconds, production
maximum 3,600), and Google attestation limits of 5 per 60 seconds. Configure the Google provider
in Supabase Auth with minimum scopes `openid email profile`, add the exact
`${APP_ORIGIN}/auth/survey/google/callback` to the Supabase Auth redirect allowlist, and set the
Google OAuth client redirect URI to the Google/Supabase provider callback as appropriate.
Compose uses explicit per-service environment allowlists: the frontend receives only browser and
server-runtime settings, the backend receives its application settings, PostgreSQL receives only
its database bootstrap settings, and Adminer receives only its default server. The root `.env` is
never passed wholesale to a container.

## Production

The approved deployment topology uses a managed Next.js host, managed Python web service,
managed PostgreSQL, Supabase Auth, and managed Redis for distributed rate limiting. Run
Alembic exactly once as a release job before promoting API replicas; do not let each API
replica migrate independently. Docker deployment is out of scope.

Survey GET and submit require a dedicated Google OAuth respondent session and backend proof. The
server-rendered page may fetch GET through `BACKEND_INTERNAL_URL` after isolated auth, while
browser submission uses the focused same-origin `/api/survey/[token]` BFF. The portal remains
password/invite/recovery based and rejects OAuth sessions. Use consent version `2026-09-01` in
local examples only; approved production consent and privacy values remain an explicit launch
gate. Do not promise anonymity or confidentiality.

Production API documentation is disabled when `DEBUG=false`; operational headers are owned by the
application that serves the response: Next.js owns browser/document headers and FastAPI owns
public survey API headers. `BACKEND_CORS_ORIGINS` must contain exact HTTPS origins only (no
wildcards, paths, or trailing slashes).

The global Next.js proxy excludes `/api`; authenticated browser API calls use the allowlisted
same-origin `/api/backend` BFF, which owns Supabase session lookup. The BFF caps request bodies
at 65,536 bytes, gives body reads 15 seconds, waits 15 seconds only for upstream response
headers, propagates client cancellation, performs no retries, and marks local errors `no-store`.
Production Supabase mode additionally requires fail-closed rate-limit reads, verified immediate
proxy CIDRs, and secure Redis configuration; see the canonical production documents for details.

Before launch, operators must manually rotate credentials exposed during development, remove the
`public` schema from Supabase Data API exposed schemas, track provider SSL enforcement and the
eventual CA-backed `verify-full` follow-up for all database paths, and configure HSTS on
Vercel and Render, and verify provider redaction, no-store
behavior, backups/PITR, and the external purge schedule. These provider actions are not performed
by this repository.

See [production decisions](docs/production-decisions.md),
[privacy and retention](docs/privacy-and-retention.md), and the
[deployment roadmap](docs/deployment-roadmap.md) for the Phase 2 compatibility and Phase 3
response-operations contracts, token migration, retention, withdrawal, privacy, recovery,
release, and launch-gate policies. Real respondents remain blocked until the documented PostgreSQL
migration, Redis, consent, trusted-ingress, Google provider/browser, purge, and provider
logging/streaming checks are verified. Application tests alone are not proof of database or
provider behavior.

## Local Development

Start the backend from `backend/`:

```bash
python3.14 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/alembic upgrade head
./.venv/bin/python scripts/bootstrap_admin.py
./.venv/bin/uvicorn main:app --reload --no-access-log --no-proxy-headers
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

Compose defines frontend (`127.0.0.1:3000`), backend (`127.0.0.1:8000`), PostgreSQL
(`127.0.0.1:5432`), and an opt-in Adminer tool (`127.0.0.1:8080`). Adminer is excluded from the
default graph; start it explicitly with `docker compose --profile tools up adminer`. Compose does
not apply Alembic migrations automatically; initialize a new database before relying on the
application services. The current Alembic head is `a8055c9859f5`, after `d5a4f7c91e2b`.
`a8055c9859f5` adds short-lived Google survey auth proofs, nullable legacy-compatible response
identity snapshots, survey-scoped dedupe uniqueness, `survey_responses.read_identity`, and
proof-table ACL/RLS lockdown. Its downgrade is intentionally fail-closed and irreversible.

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
