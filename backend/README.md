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
-> `fb1c93d15474` (Phase 3 retention and withdrawal) -> `2bf09a6bc738` (remove plaintext
distribution tokens) -> `d5a4f7c91e2b` (Supabase Data API RLS/ACL lockdown) ->
`a8055c9859f5` (Google survey respondent identity and auth proofs).
`a8055c9859f5` is the current Alembic head. For production, run
`./.venv/bin/alembic upgrade head` once as the managed-service release job before API replicas
are promoted. Do not run migrations independently in every replica. Review the Phase 3
survey-policy and response-deadline backfill before activating the external purge job.

Historically, the Phase 2 expand revision added SHA-256 token digests, 8-character prefixes, and
consent evidence while retaining plaintext distribution tokens for its compatibility window;
`d1f9bad768ad` also made the database expiry column nullable. The current `2bf09a6bc738` contract
revision backfills and requires token digests, then drops the plaintext token column. Runtime
create/rotate stores digest plus prefix only, list/revoke metadata is token-free, and create/rotate
reveal the generated token once. Omitted expiry receives the configured server default (currently
30 days); explicit expiry is limited by the configured maximum (currently 30 days). Historical
rows with a null expiry remain possible and non-expiring.

The runtime values are configured with `SURVEY_DISTRIBUTION_DEFAULT_EXPIRY_DAYS` and
`SURVEY_DISTRIBUTION_MAX_EXPIRY_DAYS` (both currently `30`).

The `d5a4f7c91e2b` migration enables RLS for the protected application tables and revokes
effective table/column privileges and schema creation from `PUBLIC`, `anon`, `authenticated`,
and `service_role`. Its default-privilege revokes are limited to objects subsequently created by
the current migration role (`current_user`) in the current schema; provider-owned/global
defaults and defaults for other object creators are not mutated and require separate
provider/admin configuration. It creates no policies, so direct Data API access remains denied;
the FastAPI service uses its database owner/service connection. Before changing privileges or RLS,
it requires `current_user` to own every protected table. On later Alembic runs, the environment
preflight also requires an existing RLS-enabled `alembic_version` table to be owned by (or
accessible to a `BYPASSRLS` migration role) and to grant that identity effective `SELECT`,
`INSERT`, `UPDATE`, and `DELETE`; it is a no-op before that table exists. The migration validates
its postconditions and its downgrade intentionally raises instead of attempting an unsafe reversal.
Treat it as an irreversible, fail-closed release step.

The `a8055c9859f5` migration adds short-lived Google survey auth proofs, nullable
legacy-compatible response identity snapshots, survey-scoped dedupe uniqueness, and the
`survey_responses.read_identity` capability. It applies the proof-table ACL/RLS lockdown.
Default `admin` and `researcher` roles receive identity permission; `staff` does not. Raw,
aggregate, and CSV response contracts remain identity-free, and the identity endpoint requires
both `survey_responses.read_raw` and `survey_responses.read_identity`.

For production Supabase connections, `DATABASE_TLS_MODE=require` gives psycopg2/Alembic
`sslmode=require`, which provides encryption only and does not verify the server certificate or
hostname. Asyncpg uses `ssl="require"` so the Supavisor pooler connection follows the same
encryption-only transition. Provider SSL enforcement and eventual CA-backed `verify-full` for all
database paths remain manual follow-up items; record an owner and deadline before launch.

## RBAC role-assignment safety

Role assignment is constrained by the acting principal's effective permissions: an actor cannot
grant a role that contains permissions beyond their own. The protected system Admin role can be
assigned only by an active Admin. These checks apply in addition to the `users.assign_roles`
capability requirement.

## Survey Access And Lifecycle Policy

- Survey access is global RBAC, not unrestricted authentication. A permitted principal can act
  on any survey in the shared workspace, but every
  operation still requires its explicit capability.
- The eight survey capabilities are `surveys.read`, `surveys.manage`,
  `survey_distributions.manage`, `survey_responses.read_aggregates`,
  `survey_responses.read_raw`, `survey_responses.read_identity`,
  `survey_responses.export`, and `survey_responses.erase`. Admin has all eight; the default
  researcher has all except erase (including identity); staff has `surveys.read` and
  `survey_responses.read_aggregates` only. Existing portal and ML capabilities remain in each
  default role. Raw, identity, CSV export, aggregates, and erase are separately permissioned;
  the identity endpoint requires both raw and identity permission.
