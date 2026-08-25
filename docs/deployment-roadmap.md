# Deployment Roadmap

Status: the Phase 2 compatibility implementation is complete as of 2026-08-25. Public launch
is still blocked by the operational exit gate below; Redis and consent are implemented controls.

## Current release

- Fresh databases start at `20260825_v1`; the current forward revision is
  `f77a807cf2f9_expand_distribution_security`.
- Run `./.venv/bin/alembic upgrade head` once as the protected release job. Promote API replicas
  only after the job succeeds. Future changes are forward revisions.
- Supabase authentication, local identity linkage, global capability RBAC, audit logging,
  survey authoring, public response submission, consent evidence, Redis rate-limit plumbing,
  and the ML portal are included.
- Compose remains local development; production uses managed frontend, Python service,
  PostgreSQL, Supabase Auth, Redis, and a trusted TLS ingress.

## Implemented compatibility and privacy behavior

- Every public distribution expires explicitly. It is a shared bearer link, so respondent
  uniqueness is not guaranteed. Idempotency protects retries for a distribution/key pair only.
- New and migrated distributions have a SHA-256 token digest and 8-character display prefix;
  token listings are secret-free and issue/rotation returns plaintext once.
- The migration and application rollout sequence is exactly:
  **expand -> dual-write/digest-first -> reconcile -> digest-only app -> later contract/drop
  gate**. The expand migration retains plaintext for compatibility; no documentation or runbook
  may claim that plaintext has already been dropped.
- Consent is a global versioned contract. Current accepted consent is required for production
  responses, and each response stores an immutable full contract snapshot. The public success
  body is only `{"accepted": true}`. Successful respondent IP addresses are absent from response
  audits.
- Aggregates use `k=5` suppression. Raw reads, exports, aggregates, and erasure remain separate
  capabilities. Erasure is idempotent and retains only minimal receipt/tombstone state.

## Deployment configuration and safeguards

Set and verify these production values:

```text
RATE_LIMIT_ENABLED=true
RATE_LIMIT_INCLUDE_CLIENT_IP=false
REDIS_URL=<managed Redis TLS URL>
RATE_LIMIT_READ_FAILURE_POLICY=fail_closed
RATE_LIMIT_KEY_HMAC_SECRET=<random server-side secret, at least 32 bytes>
PUBLIC_SURVEY_READ_LIMIT=60 / PUBLIC_SURVEY_READ_WINDOW_SECONDS=60
PUBLIC_SURVEY_SUBMIT_LIMIT=10 / PUBLIC_SURVEY_SUBMIT_WINDOW_SECONDS=60
LOGIN_RATE_LIMIT=10 / LOGIN_RATE_WINDOW_SECONDS=60
PASSWORD_RECOVERY_RATE_LIMIT=5 / PASSWORD_RECOVERY_RATE_WINDOW_SECONDS=900
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
```

Redis is a distributed fixed-window dependency. A Redis outage fails closed; it must not be
replaced by an in-process fallback. Forwarded IPs are accepted only from the configured trusted
proxy networks. Keep `RATE_LIMIT_INCLUDE_CLIENT_IP=false` unless the complete forwarding chain is
verified; enable it only after confirming the app-owned resolver sees the expected trusted peer
and header chain. Requests over 64 KiB are rejected before parsing. Survey routes send no-store,
no-referrer, noindex, nosniff, frame-deny, and `frame-ancestors 'none'` headers; CSV exports
also send private/no-store and no-cache headers.

## Migration, backup, rollback, and log operations

1. Back up the database and confirm PITR before the expand job.
2. Apply the expand migration once. Verify digest/prefix backfill, nullable compatibility
   columns, and consent columns.
3. Deploy dual-write/digest-first readers, then reconcile every distribution and verify all API
   instances are compatible.
4. Deploy the digest-only application only after reconciliation. Retain plaintext solely for the
   compatibility window.
5. Treat plaintext removal as a separate contract/drop gate requiring a reviewed migration,
   backup/PITR restore test, provider log-redaction verification, and a documented rollback
   plan.

Application rollback is permitted during the compatibility window while plaintext remains.
Never use an ad hoc baseline downgrade. For a database incident, restore a validated backup/PITR
copy into an isolated database, run the release checks, and promote only after schema, RBAC,
privacy, and health checks pass; otherwise use a reviewed forward fix.

Before launch, configure provider redaction for tokenized URL paths, request bodies, auth/cookie
headers, idempotency keys, and respondent identifiers, then verify provider log retention and
redaction with a smoke request. Record provider/region/domains, trusted ingress, runtime
configuration, account owners, backup schedule, PITR procedure, and rollback owner.

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

Focused Phase 2 tests cover public consent/snapshots and minimal acknowledgements,
token compatibility, Redis outage policy, trusted proxy parsing, request-size rejection, and
the expand migration. Rehearse migration, reconciliation, backup restore, health/RBAC seed,
and an end-to-end smoke test.

Real respondents remain blocked until `RATE_LIMIT_ENABLED`, managed Redis connectivity,
approved consent text/contact/retention, trusted ingress CIDRs, and provider log redaction are
verified and recorded. Code validation is necessary but does not by itself satisfy this gate.
