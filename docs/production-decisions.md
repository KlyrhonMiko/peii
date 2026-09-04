# Production Decisions

## Current release and migration head

The current tree contains the Phase 4 BFF and traffic-hardening behavior in addition to the
Phase 3 response-operations implementation. The forward migration chain is:

```text
20260825_v1
  -> f77a807cf2f9 (distribution security compatibility)
  -> d1f9bad768ad (distribution expiry compatibility)
  -> fb1c93d15474 (retention and withdrawal)
  -> 2bf09a6bc738 (remove plaintext distribution tokens)
  -> d5a4f7c91e2b (Supabase Data API RLS/ACL lockdown)
  -> a8055c9859f5 (Google survey respondent identity and auth proofs)
  -> b9055c9859f6 (is_template)
  -> f88b9c1d0000 (drop survey distributions and distribution link; survey-scoped idempotency)
  -> 3aad20b0fc8a (ml_sentiments)
  -> b0d864b9935b (false_positive_feedbacks)
  -> a6c42481a0d9 (polarity_override)
```

`a6c42481a0d9` is the current Alembic head. Fresh environments and the production release job
run `./.venv/bin/alembic upgrade head` once before API replicas are promoted. Phase 3 is **not**
a rolling or independently deployable frontend/backend release: the request contract and
retention writes change together. Block public submissions at ingress, drain and stop every old
API writer, run the migration and reconciliation checks, deploy the API and frontend, purge
stale frontend caches, complete smoke tests, and only then reopen submissions. Do not run
migrations independently in every replica or downgrade the baseline as an ad hoc rollback.

The Phase 2 compatibility behavior is historical: `f77a807cf2f9` added SHA-256 token digests and
8-character prefixes while retaining plaintext distribution tokens, and `d1f9bad768ad` made the
database expiry column nullable. The `2bf09a6bc738` contract revision reconciled existing
digests/prefixes, required the digest, and dropped the plaintext token column. Its downgrade cannot
reconstruct plaintext tokens. `f88b9c1d0000` later removed the whole distribution feature: it drops
`survey_distributions` and `survey_responses.distribution_id` and replaces the response idempotency
uniqueness with `uq_survey_responses_survey_idempotency(survey_id, idempotency_key)`.

The `d5a4f7c91e2b` release step enables RLS for all protected application tables and revokes
effective table/column privileges and schema creation from `PUBLIC`, `anon`, `authenticated`,
and `service_role`. Its default-privilege revokes are limited to objects subsequently created by
the current migration role (`current_user`) in the current schema; provider-owned/global
defaults and defaults for other object creators are not mutated and require separate
provider/admin configuration. It creates no policies, validates the RLS/ACL postconditions, and
has an intentionally fail-closed irreversible downgrade. The API remains the application access
boundary; direct Supabase Data API access is not a substitute for its authorization checks.

The `a8055c9859f5` release step (an intermediate step, now superseded) adds short-lived Google
survey auth proofs, nullable
legacy-compatible response identity snapshots, survey-scoped dedupe uniqueness, and the
`survey_responses.read_identity` capability. It also applies ACL/RLS lockdown to the proof table.
The default `admin` and `researcher` roles have identity permission; `staff` does not. Existing
raw, aggregate, and CSV contracts remain identity-free, and the identity endpoint requires both
`survey_responses.read_raw` and `survey_responses.read_identity`.

After `a8055c9859f5`, `b9055c9859f6` adds the survey `is_template` flag, `f88b9c1d0000` removes the
distribution table and the response distribution link (see above), and
`3aad20b0fc8a`/`b0d864b9935b`/`a6c42481a0d9` ship ML sentiments, false-positive feedbacks, and
survey polarity override respectively. `a6c42481a0d9` is the current head.

The distribution digest-only runtime contract (digest + prefix storage, one-time token reveal,
30-day default/maximum expiry, nullable legacy expiry) was removed in `f88b9c1d0000`, which
deleted the `survey_distributions` table and `survey_responses.distribution_id`; the associated
`SURVEY_DISTRIBUTION_DEFAULT_EXPIRY_DAYS`/`SURVEY_DISTRIBUTION_MAX_EXPIRY_DAYS` config keys were
removed with it.