- Distribution metadata listings never return tokens; a newly issued or rotated token is
  returned only once, and revoke responses also return metadata without a token. New create and
  rotate requests use the configured default expiry when omitted (currently 30 days); supplied
  expiry must be in the future and within the configured maximum (currently 30 days). Historical
  null expiry values remain non-expiring. Archiving a survey revokes unrevoked distributions.
  Restoring it leaves it inactive, so activation and a new link are explicit follow-up actions.
- Survey GET and submit require a dedicated Google OAuth respondent session and a backend proof.
  The portal remains password/invite/recovery based and rejects OAuth sessions. Next.js uses
  isolated `peii-survey-auth-token` cookies, the fixed
  `/auth/survey/google/callback`, HMAC-signed flow-bound return state, and the focused same-origin
  `/api/survey/[token]` BFF. Google provider scopes are limited to `openid email profile`.
  Public withdrawal remains direct and code-only. Consent is a global, versioned contract, and
  accepted responses retain an immutable notice snapshot. Do not promise confidentiality or
  respondent anonymity.
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
- Google-authenticated survey reads and submits are limited after respondent proof validation by
  a composite verified subject/session/token bucket (60 reads/minute and 10 submits/minute by
  default), with separate higher global breakers (6,000 reads/minute and 1,000 submits/minute).
  Portal login and recovery use normalized identifier buckets only (10/minute and 5/15 minutes
  by default), with separate 1,000-request global breakers; the shared Next.js BFF peer is not an
  end-user bucket.
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
- Long-format CSV export is available only when the server-side `CSV_EXPORT_ENABLED` flag is
  `true`; keep it `false` for the initial online deployment. When enabled, export is streamed,
  private/no-store, preflight-capped at 10,000 eligible
  responses, and bounded to the accepted preflight count even if rows are inserted before the
  deferred stream runs. Its correlated start, success, and aborted audits distinguish the
  accepted count from the actual records traversed. Selected erasure or all-response erasure
  writes minimal tombstones and is idempotent; all-scope erasure requires an archived survey.
  Retention purge is a bounded external command, not an in-process timer. It purges due live
  responses and expired short-lived Google proof rows and prints `proofs` alongside its response
  counts:
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

PostgreSQL and Redis start with the application graph. Adminer is an opt-in Compose `tools`
profile. `DB_MODE=supabase` changes the database URL selected by the backend but does not disable
the local PostgreSQL service.

Compose does not currently apply Alembic migrations automatically. Initialize a fresh
database before using the application.

For local database containers only:

```bash
docker compose --profile tools up postgres adminer
```

All published development ports bind to `127.0.0.1`. Compose passes explicit per-service
environment allowlists rather than the root `.env`: only backend settings go to the backend,
only `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` go to PostgreSQL, and Adminer gets
only `ADMINER_DEFAULT_SERVER`. The frontend receives only the URLs, public Supabase key, app
origin, telemetry, survey OAuth state key, and export flag it uses. Never treat a container
environment as a production
secret boundary; provider credentials still require rotation before launch.

Services:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
- Adminer (with `tools` profile): `http://localhost:8080`
- PostgreSQL: `localhost:5432`

## API Surface

Routes are mounted below `API_V1_PREFIX` (normally `/api/v1`):

- `/auth`: login, current principal, logout, recovery, and password changes.
- `/rbac`: permissions, roles, and role assignments.
- `/users` and `/audit-logs`: administration and audit history.
- `/surveys`: surveys plus nested sections, questions, distributions, and
  responses, aggregates, streamed export, and erasure.
- `/survey/{token}`: Google-authenticated survey loading and idempotent response submission;
  the tokenized URL alone is not sufficient.
- `/survey/responses/withdraw`: public withdrawal by respondent-held code.
- `/ml`: model catalog and sentiment inference. Model weights load lazily and may require
  substantial network, disk, memory, and CPU resources on first use.

Protected routes accept a Supabase bearer token and resolve it through JWKS verification,
the local user record, and effective role/permission dependencies. Survey respondent routes use
the dedicated Google session/proof boundary instead of the portal bearer-token boundary.

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
