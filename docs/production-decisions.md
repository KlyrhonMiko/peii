# Production Decisions

## Phase 2 compatibility release

- The canonical fresh-database baseline is `20260825_v1`; the current forward migration is
  `f77a807cf2f9` (`expand_distribution_security`). Run
  `./.venv/bin/alembic upgrade head` once as the protected release job before promoting API
  replicas.
- This release expands distribution-token security and adds consent evidence. It is a rolling
  compatibility release: plaintext distribution tokens are **not removed yet**.
- Frontend and backend artifacts may be released independently, but the API is promoted only
  after the migration job and release smoke test succeed.

## Deployment topology

- Frontend: managed Next.js Node.js host, with provider and region recorded before launch.
- Backend: managed Python web service in the same region as the database.
- Database: Supabase PostgreSQL or another managed PostgreSQL provider with automated backups
  and point-in-time recovery (PITR).
- Authentication: Supabase Auth.
- Rate limiting: managed Redis; production uses distributed fixed-window limits.
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
management, and erasure remain separate capabilities.

## Survey, consent, and link privacy

- Every public distribution has an explicit expiry. A distribution is a shared bearer link, not
  an individual invitation. Reusing a link can create responses from multiple people; the
  application does not guarantee respondent uniqueness. An idempotency key prevents a repeated
  submission from the same distribution and key from creating a second response, but it does
  not identify a respondent.
- Newly issued or rotated plaintext tokens are returned once. Distribution listings never
  return tokens. New and reconciled rows have a SHA-256 token digest and an 8-character display
  prefix; the digest is used first for lookup.
- The current public consent contract is global and versioned. A response requires
  `accepted=true` and the current `PUBLIC_SURVEY_CONSENT_VERSION`. The response stores the
  consent version, timestamp, and an immutable snapshot of notice, purpose, retention, and
  contact values as they appeared at submission. The public response acknowledgement is
  intentionally minimal: `{"accepted": true}`.
- Successful respondent IP addresses are not written to response audit events. IPs may exist
  temporarily in Redis rate-limit keys, whose identifiers are HMAC-SHA-256 digests; do not
  describe the survey as confidential or promise respondent anonymity.
- Archiving revokes unrevoked distributions; restoring a survey leaves it inactive. Aggregates
  use conservative `k=5` suppression. Selected and all-response erasure is idempotent, clears
  answer/linkage/consent evidence, and retains only minimal receipt or tombstone state; all
  erasure requires the existing administrator capability and all-scope erasure requires an
  archived survey.

## Traffic and deployment security

Production must set these values explicitly (the values below are the supported release
policy):

```text
RATE_LIMIT_ENABLED=true
RATE_LIMIT_INCLUDE_CLIENT_IP=false
# Use either a Redis-compatible URL or both Upstash REST settings:
REDIS_URL=<managed Redis TLS URL>
# UPSTASH_REDIS_REST_URL=<Upstash REST URL>
# UPSTASH_REDIS_REST_TOKEN=<Upstash REST token>
REDIS_MAX_CONNECTIONS=32
REDIS_CONNECT_TIMEOUT_SECONDS=2
REDIS_SOCKET_TIMEOUT_SECONDS=2
RATE_LIMIT_READ_FAILURE_POLICY=fail_closed
RATE_LIMIT_KEY_HMAC_SECRET=<random server-side secret, at least 32 bytes>
PUBLIC_SURVEY_READ_LIMIT=60
PUBLIC_SURVEY_READ_WINDOW_SECONDS=60
PUBLIC_SURVEY_SUBMIT_LIMIT=10
PUBLIC_SURVEY_SUBMIT_WINDOW_SECONDS=60
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
```

Redis outages fail closed in production; do not silently fall back to process-local limits.
Forwarded client IP headers are trusted only from `TRUSTED_PROXY_CIDRS` and are parsed with the
configured hop and header-size limits. The trusted ingress must be verified before launch.
Keep `RATE_LIMIT_INCLUDE_CLIENT_IP=false` by default: public survey, login, and recovery limits
use only their resource identifiers so shared frontend egress does not throttle unrelated users.
Enable it only after the complete forwarding chain and the app-owned peer/header resolution have
been verified in the deployed topology.
Requests larger than 64 KiB are rejected before application parsing.

Public survey pages send `Cache-Control: no-store`, `Referrer-Policy: no-referrer`,
`X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
and `Content-Security-Policy: frame-ancestors 'none'`. Response CSVs additionally send
`private, no-store`, `Pragma: no-cache`, `nosniff`, and `no-referrer` headers.

## Token migration and rollback

Execute this sequence; do not skip or reorder it:

1. **Expand:** apply `f77a807cf2f9`, add nullable digest/prefix and consent columns, and
   backfill `SHA-256(plaintext)` plus `plaintext[:8]` while retaining the existing plaintext
   token column.
2. **Dual-write/digest-first:** deploy the compatibility application, which writes plaintext,
   digest, and prefix for new/rotated tokens and resolves by digest first with legacy plaintext
   fallback.
3. **Reconcile:** verify every live distribution has the expected unique digest and matching
   8-character prefix; investigate mismatches and confirm all API instances use the compatibility
   reader.
4. **Digest-only app:** deploy an application that hashes supplied tokens for lookup and no
   longer depends on the plaintext column. Keep the column only for the compatibility window.
5. **Later contract/drop gate:** after reconciliation, a full digest-only rollout, backup/PITR
   verification, provider log-redaction verification, and an approved rollback plan, add a
   separate reviewed migration to remove the plaintext column. This release has **not** reached
   that gate.

Application rollback during the compatibility window is allowed only while the plaintext column
remains available. Do not downgrade the expand revision as an ad hoc rollback: restore a
validated backup/PITR copy in isolation or use a reviewed forward fix, run release validation,
then promote it. Migrations still run exactly once as a release job.

Provider access logs and observability must redact distribution tokens in URL paths, request
bodies containing answers/consent, authorization headers, cookies, idempotency keys, and raw
forwarded identifiers. Confirm provider retention and redaction behavior in the runbook before
accepting real responses.

## Release validation and launch gate

Run the full application gate:

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

The focused Phase 2 coverage includes `test_public_survey_privacy.py`,
`test_public_rate_limits.py`, `test_traffic_security.py`, `test_security_expand_migration.py`,
and `test_survey_distributions.py`. Rehearse migration and reconciliation on a disposable
database, verify health/RBAC seed, restore a backup/PITR copy in isolation, and complete a
release smoke test.

Real respondents remain blocked until `RATE_LIMIT_ENABLED=true`, managed Redis connectivity and
fail-closed behavior, approved consent notice/purpose/contact/retention values, trusted ingress
CIDRs, and provider log redaction are all verified and recorded. Record provider, region,
domains, owners, runtime values, backup schedule, PITR procedure, and rollback owner in the
production runbook.
