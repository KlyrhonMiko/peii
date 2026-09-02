# Deployment Roadmap

Status: the Phase 4 BFF and traffic-hardening behavior is present in the current tree alongside
the Phase 3 response-operations implementation and the Google-authenticated identified survey
flow. Public launch remains blocked by the operational exit gate below. Redis, consent, response
retention, withdrawal, protected response operations, and their application contracts are
implemented; PostgreSQL execution, provider/browser, forwarding-chain, and scheduler verification
are still deployment responsibilities.

## Current release and migration head

- Fresh databases start at `20260825_v1`. The forward chain is
  `f77a807cf2f9` (Phase 2 distribution security), `d1f9bad768ad` (nullable distribution expiry),
  then `fb1c93d15474` (Phase 3 retention and withdrawal), followed by `2bf09a6bc738` (remove
  plaintext distribution tokens), `d5a4f7c91e2b` (Supabase Data API RLS/ACL lockdown), and
  `a8055c9859f5` (Google survey respondent identity and auth proofs).
  `a8055c9859f5` is the current head.
- Run `./.venv/bin/alembic upgrade head` once as the protected release job. Promote API replicas
  only after the migration, backfill review, and smoke test succeed. Future schema changes are
  forward revisions; do not migrate independently in every replica.
- Supabase authentication, local identity linkage, global capability RBAC, audit logging, survey
  authoring, public response submission, consent evidence, Redis rate-limit plumbing, and the ML
  portal are included.
- Compose remains local development; production uses managed frontend, Python service,
  PostgreSQL, Supabase Auth, Redis, a trusted TLS ingress, and an external retention job.
- The `d5a4f7c91e2b` migration enables RLS on protected application tables and revokes effective
  table/column privileges and schema creation from `PUBLIC`, `anon`, `authenticated`, and
  `service_role`. Its default-privilege revokes are limited to objects subsequently created by
  the current migration role (`current_user`) in the current schema; provider-owned/global
  defaults and defaults for other object creators are not mutated and require separate
  provider/admin configuration. It creates no Data API policies, validates its postconditions,
  and has an intentionally fail-closed, irreversible downgrade.
- The `a8055c9859f5` migration adds short-lived Google survey auth proofs, nullable
  legacy-compatible response identity snapshots, survey-scoped dedupe uniqueness,
  `survey_responses.read_identity`, and proof-table ACL/RLS lockdown. Admin and the default
  researcher receive identity permission; staff does not. Raw, aggregate, and CSV contracts
  remain identity-free, and the identity endpoint requires both raw and identity permission.

### Current distribution and RBAC contract

- The `2bf09a6bc738` contract revision leaves distribution rows with a token digest and prefix
  only. Create and rotate reveal a newly generated token once; list and revoke metadata never
  return it. Omitted expiry uses the configured server default (currently 30 days), while an
  explicit future expiry cannot exceed the configured maximum (currently 30 days). Legacy rows
  with null expiry remain possible and non-expiring.
- Role assignment cannot grant a role whose permissions exceed the actor's effective permissions.
  Assignment of the protected system Admin role is restricted to active Admins.

## Implemented Phase 3 response behavior

### Retention

- New surveys default to retention enabled for 1,825 days (five years).
- Each submission snapshots `retention_expires_at` from server submission time plus the survey
  policy. The deadline is immutable per response. Once any response row exists, including a
  tombstone, the survey retention policy cannot be changed.
- A disabled policy applies only before the first response and gives new responses a null
  deadline. Null deadlines are not purged and are treated as non-expiring. Existing deadlines
  are never rewritten.
- The Phase 3 migration sets existing surveys to enabled/1,825 days and backfills existing
  response deadlines from submission timestamps. Review this backfill before activating purge.
- Raw reads, aggregates, and exports exclude logically deleted or read-time expired responses;
  the scheduled purge is not required for that immediate read exclusion.

### Withdrawal

- The browser creates a 32-byte/256-bit base64url withdrawal code, submits it with the response,
  and shows it once after the minimal `{"accepted": true}` acknowledgement.
- The backend stores only the HMAC-SHA-256 digest. Production requires the dedicated
  `WITHDRAWAL_CODE_HMAC_SECRET` (at least 32 random bytes); a lost respondent code cannot be
  recovered.