## Deployment topology

- Frontend: managed Next.js Node.js host, with provider and region recorded before launch.
- Backend: managed Python web service in the same region as the database.
- Database: Supabase PostgreSQL or another managed PostgreSQL provider with automated backups
  and point-in-time recovery (PITR).
- Authentication: Supabase Auth.
- Rate limiting: managed Redis; production uses distributed fixed-window limits.
- Retention purge: one externally scheduled managed job running the backend purge command.
- Docker Compose remains local development only.

## Phase 4 BFF and traffic-hardening decisions

- The global Next.js proxy matcher excludes `/api`. The authenticated BFF at
  `/api/backend/[...path]` owns Supabase claims and session lookup before forwarding an
  allowlisted browser request to the backend.
- The BFF accepts request bodies up to 65,536 bytes and gives body reads a 15-second deadline.
  Its upstream timeout is 15 seconds while waiting for response headers only; an upstream body
  may continue streaming after headers arrive. Client cancellation is propagated, upstream
  requests are not retried, and locally generated BFF errors are `Cache-Control: no-store`.
- `/api/v1/health` remains liveness-only. It is not a dependency-readiness check and must not be
  used as proof that the deployment's ingress or forwarding chain is correctly configured.

For `DEBUG=false` with `DB_MODE=supabase`, backend startup requires
`RATE_LIMIT_READ_FAILURE_POLICY=fail_closed`, a nonempty set of syntactically valid
`TRUSTED_PROXY_CIDRS`, and Redis configured either as a complete secure HTTPS Upstash REST
URL/token pair or a `rediss://` URL. The configured CIDRs must be the verified networks of the
immediate proxy peer. Broad RFC1918 ranges such as `10.0.0.0/8`, `172.16.0.0/12`, or
`192.168.0.0/16` are not production-ready substitutes for provider-specific ingress CIDRs.

## Global capability RBAC

Survey authorization uses global capability RBAC. A principal with a capability may operate on
any survey in the shared workspace, and every operation requires its explicit capability.

The canonical permission catalog is:

| Capability | Description |
| --- | --- |
| `portal.access` | Access the PEII portal. |
| `users.read` | View users. |
| `users.invite` | Invite users. |
| `users.update` | Update user profiles. |
| `users.assign_roles` | Assign user roles. |
| `users.change_status` | Activate or deactivate users. |
| `users.revoke_sessions` | Revoke user sessions. |
| `users.delete` | Delete user records. |
| `users.restore` | Restore user records. |
| `roles.read` | View roles and permissions. |
| `roles.manage` | Manage roles and permissions. |
| `audit_logs.read` | View audit logs. |
| `ml.models.read` | View ML models. |
| `ml.sentiment.run` | Run sentiment analysis. |
| `surveys.read` | View surveys. |
| `surveys.manage` | Create, update, structure, archive, and restore surveys. |
| `survey_distributions.manage` | Orphaned: still in the permission catalog and database for backward compatibility; no route checks it; removal requires a data migration. |
| `survey_responses.read_aggregates` | View aggregated survey responses. |
| `survey_responses.read_raw` | View raw survey responses. |
| `survey_responses.read_identity` | View authorized respondent identity snapshots. |
| `survey_responses.export` | Export survey responses. |
| `survey_responses.erase` | Erase survey responses. |

Defaults remain: `admin` has all 22 capabilities; `researcher` has all except
`survey_responses.erase` (including `survey_responses.read_identity`); and `staff` has
`portal.access`, `ml.models.read`, `surveys.read`, and `survey_responses.read_aggregates` only.
Raw reads, identity reads, exports, aggregates, and erasure are
separate capabilities. `survey_distributions.manage` remains orphaned in the catalog and database
for backward compatibility: no route enforces it, and removing it requires a data migration. The identity endpoint requires both `survey_responses.read_raw` and
`survey_responses.read_identity`; authentication or survey ownership is not an implicit grant.

