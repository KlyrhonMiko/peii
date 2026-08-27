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
./.venv/bin/uvicorn main:app --reload --no-access-log --no-proxy-headers
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

The fresh-database baseline is `20260825_v1`. The current forward chain is
`f77a807cf2f9` (distribution security) -> `d1f9bad768ad` (distribution expiry compatibility)
-> `fb1c93d15474` (Phase 3 retention and withdrawal), and `fb1c93d15474` is the current Alembic
head. For production, run `./.venv/bin/alembic upgrade head` once as the managed-service
release job before API replicas are promoted. Do not run migrations independently in every
replica. Review the Phase 3 survey-policy and response-deadline backfill before activating the
external purge job.

The Phase 2 expand revision adds SHA-256 token digests, 8-character prefixes, and consent
evidence while retaining plaintext distribution tokens for the compatibility window. Follow the
exact expand -> dual-write/digest-first -> reconcile -> digest-only app -> later contract/drop
gate sequence in the deployment roadmap; plaintext has not yet been removed. Distribution
expiry remains nullable, and Phase 3 does not fix the outstanding distribution token/expiry
issues.

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
- Distribution metadata listings never return tokens; a newly issued or rotated token is
  returned only once. `expires_at` is nullable: a supplied expiry is validated, while null does
  not expire automatically. Archiving a survey revokes unrevoked distributions. Restoring it
  leaves it inactive, so activation and a new link are explicit follow-up actions. Distribution
  token storage/removal and mandatory-expiry policy remain outside Phase 3.
- Public distribution links are shared bearer links and do not guarantee respondent uniqueness;
  idempotency protects retries for one distribution/key pair only. Consent is a global,
  versioned contract, and accepted responses retain an immutable notice snapshot. The public
  acknowledgement is minimal (`{"accepted": true}`), and successful respondent IP addresses
  are not stored in response audits. Do not promise confidentiality or respondent anonymity.
- Production requires managed Redis, configured either with a Redis-compatible `REDIS_URL`
  or both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, with
  `RATE_LIMIT_ENABLED=true` and
  `RATE_LIMIT_READ_FAILURE_POLICY=fail_closed`, approved consent text/contact/retention values,
  configured trusted ingress CIDRs, and verified provider log redaction. Real respondents remain
  blocked until all of these are recorded in the production runbook.
- Non-debug startup requires `RATE_LIMIT_INCLUDE_CLIENT_IP=true`; deploy only after confirming
  that the app-owned resolver receives the expected trusted proxy peer and headers. Withdrawal
  uses a configurable strict client limit (10/minute by default) before a separate high global
  circuit breaker (1,000/minute by default).
- New surveys default to retention enabled for 1,825 days (five years). Each response receives
  an immutable submission-time `retention_expires_at`; disabled retention gives new responses a
  null deadline and does not rewrite existing snapshots. Retention settings cannot change after
  any response row exists, including a tombstone.
- Raw responses, aggregates, and exports exclude logically deleted and read-time expired rows,
  but authorized access remains available for archived surveys. Aggregates are available for
  every survey status, accept no filters, and return exact totals and cells even for one to four
  responses. Live results can change as responses arrive, and small-group aggregates are not
  anonymous or privacy-preserving. Raw listing is paginated (default 50, maximum 100) and
  supports only submission-time range and distribution filters.
- The browser generates a private 256-bit withdrawal code and shows it once after submission.
  The backend stores only its HMAC-SHA-256 digest under `WITHDRAWAL_CODE_HMAC_SECRET`; a lost
  code cannot be recovered. The public withdrawal API is
  `POST /api/v1/survey/responses/withdraw`, with the frontend page at `/survey/withdraw`.
- Long-format CSV export is streamed, private/no-store, preflight-capped at 10,000 eligible
  responses, and bounded to the accepted preflight count even if rows are inserted before the
  deferred stream runs. Its correlated start, success, and aborted audits distinguish the
  accepted count from the actual records traversed. Selected erasure or all-response erasure
  writes minimal tombstones and is idempotent; all-scope erasure requires an archived survey.
  Retention purge is a bounded external command, not an in-process timer:
  `./.venv/bin/python scripts/purge_expired_responses.py [--dry-run]`.

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
  responses, aggregates, streamed export, and erasure.
- `/survey/{token}`: public survey loading and idempotent response submission.
- `/survey/responses/withdraw`: public withdrawal by respondent-held code.
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