- Public withdrawal is `POST /api/v1/survey/responses/withdraw`; the public frontend page is
  `/survey/withdraw` and does not require a survey link or portal login. Valid withdrawal is a
  repeat-safe logical tombstone.

### Protected response operations

- Response authorization is global capability RBAC, not ownership or membership. Raw reads,
  aggregates, exports, and erasure require, respectively,
  `survey_responses.read_raw`, `survey_responses.read_aggregates`,
  `survey_responses.export`, and `survey_responses.erase`.
- Aggregates are available for every survey status, including live `Active` and archived
  surveys, and have no filters. Live results can change as responses arrive. They return exact
  totals and cells for groups of any size and keep bounded aggregate cardinality. Small-group
  aggregates are not anonymous or privacy-preserving.
- Raw reads are offset-paginated (default 50, maximum 100), stable-ordered by submission time,
  and support only `submitted_from`, `submitted_before`, and `distribution_id` filters. Deleted
  and expired rows remain excluded. Authorized reads, aggregates, and exports work for archived
  surveys.
- CSV export is long-format, streamed in bounded partitions/chunks, and preflight-capped at
  10,000 eligible responses. The accepted preflight count also bounds the deferred stream so
  concurrent inserts cannot add exported records. It writes a correlated start audit before
  streaming, then a success or best-effort aborted audit with the same export id and actual
  traversed response count.
- Selected erasure is capped at 100 response ids. All-response erasure requires an archived
  survey and expected-count match. Both use UUID idempotency keys, explicit confirmation, atomic
  audits, and logical tombstones/receipts.

## Implemented Google-authenticated identified survey flow

- Survey GET and submit require a dedicated Google OAuth respondent session and backend proof.
  The server-rendered survey page may fetch GET from FastAPI through `BACKEND_INTERNAL_URL` after
  isolated auth; browser submission uses the focused same-origin `/api/survey/[token]` BFF. The
  portal remains password/invite/recovery based and rejects OAuth sessions. Withdrawal remains
  direct and code-only.
- Next.js uses isolated `peii-survey-auth-token` cookies, fixed
  `/auth/survey/google/callback`, and HMAC-signed flow-bound return state. The server-rendered
  survey page may use `BACKEND_INTERNAL_URL` for its authenticated GET; browser submission uses
  the focused same-origin `/api/survey/[token]` BFF. `SURVEY_OAUTH_STATE_KEY` is server-only and
  must be a random value of at least 32 bytes, never `NEXT_PUBLIC_*`.
- Configure Google in Supabase Auth with minimum scopes `openid email profile`, allowlist the
  exact `${APP_ORIGIN}/auth/survey/google/callback`, and configure the Google OAuth client with
  the Google/Supabase provider callback as appropriate.
- `SURVEY_RESPONDENT_HMAC_SECRET` is a dedicated random secret of at least 32 bytes and must
  remain stable for survey lifetimes because raw Google subject is not stored. Routine rotation
  cannot preserve dedupe; incident rotation requires explicit acceptance that prior accounts may
  submit again or a controlled closure/reconciliation plan. The session max age defaults to 300
  seconds and has a production maximum of 3,600 seconds. Attestation is limited to 5 per 60
  seconds.
- Before OAuth and at consent, disclose that verified Google email/display name is stored with
  the response, authorized researchers can identify respondents, one Google account is enforced
  per survey, withdrawal removes direct identity and answers while retaining the survey-scoped
  pseudonymous dedupe digest until administrative erasure, and expired proof PII is physically
  deleted by the external purge. Do not promise anonymity or confidentiality.

## Implemented Phase 4 BFF and traffic behavior

- The global Next.js proxy excludes `/api`; the allowlisted `/api/backend/[...path]` BFF owns
  Supabase claims/session lookup for browser backend calls.
- BFF request bodies are capped at 65,536 bytes and must be read within 15 seconds. The upstream
  timeout is 15 seconds to response headers only, so a response stream may continue afterward.
  Client cancellation is propagated and no retries are performed.
- Locally generated BFF errors are `no-store`. `/api/v1/health` remains a liveness-only probe,
  not a readiness or dependency check.

## Deployment configuration

Set and verify these production values:

```text
SURVEY_OAUTH_STATE_KEY=<server-only random HMAC key, at least 32 bytes>
GOOGLE_OAUTH_CLIENT_ID=<Google OAuth client id>
SURVEY_RESPONDENT_HMAC_SECRET=<dedicated random server-side secret, at least 32 bytes; stable for survey lifetimes>
SURVEY_GOOGLE_SESSION_MAX_AGE_SECONDS=300  # production maximum 3600
GOOGLE_SURVEY_ATTEST_RATE_LIMIT=5
GOOGLE_SURVEY_ATTEST_RATE_WINDOW_SECONDS=60
RATE_LIMIT_ENABLED=true
RATE_LIMIT_INCLUDE_CLIENT_IP=true
REDIS_URL=<managed Redis TLS URL>
RATE_LIMIT_READ_FAILURE_POLICY=fail_closed
RATE_LIMIT_KEY_HMAC_SECRET=<random server-side secret, at least 32 bytes>
WITHDRAWAL_CODE_HMAC_SECRET=<dedicated random server-side secret, at least 32 bytes>
PUBLIC_SURVEY_READ_LIMIT=60 / PUBLIC_SURVEY_READ_WINDOW_SECONDS=60
PUBLIC_SURVEY_READ_GLOBAL_LIMIT=6000 / PUBLIC_SURVEY_READ_GLOBAL_WINDOW_SECONDS=60
PUBLIC_SURVEY_SUBMIT_LIMIT=10 / PUBLIC_SURVEY_SUBMIT_WINDOW_SECONDS=60
PUBLIC_SURVEY_SUBMIT_GLOBAL_LIMIT=1000 / PUBLIC_SURVEY_SUBMIT_GLOBAL_WINDOW_SECONDS=60
PUBLIC_SURVEY_WITHDRAWAL_CLIENT_LIMIT=10 / PUBLIC_SURVEY_WITHDRAWAL_CLIENT_WINDOW_SECONDS=60
PUBLIC_SURVEY_WITHDRAWAL_GLOBAL_LIMIT=1000 / PUBLIC_SURVEY_WITHDRAWAL_GLOBAL_WINDOW_SECONDS=60
LOGIN_RATE_LIMIT=10 / LOGIN_RATE_WINDOW_SECONDS=60
LOGIN_GLOBAL_LIMIT=1000 / LOGIN_GLOBAL_WINDOW_SECONDS=60
PASSWORD_RECOVERY_RATE_LIMIT=5 / PASSWORD_RECOVERY_RATE_WINDOW_SECONDS=900
PASSWORD_RECOVERY_GLOBAL_LIMIT=1000 / PASSWORD_RECOVERY_GLOBAL_WINDOW_SECONDS=900
MAX_REQUEST_BODY_BYTES=65536
TRUSTED_PROXY_HEADER=X-Forwarded-For
TRUSTED_PROXY_CIDRS=<actual trusted ingress CIDRs>
TRUSTED_PROXY_MAX_HOPS=20
TRUSTED_PROXY_MAX_HEADER_BYTES=2048
PUBLIC_SURVEY_CONSENT_VERSION=<approved version>
PUBLIC_SURVEY_PRIVACY_NOTICE=<approved notice>
PUBLIC_SURVEY_PURPOSE=<approved purpose>
PUBLIC_SURVEY_RETENTION=<approved retention duration/statement>
PUBLIC_SURVEY_CONTACT=<approved withdrawal/privacy contact>
SURVEY_DISTRIBUTION_DEFAULT_EXPIRY_DAYS=30
SURVEY_DISTRIBUTION_MAX_EXPIRY_DAYS=30
DATABASE_TLS_MODE=require
```

The local example and Compose default use consent version `2026-09-01`; production must replace
the example with explicitly approved consent and privacy values. The exact application callback
`${APP_ORIGIN}/auth/survey/google/callback` must be in the Supabase Auth redirect allowlist, with
the matching Google/Supabase provider callback configured at Google.

`DATABASE_TLS_MODE=disable` is the local Compose default. For Supabase production,
`DATABASE_TLS_MODE=require` configures psycopg2/Alembic with `sslmode=require`, which encrypts
transport but does not verify the server certificate or hostname. Asyncpg uses `ssl="require"`
so the Supavisor pooler connection follows the same encryption-only transition. Provider-side SSL
enforcement and eventual CA-backed `verify-full` for every database path remain manual follow-up
items; record an owner and deadline for both before launch. Set `BACKEND_CORS_ORIGINS` to exact HTTPS
`APP_ORIGIN` value(s) only—no wildcard, path, or trailing slash. With `DEBUG=false`, FastAPI does
not expose Swagger, ReDoc, or OpenAPI routes.