Role assignment is additionally constrained by the actor's effective permissions: an actor cannot
grant a role with permissions exceeding their own. Assignment of the protected system Admin role
is restricted to active Admins.

Principal resolution requires `portal.access`; every portal role (default and custom) must include
it or the user is denied every protected route. All seeded roles already carry it, but before a
release that introduces this enforcement, any existing custom roles created without `portal.access`
must be updated (e.g. grant the permission) first, otherwise those users are locked out.

## Google-authenticated identified survey flow

- Survey GET and submit require a dedicated Google OAuth respondent session and a backend proof.
  The server-rendered survey page may fetch GET from FastAPI through `BACKEND_INTERNAL_URL` after
  isolated auth; browser submission uses the focused same-origin `/api/survey/[token]` BFF. The
  portal remains password/invite/recovery based and rejects OAuth sessions. Withdrawal remains
  direct and code-only.
- Next.js uses isolated `peii-survey-auth-token` cookies, the fixed
  `/auth/survey/google/callback`, and HMAC-signed flow-bound return state. The server-rendered
  survey page may use `BACKEND_INTERNAL_URL` for its authenticated GET; browser submission uses
  the focused same-origin `/api/survey/[token]` BFF. `SURVEY_OAUTH_STATE_KEY` is server-only and
  must be a random value of at least 32 bytes; it must never be exposed as `NEXT_PUBLIC_*`.
- Configure Google in Supabase Auth with minimum scopes `openid email profile`. The exact
  application callback `${APP_ORIGIN}/auth/survey/google/callback` must be in the Supabase Auth
  redirect allowlist, and the Google OAuth client must use the Google/Supabase provider callback
  as appropriate.
- Backend configuration uses `GOOGLE_OAUTH_CLIENT_ID`, the dedicated random-at-least-32-byte
  `SURVEY_RESPONDENT_HMAC_SECRET`, `SURVEY_GOOGLE_SESSION_MAX_AGE_SECONDS` (default 300,
  production maximum 3,600), `GOOGLE_SURVEY_ATTEST_RATE_LIMIT=5`, and
  `GOOGLE_SURVEY_ATTEST_RATE_WINDOW_SECONDS=60`. Keep the respondent HMAC secret stable for
  every survey lifetime that relies on dedupe: raw Google subject is not stored, so routine
  rotation cannot preserve dedupe. An incident rotation requires explicit acceptance that prior
  accounts may submit again or a controlled closure/reconciliation plan.
- Before Google sign-in and again at consent, disclose that the verified Google email and display
  name are stored with the response; authorized researchers can identify respondents; identity
  enables one Google account per survey; direct identity and answers are removed on respondent
  withdrawal, but a survey-scoped pseudonymous dedupe digest is retained so that account cannot
  submit again; administrative erasure clears the digest; and short-lived proof PII is physically
  deleted by the external purge after expiry. Do not promise anonymity or confidentiality.

## Phase 3 response and privacy decisions

### Retention

- New surveys default to `retention_enabled=true` and `retention_days=1825` (five years).
- Each response receives a `retention_expires_at` snapshot from server submission time plus the
  survey's retention days. The generated two-phase questionnaire resets that same row's deadline
  from successful Phase 2 completion; updating the survey policy never changes it.
- Retention settings may be changed only before any response row exists. After the first row,
  including a withdrawn or erased row, the policy is immutable.
- When retention is disabled before a survey has responses, new responses receive a null
  deadline. Null deadlines are not due for purge and are treated as non-expiring by raw reads,
  aggregates, and exports. Disabling does not rewrite existing snapshots.
- The Phase 3 migration sets existing survey policies to enabled/1,825 days and backfills
  existing response deadlines from their submission timestamps. Review this backfill before
  enabling the purge schedule.

### Withdrawal

