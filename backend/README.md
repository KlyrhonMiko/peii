# Backend

FastAPI API for PEII authentication, RBAC, user administration, survey authoring,
public responses, audit logs, and sentiment inference.

## Run locally

1. Copy the root `.env.example` to `.env` and replace every placeholder. All backend
   settings are required; there are no startup defaults.

   For a backend process running directly on the host, a local PostgreSQL URL normally
   uses `localhost`. The `postgres` hostname in the example is for Docker Compose.

2. Install dependencies from `backend/`:

```bash
python3.14 -m venv .venv
./.venv/bin/pip install --no-deps torch==2.14.0 -c requirements.lock --index-url https://download.pytorch.org/whl/cpu
./.venv/bin/pip install -r requirements.txt -c requirements.lock
./.venv/bin/pip check
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
origin verifies only `invite` or `recovery` OTPs, obtains verified subject/session claims, and
creates a 10-minute HMAC reset grant cookie scoped to `/reset-password`. Configure the URL in the
Supabase Auth redirect allowlist for every environment. `PASSWORD_RESET_GRANT_SECRET` must be a
random value of at least 32 bytes, never be browser-exposed, and have the identical value in the
Vercel frontend and backend deployments. Each reset grant is consumed atomically in Redis before
the password update, so replay or a provider failure requires a new recovery link.

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

In the Supabase Auth dashboard, enable **Secure password change** (password reauthentication)
and set JWT expiry to 600–900 seconds. The ordinary portal password flow requests a Supabase
reauthentication nonce and submits it to the authenticated password update endpoint; Supabase
revokes other sessions on a successful update, so the application does not issue an extra global
logout. After a recovery or invite reset, the backend performs a required global logout with the
recovery session after the password update. It retries only transient logout failures; if
revocation cannot be confirmed, the reset returns a safe failure even though the password may
have changed. Existing access JWTs can remain usable until their normal expiry. Before launch,
run provider smoke tests for invite, recovery, reauthentication, invalid/expired nonce, password
change, reset global logout, and reset-grant replay; application tests do not exercise the hosted
provider.

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
`a8055c9859f5` (Google survey respondent identity and auth proofs) -> `b9055c9859f6`
(`is_template`) -> `f88b9c1d0000` (drop survey distributions and response distribution link,
survey-scoped response idempotency) -> `3aad20b0fc8a` (ml_sentiments) ->
`b0d864b9935b` (false_positive_feedbacks) -> `a6c42481a0d9` (polarity_override) ->
`7ac95c493227` (performance indexes) -> `b43d56b55144` (survey-question JSONB) ->
`bf21a63040a2` (false-positive feedback Data API lockdown) ->
`c1d2e3f4a5b6` (survey-response import permission).
`c1d2e3f4a5b6` is the current Alembic head. For production, run
`./.venv/bin/alembic upgrade head` once as the protected Oracle release job before the single Uvicorn worker
is started. Do not migrate in API startup commands. Review the Phase 3
survey-policy and response-deadline backfill before activating the external purge job.

Retired: the Phase 2 distribution-expansion contract is historical. `f77a807cf2f9` added SHA-256
token digests, 8-character prefixes, and consent evidence while retaining plaintext distribution
tokens for its compatibility window; `d1f9bad768ad` also made the database expiry column nullable;
and `2bf09a6bc738` backfilled and required token digests, then dropped the plaintext token column.
`f88b9c1d0000` later dropped the whole `survey_distributions` table and the response distribution
link, so the digest-and-prefix storage, one-time token reveal, 30-day default/maximum expiry, and
nullable-legacy-expiry runtime contract no longer apply; the
`SURVEY_DISTRIBUTION_DEFAULT_EXPIRY_DAYS`/`SURVEY_DISTRIBUTION_MAX_EXPIRY_DAYS` config keys were
removed with it.

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
aggregate, and CSV response contracts omit dedicated Google identity snapshots; answers can
identify respondents and aggregate readers intentionally receive those answer values. The identity endpoint requires
both `survey_responses.read_raw` and `survey_responses.read_identity`.

For production Supabase connections, `DATABASE_TLS_MODE=verify-full` gives psycopg2/Alembic
`sslmode=verify-full`; asyncpg uses a hostname-checking, certificate-verifying SSL context. Set
`DATABASE_TLS_CA_BUNDLE_PATH` only for a private or provider-specific certificate authority;
otherwise both drivers use the system trust store. The optional bundle must be readable by both
the API and Alembic migration identities before launch.

## RBAC role-assignment safety

Role assignment is constrained by the acting principal's effective permissions: an actor cannot
grant a role that contains permissions beyond their own. The protected system Admin role can be
assigned only by an active Admin. These checks apply in addition to the `users.assign_roles`
capability requirement.

## Survey Access And Lifecycle Policy

- Survey access is global RBAC, not unrestricted authentication. A permitted principal can act
  on any survey in the shared workspace, but every
  operation still requires its explicit capability.
- The eight live survey capabilities are `surveys.read`, `surveys.manage`,
  `survey_responses.read_aggregates`,
  `survey_responses.read_raw`, `survey_responses.read_identity`,
  `survey_responses.export`, `survey_responses.import`, and `survey_responses.erase`. Admin has all eight plus the
  orphaned `survey_distributions.manage` (kept in the catalog and database for compatibility
  only; no route enforces it, and its removal needs a data migration). The default
  researcher has all except erase (including identity); staff has `surveys.read` and
  `survey_responses.read_aggregates` only. Existing portal and ML capabilities remain in each
  default role. Raw, identity, CSV export, CSV import, aggregates, and erase are separately permissioned;
  the identity endpoint requires both raw and identity permission.
- The survey distribution feature was retired in `f88b9c1d0000`, which drops the
  `survey_distributions` table and `survey_responses.distribution_id`; response idempotency is
  now survey-scoped via `UNIQUE(survey_id, idempotency_key)`. No distribution tokens, expiry
  policies, rotation, or revocation exist in the current runtime contract.
- Survey GET and submit require a dedicated Google OAuth respondent session and a backend proof.
  The portal remains password/invite/recovery based and rejects OAuth sessions. Next.js uses
  isolated `peii-survey-auth-token` cookies, the fixed
  `/auth/survey/google/callback`, HMAC-signed flow-bound return state, and the focused same-origin
  `/api/survey/[token]` BFF. Google provider scopes are limited to `openid email profile`.
  Public self-service withdrawal is not available. Consent is a global, versioned contract, and
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
  a submission-time `retention_expires_at`; the generated two-phase questionnaire resets the same
  row's deadline when Phase 2 completes. Disabled retention gives new responses a null deadline
  and does not rewrite existing snapshots. Retention settings cannot change after any response
  row exists, including a tombstone.
- Raw responses, aggregates, and exports exclude logically deleted and read-time expired rows,
  but authorized access remains available for archived surveys. Aggregates are available for
  every survey status, accept no filters, and return exact totals and cells even for one to four
  responses. Live results can change as responses arrive, and small-group aggregates are not
  anonymous or privacy-preserving. Raw listing is paginated (default 50, maximum 100) and
  supports only submission-time range filters.
- Public self-service withdrawal is not available. Submissions do not require a withdrawal
  code. Generated two-phase surveys use POST to create one response row, then authenticated
  PATCH to merge Phase 2 into that row; `responses_count` remains one participant row.
  Historical withdrawal fields remain stored for compatibility. Administrative erasure and
  retention processing are unchanged.
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
- Survey-specific CSV import is available through the protected View Details → Responses panel
  to `survey_responses.import` principals; it is independent of the export flag. Admin and
  Researcher receive the default capability, while Staff does not. The downloaded wide-format
  template has one row per respondent and is not the long-format export. Import accepts only
  exact headers for the selected survey, stores nonblank typed answers under that survey's
  question UUIDs, and commits a valid file atomically. Individual answers may be blank, but
  invalid nonblank answers reject the file. Original timezone-qualified submission timestamps
  determine `created_at` and retention expiry; rows already expired are rejected. Identical
  uploads append again and can double-count. The upload limit is 2 MiB/1,000 rows, and neither
  XLSX nor source-form column mapping is supported.

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
  TEST_DATABASE_TLS_MODE=disable \
  env DEBUG=false ./.venv/bin/pytest -q -m integration --require-postgres
```