The root Compose file uses explicit environment allowlists and never passes the root `.env`
wholesale. Frontend, backend, PostgreSQL, and the opt-in Adminer `tools` profile receive only the
settings they use; published development ports bind to `127.0.0.1`. Next.js owns browser/document
security headers, while FastAPI owns public survey API headers. Provider/CDN behavior must be
verified independently.

Redis is a distributed fixed-window dependency. A Redis outage fails closed; it must not be
replaced by an in-process fallback. Forwarded IPs are accepted only from configured trusted
proxy networks. Non-debug startup requires client-IP buckets, so verify the complete forwarding
chain before deployment. Login and recovery use normalized identifier buckets plus higher global
breakers rather than the shared Next.js egress IP. Survey read and submit authenticate the Google
respondent before consuming respondent/session/token buckets and their higher global breakers.
Withdrawal checks the strict client bucket before its separate global circuit breaker. Requests
over 64 KiB are rejected before parsing. Survey routes send no-store,
no-referrer, noindex, nosniff, frame-deny, and `frame-ancestors 'none'` headers; CSV exports
also send private/no-store and no-cache headers.

For production Supabase mode (`DEBUG=false`, `DB_MODE=supabase`), startup also requires
`RATE_LIMIT_READ_FAILURE_POLICY=fail_closed`, nonempty valid `TRUSTED_PROXY_CIDRS` for the
verified immediate proxy networks, and either a secure HTTPS Upstash REST URL/token pair or a
`rediss://` Redis URL. Broad RFC1918 ranges are not production-ready proxy CIDRs. Render/provider
log redaction and verification of the actual forwarding chain remain deployment tasks; do not
consider application tests or the liveness health check proof of either.

## Migration, backfill, and activation order

1. Back up the database and confirm the backup/PITR restore procedure before the release job.
2. Block public response writes at ingress, drain in-flight writes, and stop every old API
   replica. Phase 3 is not a rolling frontend/backend release.
3. Apply `./.venv/bin/alembic upgrade head` once. Confirm the revision order through
   `a8055c9859f5` after `d5a4f7c91e2b`, verify distribution digests are populated and the
   plaintext token column is absent, inspect the enabled/1,825 survey policy backfill, verify
   response deadline backfill from submission timestamps, and verify the protected-table and
   proof-table RLS/ACL lockdown postconditions. Reconcile enabled-retention rows with null
   deadlines.
4. Deploy the compatible backend and frontend together and invalidate stale public-form caches.
   Smoke-test enabled and disabled retention,
   immutable policy updates, read-time expiry exclusion, withdrawal digest handling, archived
   authorized access, permission separation, identity gating, exact small-group aggregates,
   erasure, and export headers.
5. Only after the migration/backfill and application checks pass, activate one external purge
   schedule. Begin with a dry run and compare its due count to expectations.
6. Record the release result and owners for the database, API, frontend, purge job, monitoring,
   provider logging, and rollback, then reopen public response writes.

The Phase 2 distribution compatibility sequence is historical: expand -> dual-write/digest-first
-> reconcile -> digest-only app -> contract/drop gate. `2bf09a6bc738` completed that gate and
plaintext distribution tokens are no longer stored. The `d1f9bad768ad` nullable database expiry
shape is also historical compatibility behavior; current create/rotate applies the configured
default and maximum validation described above.

Before `2bf09a6bc738`, application rollback during the compatibility window was permitted only
while plaintext remained. At the current head, plaintext cannot be reconstructed, and the
`d5a4f7c91e2b` and `a8055c9859f5` lockdown downgrades are disabled. Never use an ad hoc baseline
downgrade. For a
database incident, restore a validated backup/PITR copy into an isolated database, run release
checks, and promote only after schema, RLS/ACL, RBAC, privacy, and health checks pass; otherwise
use a reviewed forward fix.

## Retention purge runbook and monitoring

The repository provides a bounded command but no in-process scheduler. Run from `backend/`:

```bash
./.venv/bin/python scripts/purge_expired_responses.py --dry-run
./.venv/bin/python scripts/purge_expired_responses.py
./.venv/bin/python scripts/purge_expired_responses.py --batch-size 100
```

