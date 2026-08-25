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

3. Apply the canonical first-release baseline and initialize the administrator:

```bash
./.venv/bin/alembic upgrade head
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

The current migration head is the canonical first-release baseline `20260825_v1`. For production, run
`./.venv/bin/alembic upgrade head` once as the managed-service release job before API
replicas are promoted. Do not run migrations independently in every replica. The baseline is
intended for a fresh database; future schema changes must be forward revisions after
`20260825_v1`.

## Survey Access And Lifecycle Policy

- Survey access is global RBAC, not unrestricted authentication. A permitted principal can act
  on any survey in the shared workspace, but every
  operation still requires its explicit capability.
- The seven survey capabilities are `surveys.read`, `surveys.manage`,
  `survey_distributions.manage`, `survey_responses.read_aggregates`,
  `survey_responses.read_raw`, `survey_responses.export`, and `survey_responses.erase`.
  Admin has all seven; researcher has all except erase; staff has `surveys.read` and
  `survey_responses.read_aggregates`. Existing portal and ML capabilities remain in each
  default role. Raw and CSV export are separately permissioned; erase is admin-default.
- Every public distribution has an explicit mandatory expiry. Metadata listing never returns
  tokens; a newly issued or rotated token is returned only once. Archiving a survey revokes
  unrevoked distributions. Restoring it leaves it inactive, so activation and a new link are
  explicit follow-up actions.
- Aggregate responses use conservative `k=5` suppression and only supported categorical,
  boolean, multiple-choice, scale, ranking, and matrix question types. Raw responses and
  long-format CSV export are separate routes and permissions. Selected erasure or all-response
  erasure writes minimal tombstones and is idempotent; all-scope erasure requires an archived
  survey.

See [production decisions](../docs/production-decisions.md),
[privacy and retention](../docs/privacy-and-retention.md), and the
[deployment roadmap](../docs/deployment-roadmap.md) for the canonical first-release
deployment, RBAC, privacy, validation, backup, and rollback guidance.

## Validation

Run these from `backend/`:

```bash
env DEBUG=false ./.venv/bin/pytest -q
./.venv/bin/ruff check .
./.venv/bin/mypy .
```

The normal suite skips tests marked `integration` when `TEST_DATABASE_URL` is absent. Run the
isolated PostgreSQL integration tests explicitly with:

```bash
TEST_DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/peii_test \
  env DEBUG=false ./.venv/bin/pytest -q -m integration --require-postgres
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