`TEST_DATABASE_TLS_MODE` affects only the isolated-schema Alembic subprocesses. It defaults to
`disable` for local disposable Compose PostgreSQL and accepts only `disable`, `require`, or
`verify-full`.

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
- `/surveys`: surveys plus nested sections, questions, and
  responses, aggregates, streamed export, and erasure.
- `/survey/{token}`: Google-authenticated survey loading and idempotent response submission;
  the tokenized URL alone is not sufficient.
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

Production uses Python 3.14.7 with pinned torch 2.14.0, transformers 5.16.1 and greenlet
3.5.5 on the validated Linux aarch64 runtime. Follow `../docs/oracle-host-runbook.md` for
cache persistence and target-host acceptance. In Compose the API runs in `/var/lib/peii`;
use `docker compose exec -w /app backend alembic upgrade head` from the repository root
for an explicitly approved local migration.

### CPU and CUDA package selection

CPU is the default on both ARM64 and x86_64. Install Torch first from the selected official
index, then install the remaining requirements with `requirements.lock`, as shown above.
For a CUDA installation, use `https://download.pytorch.org/whl/cu130` for that first Torch
command; keep Torch 2.14.0 and the same generic constraints. An existing environment should
be replaced with a fresh virtual environment when changing CPU/CUDA variants, so an already
installed Torch build does not silently satisfy the version pin.

Compose defaults `TORCH_INDEX_URL` to the CPU index. For an NVIDIA host with the required
GPU driver and container runtime, the CUDA override selects cu130 and requests GPU devices:

```bash
docker compose -f docker-compose.yml -f docker-compose.cuda.yml up --build
```

The packaging has no ARM-only restriction. Official CPU/CUDA wheels exist for Python 3.14
on ARM64 and x86_64, but prior runtime verification here covers ARM64 CPU only. x86_64 and
GPU execution require their own clean `pip check` and inference checks. In particular, the
previous ARM CUDA dependency tag failure is not proof that the CUDA override resolves on ARM.
Selecting a CUDA package does not itself prove the application runs inference on the GPU.