The command defaults to 100 responses per batch and accepts optional `--cutoff` ISO-8601 and
`--batch-size` values. It purges expired short-lived Google proof rows as well as due live
responses and prints `proofs` alongside `purged`, `surveys`, `batches`, `dry_run`, and `cutoff`.
Schedule one managed job at least daily, prevent overlapping instances, and alert on non-zero
exit or missed execution. Reconcile response output against `retention_purge` audit events and
the due-row backlog. Dry runs do not mutate responses or create purge audits. Purge locks the
survey before processing response batches and is repeat-safe.

Retention is logical tombstoning, not immediate physical deletion. Minimal tombstones, erasure
receipts, and audit records remain. Database backups and PITR can retain pre-tombstone answers
until the provider retention window expires; backups are not immediately erased. Withdrawal-cleared
tombstones have already had their direct identity and answers deleted and are outside the
live-response set; they are not ordinary response-retention purge work. The remaining
survey-scoped pseudonymous dedupe digest remains until administrative erasure by design, so the
same Google account cannot submit again.

## Provider logging and streaming verification

Before launch, configure Google in Supabase Auth with minimum scopes `openid email profile`, add
the exact `${APP_ORIGIN}/auth/survey/google/callback` to its redirect allowlist, and configure
the matching Google/Supabase provider callback. Complete a real provider-backed browser
verification of Google sign-in, survey GET, and submit; application tests are not proof of this
integration. Also configure provider redaction for tokenized URL paths, request bodies, authorization
and cookie headers, idempotency keys, withdrawal codes, and respondent identifiers. Keep
`CSV_EXPORT_ENABLED=false` in both the backend and Next.js server environments for the initial
online release. Before enabling export in a later release, send a controlled export smoke request
through the real CDN/edge path and verify that:

- `private, no-store`, `Pragma: no-cache`, and related safety headers survive the path;
- the CSV is not cached, indexed, persisted, or unexpectedly buffered/spooled by the provider;
- provider logs contain neither sensitive request data nor response contents; and
- the stream can complete or fail with the expected correlated audit behavior.

Record provider/region/domains, trusted ingress, runtime configuration, log retention/redaction,
backup schedule, PITR procedure, purge schedule, and monitoring owner in the production runbook.

Required provider actions remain manual and are not claimed as completed here: execute and verify
the Alembic release migration against PostgreSQL; rotate any
credentials exposed during development; remove `public` from the Supabase Data API exposed
schemas/tables; enable Supabase SSL enforcement only after the TLS client rollout; track the
eventual CA-backed `verify-full` follow-up for all database paths; and configure HSTS
on both Vercel and Render. Manually verify exact CORS, production docs-off behavior,
application-owned headers through the real ingress, service-specific environment exposure,
provider redaction/no-store behavior, the actual forwarding chain, backups/PITR, and purge
scheduling before launch. PostgreSQL execution and real provider/browser verification are
deployment gates; application tests and the liveness health check are not proof of either.

## Tests and exit gate

Run from the repository application directories:

```bash
# frontend/
npm run lint
npm test
npm run build

# backend/
./.venv/bin/ruff check .
./.venv/bin/mypy .
env DEBUG=false ./.venv/bin/pytest -q
```

Run PostgreSQL integration tests explicitly; a skip is not a pass:

```bash
TEST_DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/peii_test \
  env DEBUG=false ./.venv/bin/pytest -q -m integration --require-postgres
```

Rehearse migration/backfill, purge dry-run and mutating run, proof-row expiry deletion, backup
restore, health/RBAC seed, public withdrawal, Google provider/browser sign-in and submit, and
archived authorized access. Verify `CSV_EXPORT_ENABLED=false` on both deployments; the
export/no-store smoke test becomes mandatory before a later release enables it. Execute the
PostgreSQL migration on the target release path; a skipped integration suite is not evidence of
database execution.

Real respondents remain blocked until rate limits and Redis connectivity/fail-closed behavior,
the dedicated withdrawal and respondent HMAC secrets (including a stable-dedupe incident rotation
plan), approved consent and privacy values, retention and backup/PITR policy, trusted ingress,
purge scheduling/monitoring, PostgreSQL migration execution, real Google provider/browser
verification, provider log redaction, exact CORS, production docs-off behavior, headers through
the real ingress, and public-survey no-store behavior are verified and recorded. Code validation
alone does not satisfy this gate.
