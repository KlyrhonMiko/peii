# Production Decisions

## Current release and migration head

The current uncommitted tree contains the Phase 3 response-operations implementation. The
forward migration chain is:

```text
20260825_v1
  -> f77a807cf2f9 (distribution security compatibility)
  -> d1f9bad768ad (distribution expiry compatibility)
  -> fb1c93d15474 (retention and withdrawal)
  -> 2bf09a6bc738 (remove plaintext distribution tokens)
```

`2bf09a6bc738` is the current Alembic head. Fresh environments and the production release job
run `./.venv/bin/alembic upgrade head` once before API replicas are promoted. Phase 3 is **not**
a rolling or independently deployable frontend/backend release: the request contract and
retention writes change together. Block public submissions at ingress, drain and stop every old
API writer, run the migration and reconciliation checks, deploy the API and frontend, purge
stale frontend caches, complete smoke tests, and only then reopen submissions. Do not run
migrations independently in every replica or downgrade the baseline as an ad hoc rollback.

The Phase 2 compatibility behavior is historical: `f77a807cf2f9` added SHA-256 token digests and
8-character prefixes while retaining plaintext distribution tokens, and `d1f9bad768ad` made the
database expiry column nullable. The current `2bf09a6bc738` contract revision reconciles existing
digests/prefixes, requires the digest, and drops the plaintext token column. Its downgrade cannot
reconstruct plaintext tokens.

Under the current runtime contract, create and rotate persist only a token digest and prefix.
List and revoke metadata are token-free, while create and rotate reveal a newly generated bearer
token once. Omitted expiry receives the configured server default (currently 30 days); explicit
expiry must be in the future and cannot exceed the configured maximum (currently 30 days). Legacy
rows with a null expiry remain possible and non-expiring.

## Deployment topology

- Frontend: managed Next.js Node.js host, with provider and region recorded before launch.
- Backend: managed Python web service in the same region as the database.
- Database: Supabase PostgreSQL or another managed PostgreSQL provider with automated backups
  and point-in-time recovery (PITR).
- Authentication: Supabase Auth.
- Rate limiting: managed Redis; production uses distributed fixed-window limits.
- Retention purge: one externally scheduled managed job running the backend purge command.
- Docker Compose remains local development only.

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
| `survey_distributions.manage` | Create, list, rotate, and revoke distributions. |
| `survey_responses.read_aggregates` | View aggregated survey responses. |
| `survey_responses.read_raw` | View raw survey responses. |
| `survey_responses.export` | Export survey responses. |
| `survey_responses.erase` | Erase survey responses. |

Defaults remain: `admin` has all 21 capabilities; `researcher` has all except
`survey_responses.erase`; and `staff` has `portal.access`, `ml.models.read`, `surveys.read`,
and `survey_responses.read_aggregates`. Raw reads, exports, aggregates, distribution
management, and erasure are separate capabilities. Authentication or survey ownership is not
an implicit grant.

Role assignment is additionally constrained by the actor's effective permissions: an actor cannot
grant a role with permissions exceeding their own. Assignment of the protected system Admin role
is restricted to active Admins.

## Phase 3 response and privacy decisions

### Retention

- New surveys default to `retention_enabled=true` and `retention_days=1825` (five years).
- Each response receives an immutable `retention_expires_at` snapshot from server submission time
  plus the survey's retention days. Updating a policy never changes existing response deadlines.
- Retention settings may be changed only before any response row exists. After the first row,
  including a withdrawn or erased row, the policy is immutable.
- When retention is disabled before a survey has responses, new responses receive a null
  deadline. Null deadlines are not due for purge and are treated as non-expiring by raw reads,
  aggregates, and exports. Disabling does not rewrite existing snapshots.
- The Phase 3 migration sets existing survey policies to enabled/1,825 days and backfills
  existing response deadlines from their submission timestamps. Review this backfill before
  enabling the purge schedule.

### Withdrawal

The browser generates a 32-byte (`256-bit`) random base64url withdrawal code, sends it with the
submission, and shows it once after the minimal `{"accepted": true}` acknowledgement. The
backend stores only its HMAC-SHA-256 digest. Production must set the dedicated
`WITHDRAWAL_CODE_HMAC_SECRET` to a random value of at least 32 bytes; it must not be reused as
the rate-limit HMAC key. The code is never returned by the backend, persisted in plaintext,
included in schemas/audits, or logged. A lost code cannot be recovered by PEII.

The public API route is `POST /api/v1/survey/responses/withdraw`; the frontend page is
`/survey/withdraw`. A valid request tombstones the response and is safe to repeat. User
withdrawal retains only the digest needed to recognize a repeat; administrative erasure clears
it.

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
  `submitted_from` (inclusive), `submitted_before` (exclusive), and `distribution_id` filters.
  There is no `include_deleted` or answer-content escape hatch.
- CSV export is long-format, streamed from the database, preflight-capped at 10,000 eligible
  responses, and private/no-store. The accepted preflight count bounds the deferred stream, so
  concurrent inserts cannot add records beyond that count. The start audit commits before
  streaming; successful and aborted audits use the same export id and report the actual number
  of response records traversed.
- Selected erasure accepts up to 100 response ids. All-response erasure requires an archived
  survey and an expected-count match. Both require a UUID `Idempotency-Key`, explicit
  confirmation, atomic audit, and retain only minimal tombstone/receipt state.

## Runtime configuration

Production must set these values explicitly:

```text
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
PUBLIC_SURVEY_SUBMIT_LIMIT=10
PUBLIC_SURVEY_SUBMIT_WINDOW_SECONDS=60
PUBLIC_SURVEY_WITHDRAWAL_CLIENT_LIMIT=10
PUBLIC_SURVEY_WITHDRAWAL_CLIENT_WINDOW_SECONDS=60
PUBLIC_SURVEY_WITHDRAWAL_GLOBAL_LIMIT=1000
PUBLIC_SURVEY_WITHDRAWAL_GLOBAL_WINDOW_SECONDS=60
LOGIN_RATE_LIMIT=10
LOGIN_RATE_WINDOW_SECONDS=60
PASSWORD_RECOVERY_RATE_LIMIT=5
PASSWORD_RECOVERY_RATE_WINDOW_SECONDS=900
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
SURVEY_DISTRIBUTION_DEFAULT_EXPIRY_DAYS=30
SURVEY_DISTRIBUTION_MAX_EXPIRY_DAYS=30
```

Redis outages fail closed in production; do not silently fall back to process-local limits.
Non-debug startup rejects disabled rate limiting or disabled client-IP buckets. Forwarded client
IP headers are trusted only from `TRUSTED_PROXY_CIDRS` and are parsed with the configured hop
and header-size limits. Withdrawal attempts use a strict per-client bucket before a separate
high global circuit breaker, so one blocked client cannot consume the global allowance.
Requests larger than 64 KiB are rejected before application parsing.

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
3. Run `./.venv/bin/alembic upgrade head` once. Confirm that `2bf09a6bc738` is applied after
   `fb1c93d15474`, verify distribution digests are populated and the plaintext token column is
   absent, inspect the survey default backfill, and verify response deadline backfill. Reconcile
   any enabled-retention response with a null deadline before continuing.
4. Deploy the compatible API and frontend together and invalidate stale public-form caches. Verify
   new distribution create/rotate responses reveal tokens once, list/revoke metadata stays
   token-free, expiry defaults and maximum validation work, and new submissions snapshot enabled and
   disabled policies correctly, withdrawal codes are one-time displayed/digest-only, and raw,
   aggregate, export, and erase permission checks pass.
5. Only after steps 1–4 succeed, activate one external purge schedule. Start with
   `--dry-run`, compare the due count to expectations, then run the mutating command.
6. Reconcile audit events, response counts, purge output, provider logs, no-store/streaming
   behavior, and the old/new client compatibility smoke. Then remove the ingress write block and
   monitor the first new submissions. A stale pre-Phase-3 form may receive `422` and must be
   refreshed; it must never be silently accepted without a withdrawal credential.

Before `2bf09a6bc738`, application rollback during the Phase 2 compatibility window was allowed
only while the plaintext distribution-token column remained available. At the current head,
plaintext tokens cannot be reconstructed. Do not downgrade the migration as an ad hoc rollback;
restore a validated backup/PITR copy in isolation or use a reviewed forward fix, run release
validation, and then promote it.

## Retention purge operations and monitoring

Run from `backend/`:

```bash
./.venv/bin/python scripts/purge_expired_responses.py --dry-run
./.venv/bin/python scripts/purge_expired_responses.py --batch-size 100
# Optional deterministic/recovery run:
./.venv/bin/python scripts/purge_expired_responses.py --cutoff 2026-08-27T00:00:00
```

The script defaults to a batch size of 100, locks one survey before its response batches, and
logically tombstones due responses. It has no built-in timer: schedule one instance daily (or
more frequently if approved) through the managed provider's job/cron facility. Alert on failed
or missed runs and review stdout fields `purged`, `surveys`, `batches`, `dry_run`, and `cutoff`.
Use `retention_purge` audit events to reconcile job output, and investigate a growing due-row
backlog or count mismatch. Dry runs do not mutate rows or create purge audits.

Tombstoning is not immediate physical deletion. Minimal response tombstones, erasure receipts,
and audit records remain. Database backups and PITR may retain pre-tombstone answers until the
provider's configured retention window expires; do not claim backups are immediately erased.

## Provider and launch verification

Before launch, configure provider redaction for tokenized URL paths, request bodies, auth/cookie
headers, idempotency keys, withdrawal codes, and respondent identifiers. Keep the server-only
`CSV_EXPORT_ENABLED` flag `false` for the initial deployment. Before a later release enables it,
use a smoke request to verify the provider does not cache, index, persist, or unexpectedly buffer
the streamed CSV; confirm `private, no-store` survives the CDN/edge path and that logs do not
contain sensitive request or response data. Record provider, region, domains, runtime values,
backup schedule, PITR procedure, purge schedule/owner, monitoring owner, and rollback owner in the
production runbook.

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

Also run the isolated PostgreSQL gate; a skipped integration suite is not a pass:

```bash
TEST_DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/peii_test \
  env DEBUG=false ./.venv/bin/pytest -q -m integration --require-postgres
```

Rehearse the migration/backfill and rollback on a disposable database, verify health/RBAC seed,
exercise the public withdrawal and authenticated response operations, restore a backup/PITR copy
in isolation, and complete an end-to-end smoke test.

Real respondents remain blocked until rate limiting and Redis fail-closed behavior, the dedicated
withdrawal secret, approved consent/retention/contact values, retention/backups/PITR policy,
trusted ingress, purge scheduling/monitoring, provider log redaction, and provider
public-survey no-store behavior are all verified and recorded. Export streaming verification is
required before any later release sets `CSV_EXPORT_ENABLED=true`.