The browser generates a 32-byte (`256-bit`) random base64url withdrawal code, sends it with Phase 1,
and shows it once after the minimal `{"accepted": true}` acknowledgement. Phase 2 updates the same
response row and reuses that withdrawal ownership proof without sending or replacing the code. The
backend stores only its HMAC-SHA-256 digest. Production must set the dedicated
`WITHDRAWAL_CODE_HMAC_SECRET` to a random value of at least 32 bytes; it must not be reused as
the rate-limit HMAC key. The code is never returned by the backend, persisted in plaintext,
included in schemas/audits, or logged. A lost code cannot be recovered by PEII.

The public API route is `POST /api/v1/survey/responses/withdraw`; the frontend page is
`/survey/withdraw`. A valid request tombstones the response and is safe to repeat. User
withdrawal clears answers and direct identity but retains the withdrawal digest needed to
recognize a repeat and the survey-scoped pseudonymous dedupe digest that prevents another
submission by the same account. Administrative erasure clears both digests.

### Generated two-phase questionnaire

The generated questionnaire contains 14 sections and 68 persisted questions. Phase 1 contains the
Intro, profile, Section II-A, and IV-A questions (40 total); Phase 2 contains duplicated Section
II-B and IV-B questions (28 total). Every question carries `config.survey_phase`, while surveys
without that metadata remain single-phase.

One Google account per survey maps to one response row; survey-scoped dedupe replaces the
distribution link. Authenticated GET exposes
only the available phase. POST creates Phase 1; PATCH locks the same row and merges Phase 2 without
changing Phase 1 answers, consent, identity, withdrawal ownership, or `created_at`. Completion and
withdrawal return no form. Phase audit events record each submission, and `responses_count` remains
one participant row rather than two submissions.

### Reads, aggregates, exports, and erasure

- Raw reads, aggregates, and exports exclude logically deleted and read-time expired rows. An
  authorized principal may read, aggregate, or export an archived survey; archive status does
  not bypass the response expiry predicate.
- Aggregates are available for every survey status, including live `Active` surveys and archived
  surveys, and accept no filters. Live results can change as responses arrive. They expose
  supported categorical/boolean/scale/ranking/matrix cells only, return exact totals and cells
  even for one to four responses, and enforce 1,000 cells per question/10,000 per survey capacity
  limits. Small-group aggregates are not anonymous or privacy-preserving and must remain limited
  to approved aggregate-reader roles.
- Raw listing uses offset pagination (`limit` 50 by default, maximum 100) and only supports
  `submitted_from` (inclusive) and `submitted_before` (exclusive) filters.
  There is no `include_deleted` or answer-content escape hatch.
- CSV export is long-format and preflight-capped at 10,000 eligible
  responses; preparation uploads the artifact to a private Supabase Storage bucket and returns an
  expiring signed download URL, with private/no-store on the preparation response. The accepted
  preflight count bounds the generated artifact, so concurrent inserts cannot add records beyond
  that count. The start audit commits before generation; successful and aborted audits use the
  same export id and report the actual number of response records traversed.
- Selected erasure accepts up to 100 response ids. All-response erasure requires an archived
  survey and an expected-count match. Both require a UUID `Idempotency-Key`, explicit
  confirmation, atomic audit, and retain only minimal tombstone/receipt state.

## Runtime configuration

Production must set these values explicitly:

```text
SURVEY_OAUTH_STATE_KEY=<server-only random HMAC key, at least 32 bytes>
GOOGLE_OAUTH_CLIENT_ID=<Google OAuth client id>
SURVEY_RESPONDENT_HMAC_SECRET=<dedicated random server-side secret, at least 32 bytes; stable for survey lifetimes>
SURVEY_GOOGLE_SESSION_MAX_AGE_SECONDS=300
GOOGLE_SURVEY_ATTEST_RATE_LIMIT=5
GOOGLE_SURVEY_ATTEST_RATE_WINDOW_SECONDS=60
RATE_LIMIT_ENABLED=true
RATE_LIMIT_INCLUDE_CLIENT_IP=true
# Use either a Redis-compatible URL or both Upstash REST settings:
REDIS_URL=<managed Redis TLS URL>
# UPSTASH_REDIS_REST_URL=<Upstash REST URL>
# UPSTASH_REDIS_REST_TOKEN=<Upstash REST token>
REDIS_MAX_CONNECTIONS=32
REDIS_CONNECT_TIMEOUT_SECONDS=2
REDIS_SOCKET_TIMEOUT_SECONDS=2
RATE_LIMIT_READ_FAILURE_POLICY=fail_closed
RATE_LIMIT_KEY_HMAC_SECRET=<random server-side secret, at least 32 bytes>
WITHDRAWAL_CODE_HMAC_SECRET=<dedicated random server-side secret, at least 32 bytes>
PUBLIC_SURVEY_READ_LIMIT=60
PUBLIC_SURVEY_READ_WINDOW_SECONDS=60
PUBLIC_SURVEY_READ_GLOBAL_LIMIT=6000
PUBLIC_SURVEY_READ_GLOBAL_WINDOW_SECONDS=60
PUBLIC_SURVEY_SUBMIT_LIMIT=10
PUBLIC_SURVEY_SUBMIT_WINDOW_SECONDS=60
PUBLIC_SURVEY_SUBMIT_GLOBAL_LIMIT=1000
PUBLIC_SURVEY_SUBMIT_GLOBAL_WINDOW_SECONDS=60
PUBLIC_SURVEY_WITHDRAWAL_CLIENT_LIMIT=10
PUBLIC_SURVEY_WITHDRAWAL_CLIENT_WINDOW_SECONDS=60
PUBLIC_SURVEY_WITHDRAWAL_GLOBAL_LIMIT=1000
PUBLIC_SURVEY_WITHDRAWAL_GLOBAL_WINDOW_SECONDS=60
LOGIN_RATE_LIMIT=10
LOGIN_RATE_WINDOW_SECONDS=60
LOGIN_GLOBAL_LIMIT=1000
LOGIN_GLOBAL_WINDOW_SECONDS=60
PASSWORD_RECOVERY_RATE_LIMIT=5
PASSWORD_RECOVERY_RATE_WINDOW_SECONDS=900
PASSWORD_RECOVERY_GLOBAL_LIMIT=1000
PASSWORD_RECOVERY_GLOBAL_WINDOW_SECONDS=900
MAX_REQUEST_BODY_BYTES=65536
TRUSTED_PROXY_HEADER=X-Forwarded-For
TRUSTED_PROXY_CIDRS=<actual trusted ingress CIDRs>
TRUSTED_PROXY_MAX_HOPS=20
TRUSTED_PROXY_MAX_HEADER_BYTES=2048
PUBLIC_SURVEY_CONSENT_VERSION=<approved immutable version>
PUBLIC_SURVEY_PRIVACY_NOTICE=<approved notice text>
PUBLIC_SURVEY_PURPOSE=<approved purpose>
PUBLIC_SURVEY_RETENTION=<approved retention statement>
PUBLIC_SURVEY_CONTACT=<approved withdrawal/privacy contact>
# SURVEY_DISTRIBUTION_DEFAULT_EXPIRY_DAYS / SURVEY_DISTRIBUTION_MAX_EXPIRY_DAYS retired with f88b9c1d0000
DATABASE_TLS_MODE=require
```

The example and local Compose default use consent version `2026-09-01`; production must set the
approved consent version, notice, purpose, retention statement, and contact explicitly. The
Google respondent session max age must be no more than 3,600 seconds in production. The
application callback `${APP_ORIGIN}/auth/survey/google/callback` must be allowlisted exactly in
Supabase Auth, with the matching Google/Supabase provider callback configured at Google.

Redis outages fail closed in production; do not silently fall back to process-local limits.
Non-debug startup rejects disabled rate limiting or disabled client-IP buckets. Forwarded client
IP headers are trusted only from `TRUSTED_PROXY_CIDRS` and are parsed with the configured hop
and header-size limits. Withdrawal attempts use a strict per-client bucket before a separate
high global circuit breaker, so one blocked client cannot consume the global allowance.
Survey read/submit limits run only after Google respondent proof validation and use composite
verified subject/session/token buckets, with separate materially higher global circuit breakers.
Login and recovery use normalized identifier buckets and their separate higher global breakers;
they intentionally do not use the shared Next.js BFF peer or browser forwarding headers as an
end-user identity. The global breakers are availability safeguards, not per-user budgets.
Requests larger than 64 KiB are rejected before application parsing.

