# Backend

FastAPI API for PEII authentication, RBAC, user administration, survey authoring and
distribution, public responses, audit logs, and sentiment inference.

## Run locally

1. Copy the root `.env.example` to `.env` and replace every placeholder. All backend
   settings are required; there are no startup defaults.

   For a backend process running directly on the host, a local PostgreSQL URL normally
   uses `localhost`. The `postgres` hostname in the example is for Docker Compose.

2. Install dependencies from `backend/`:

```bash
python3.14 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

3. Apply migrations and initialize RBAC/admin data:

```bash
./.venv/bin/alembic upgrade head
./.venv/bin/python scripts/seed_rbac.py
./.venv/bin/python scripts/bootstrap_admin.py
```

The bootstrap command uses the `INITIAL_ADMIN_*` settings and Supabase Admin API. It
links or invites that identity and grants the seeded `admin` role.

4. Start the development server:

```bash
./.venv/bin/uvicorn main:app --reload
```

The backend loads the root `.env` automatically.

Database mode is controlled from the root `.env`:

- `DB_MODE=local` uses `LOCAL_DATABASE_URL`
- `DB_MODE=supabase` uses `SUPABASE_DATABASE_URL`
- `SQL_ECHO=false` keeps SQLAlchemy query logs off for normal development output

## Supabase Auth email links

The backend sends recovery and invitation redirects to
`APP_ORIGIN/auth/confirm?next=/reset-password`. The frontend route at that application
origin completes the Supabase session. Configure the URL in the Supabase Auth redirect
allowlist for every environment.

Use token-hash links in the Supabase email templates so access and refresh
tokens are never placed in the browser URL. Build the callback from `SiteURL`
instead of appending to `RedirectTo`, because Supabase can resolve the latter to
the bare site origin:

```text
# Recovery template
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password

# Invite template
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/reset-password
```

Do not use an implicit-flow link that includes `#access_token` or
`#refresh_token`.

## Database migrations

Run migrations from `backend/`:

```bash
./.venv/bin/alembic upgrade head
```

Create a new migration after model changes:

```bash
./.venv/bin/alembic revision --autogenerate -m "describe change"
```

For production, run `./.venv/bin/alembic upgrade head` once as the managed-service release
job before API replicas are promoted. Do not run migrations independently in every replica.

## Survey Lifecycle Policy

- Every public distribution has a mandatory expiry.
- Deleting a survey archives it and revokes every unrevoked distribution link.
- Restoring an archived survey returns it as inactive; publishing and issuing a new link are
  explicit follow-up actions.
- Surveys are a shared workspace: every authenticated portal user can manage every survey,
  including distributions and raw responses. Retention and consent policy are documented in
  `../docs/privacy-and-retention.md`.

## Validation

Run these from `backend/`:

```bash
env DEBUG=false ./.venv/bin/pytest -q
./.venv/bin/ruff check .
./.venv/bin/mypy .
```

## Run with Docker

From the repo root:

```bash
docker compose up --build
```

PostgreSQL and Adminer always start with the full Compose graph. `DB_MODE=supabase`
changes the database URL selected by the backend but does not disable those services.

Compose does not currently apply Alembic migrations automatically. Initialize a fresh
database before using the application.

For local database containers only:

```bash
docker compose up postgres adminer
```

Services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Adminer: `http://localhost:8080`
- PostgreSQL: `localhost:5432`

## API Surface

Routes are mounted below `API_V1_PREFIX` (normally `/api/v1`):

- `/auth`: login, current principal, logout, recovery, and password changes.
- `/rbac`: permissions, roles, and role assignments.
- `/users` and `/audit-logs`: administration and audit history.
- `/surveys`: surveys plus nested sections, questions, distributions, and
  responses.
- `/survey/{token}`: public survey loading and idempotent response submission.
- `/ml`: model catalog and sentiment inference. Model weights load lazily and may require
  substantial network, disk, memory, and CPU resources on first use.

Protected routes accept a Supabase bearer token and resolve it through JWKS verification,
the local user record, and effective role/permission dependencies.

## Structure

- `core/`: settings, auth/JWKS, database sessions, dependencies, tracing, responses, and
  handlers.
- `core/deps.py`: shared FastAPI dependencies and common query params.
- `core/handlers.py`: global API exception handling.
- `models/base_model.py`: shared timestamped UUID and resource base classes. Most resources
  use them; audit logs have a distinct persistence shape.
- `models/`: SQLModel table definitions.
- `schemas/`: request and response schemas for FastAPI.
- `routers/`: API endpoint modules.
- `services/`: business-logic layer.
- `utils/`: project-specific helpers.
- `scripts/`: RBAC/admin initialization and optional survey seed scripts.