Local Compose uses `DATABASE_TLS_MODE=disable`; Supabase production requires
`DATABASE_TLS_MODE=require`. This configures psycopg2/Alembic with `sslmode=require`, which
encrypts transport but does not verify the server certificate or hostname. Asyncpg uses
`ssl="require"` so the Supavisor pooler connection follows the same encryption-only transition.
Deploy and verify the TLS-capable client before enabling provider SSL enforcement. Provider SSL
enforcement and eventual CA-backed `verify-full` for every database path remain manual follow-up
items with an explicit owner and deadline. `BACKEND_CORS_ORIGINS` is an exact HTTPS-origin allowlist: no wildcard, path,
or trailing slash, and the production `APP_ORIGIN` must be included. `DEBUG=false` disables
Swagger, ReDoc, and OpenAPI routes. Next.js owns browser/document headers; FastAPI owns public
survey API headers, and the real ingress/provider must be checked rather than assumed.

Compose never forwards the root `.env` wholesale. Its frontend, backend, PostgreSQL, and opt-in
Adminer `tools` profile each receive explicit service-specific environment allowlists, and
development ports are loopback-bound. This is a local configuration boundary, not a replacement
for production secret management.

Public survey pages send `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
`X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
and `Content-Security-Policy: frame-ancestors 'none'`. Response CSVs additionally send
`private, no-store`, `Pragma: no-cache`, `nosniff`, and `no-referrer` headers.

## Migration, backfill, activation, and rollback

Execute this sequence without reordering:

1. Back up the database and confirm the PITR restore procedure before the release job.
2. Enable the ingress maintenance/write-drain rule for public survey submissions and withdrawal,
   wait for in-flight writes to finish, and stop every old API replica. Keep submissions blocked
   until step 6; an old writer after the migration can create a null retention deadline.
3. Run `./.venv/bin/alembic upgrade head` once. Confirm that `a6c42481a0d9` is applied after
   `b0d864b9935b` (which follows `3aad20b0fc8a` after `f88b9c1d0000`), verify the
   `survey_distributions` table is absent and the
   `uq_survey_responses_survey_idempotency` unique constraint is present, inspect the survey
   default backfill, verify response
   deadline backfill, verify the protected-table and proof-table RLS/ACL lockdown postconditions,
   and reconcile any enabled-retention response with a null deadline before continuing.
4. Deploy the compatible API and frontend together and invalidate stale public-form caches. Verify
   new submissions snapshot enabled and
   disabled policies correctly, withdrawal codes are one-time displayed/digest-only, and raw,
   aggregate, identity, export, and erase permission checks pass, including the requirement for
   both raw and identity capabilities on the identity endpoint.
5. Only after steps 1–4 succeed, activate one external purge schedule. Start with
   `--dry-run`, compare the due count to expectations, then run the mutating command.
6. Reconcile audit events, response counts, purge output, provider logs, no-store/streaming
   behavior, and the old/new client compatibility smoke. Then remove the ingress write block and
   monitor the first new submissions. A stale pre-Phase-3 form may receive `422` and must be
   refreshed; it must never be silently accepted without a withdrawal credential.

Before `2bf09a6bc738`, application rollback during the Phase 2 compatibility window was allowed
only while the plaintext distribution-token column remained available. At the current head,
plaintext tokens cannot be reconstructed, and `d5a4f7c91e2b` and `a8055c9859f5` cannot be
downgraded because their lockdowns are intentionally fail-closed, while `f88b9c1d0000` has a
no-op `pass` downgrade that cannot restore the dropped distribution table. Do not downgrade the migration as an ad hoc rollback;
restore a validated backup/PITR copy in isolation or use a reviewed forward fix, run release
validation including RLS/ACL checks, and then promote it.

## Retention purge operations and monitoring

Run from `backend/`:

```bash
./.venv/bin/python scripts/purge_expired_responses.py --dry-run
./.venv/bin/python scripts/purge_expired_responses.py --batch-size 100
# Optional deterministic/recovery run:
./.venv/bin/python scripts/purge_expired_responses.py --cutoff 2026-08-27T00:00:00
```

The script defaults to a batch size of 100, locks one survey before its response batches, and
logically tombstones due live responses. It also physically purges expired short-lived Google
survey auth-proof rows. It has no built-in timer: schedule one instance daily (or more frequently
if approved) through the managed provider's job/cron facility. Alert on failed or missed runs and
review stdout fields `purged`, `proofs`, `surveys`, `batches`, `dry_run`, and `cutoff`. Use
`retention_purge` audit events to reconcile response job output, and investigate a growing
due-row backlog or count mismatch. Dry runs do not mutate rows or create purge audits.

Withdrawal-cleared tombstones are already outside the live-response set and are not ordinary
retention-purge work. Their survey-scoped dedupe digest remains until administrative erasure;
this is intentional one-account-per-survey enforcement, not an accidental retention exception.

Tombstoning is not immediate physical deletion. Minimal response tombstones, erasure receipts,
and audit records remain. Database backups and PITR may retain pre-tombstone answers until the
provider's configured retention window expires; do not claim backups are immediately erased.

## Provider and launch verification

Before launch, configure Google in Supabase Auth with minimum scopes `openid email profile`, the
exact application callback allowlist, and the matching Google/Supabase provider callback. Verify
the complete Google sign-in, survey GET, and submit flow in a real provider-backed browser; unit
and application tests are not proof of provider behavior. Also configure provider redaction for
tokenized URL paths, request bodies, auth/cookie headers, idempotency keys, withdrawal codes, and
respondent identifiers. Keep the server-only
`CSV_EXPORT_ENABLED` flag `false` for the initial deployment. Before a later release enables it,
use a smoke request to verify the private Storage bucket, signed-URL expiry, and provider caching
behavior; confirm `private, no-store` survives the CDN/edge path on the preparation response and
that logs do not contain sensitive request, response, or signed URL data. Record provider, region,
domains, runtime values, backup schedule, PITR procedure, purge schedule/owner, monitoring owner,
and rollback owner in the production runbook.

Required provider actions remain manual and are not claimed as completed here: rotate any
credentials exposed during development; remove `public` from the Supabase Data API exposed
schemas/tables; enable Supabase SSL enforcement only after the TLS client rollout; track eventual
CA-backed `verify-full` for all database paths; and configure HSTS on both Vercel and
Render. Render/provider log redaction, the actual trusted forwarding chain, and the Google
provider/browser flow remain deployment verification tasks. Manually verify exact CORS,
production docs-off behavior, application-owned
headers through the real ingress, service-specific environment exposure, provider redaction and
no-store behavior, backups/PITR, and purge scheduling before launch.

## Release validation and launch gate

Run the application gate:

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

Also run the isolated PostgreSQL gate; a skipped integration suite is not a pass. PostgreSQL
migration execution and real provider browser verification are deployment gates; application
tests alone are not proof:

```bash
TEST_DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/peii_test \
  env DEBUG=false ./.venv/bin/pytest -q -m integration --require-postgres
```

Rehearse the migration/backfill and rollback on a disposable database, verify the liveness health
endpoint and RBAC seed,
exercise the public withdrawal and authenticated response operations, restore a backup/PITR copy
in isolation, and complete an end-to-end smoke test.

Real respondents remain blocked until rate limiting and Redis fail-closed behavior, the dedicated
withdrawal and respondent HMAC secrets (including the stable-dedupe rotation plan), approved
consent/retention/contact values, retention/backups/PITR policy, trusted ingress, purge
scheduling/monitoring, Google provider/browser verification, PostgreSQL migration execution,
provider log redaction, and provider public-survey no-store behavior are all verified and
recorded. Export streaming verification is
required before any later release sets `CSV_EXPORT_ENABLED=true`.
