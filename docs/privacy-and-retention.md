# Privacy And Retention

## Scope and non-goals

Phase 3 adds response retention, respondent withdrawal, raw-response reads, aggregates,
streamed export, and response erasure. The completed identified survey flow requires Google
authentication: the verified Google email and display name are stored with the response, and
authorized researchers can identify respondents. The distribution token remains only a survey
locator; it is not respondent identity or proof of authorization. The response idempotency key
only makes retries safe for one distribution/key pair. PEII must not promise anonymity or
confidentiality.

The current distribution contract is digest-only. The historical Phase 2 compatibility revision
retained plaintext tokens while adding a digest and prefix, and the follow-up expiry revision kept
the database expiry column nullable. The current `2bf09a6bc738` contract revision removed the
plaintext column after digest reconciliation, and `d5a4f7c91e2b` applies the Supabase Data API
RLS/ACL lockdown. The current Alembic head is `a8055c9859f5`, after `d5a4f7c91e2b`. The current
head adds short-lived Google survey auth proofs, nullable legacy-compatible response identity
snapshots, survey-scoped dedupe uniqueness, `survey_responses.read_identity`, and proof-table
ACL/RLS lockdown. The protected-table and proof-table downgrades are intentionally fail-closed
and irreversible. Runtime create/rotate stores only the digest and prefix; list/revoke metadata
is token-free; and create/rotate reveal a newly generated token once.
Omitted expiry receives the configured server default (currently 30 days), while an explicit future
expiry cannot exceed the configured maximum (currently 30 days). Legacy rows with null expiry
remain possible and non-expiring.

## Google-authenticated identified survey flow

- Survey GET and submit require a dedicated Google OAuth respondent session and a backend proof.
  The server-rendered survey page may fetch GET from FastAPI through `BACKEND_INTERNAL_URL` after
  isolated auth; browser submission uses the focused same-origin `/api/survey/[token]` BFF. The
  portal remains password/invite/recovery based and rejects OAuth sessions. Withdrawal remains
  direct and code-only.
- Next.js uses isolated `peii-survey-auth-token` cookies, the fixed
  `/auth/survey/google/callback`, HMAC-signed flow-bound return state, and the focused same-origin
  `/api/survey/[token]` BFF. `SURVEY_OAUTH_STATE_KEY` is server-only and must be a random value
  of at least 32 bytes; it must never be exposed as `NEXT_PUBLIC_*`.
- Configure Google in Supabase Auth with minimum scopes `openid email profile`. Add the exact
  `${APP_ORIGIN}/auth/survey/google/callback` to the Supabase Auth redirect allowlist and configure
  the Google OAuth client with the Google/Supabase provider callback as appropriate.
- The backend uses `GOOGLE_OAUTH_CLIENT_ID`, a dedicated random-at-least-32-byte
  `SURVEY_RESPONDENT_HMAC_SECRET`, `SURVEY_GOOGLE_SESSION_MAX_AGE_SECONDS` (default 300 seconds,
  production maximum 3,600), `GOOGLE_SURVEY_ATTEST_RATE_LIMIT=5`, and
  `GOOGLE_SURVEY_ATTEST_RATE_WINDOW_SECONDS=60`. Keep the respondent HMAC secret stable for
  survey lifetimes because raw Google subject is not stored; routine rotation cannot preserve
  dedupe. Incident rotation requires explicit acceptance that prior accounts may submit again or
  a controlled closure/reconciliation plan.
- Before Google sign-in and again at consent, disclose that the verified Google email and display
  name are stored with the response; authorized researchers can identify respondents; identity
  enables one Google account per survey; direct identity and answers are removed on respondent
  withdrawal, but a survey-scoped pseudonymous dedupe digest is retained so that account cannot
  submit again; administrative erasure clears the digest; and short-lived proof PII is physically
  deleted by the external purge after expiry. Do not describe this flow as anonymous or
  confidential.

## Consent and immutable evidence

- The consent policy is one server-owned, global, versioned contract across surveys.
  The Google-authenticated `GET /api/v1/survey/{token}` publishes its current version, notice,
  purpose, retention statement, and contact before submission.
- A production submission must include `accepted=true` and the current consent version. A stale
  version is rejected, so a respondent must reload and review the current contract.
- Each accepted response records `consent_version`, `consented_at`, and an immutable
  `consent_notice_snapshot` containing the full contract at submission. Later configuration
  changes do not rewrite that snapshot. Erasure clears the snapshot with answers and linkage.
- The notice shown before OAuth and at consent must state that verified Google email/display name
  is stored with the response, authorized researchers can identify respondents, one Google account
  is enforced per survey, withdrawal removes direct identity and answers while retaining the
  survey-scoped pseudonymous dedupe digest until administrative erasure, and expired short-lived
  proof PII is physically deleted by the external purge. The example consent version is
  `2026-09-01`; production values require explicit approval.
- The public acknowledgement contains exactly `{"accepted": true}`. It has no response id,
  token, answers, withdrawal code, or consent text. Replays with the same idempotency key return
  the same minimal acknowledgement.

The production runbook must contain the approved notice text, purpose, retention duration, and
withdrawal/privacy contact. Placeholder values in local configuration are not approval.

## Per-survey retention policy

- `retention_enabled` defaults to `true` and `retention_days` defaults to `1825` days (five
  years). The defaults are present in the backend model and request schemas and are also used by
  the frontend create flows.
- On initial submission, the server snapshots the policy into the response as
  `retention_expires_at = submission_time + retention_days`. For the generated two-phase
  questionnaire, successful Phase 2 completion resets that same row's deadline from the final
  completion time. Later survey-policy changes never move an existing deadline.
- A survey's retention settings can be changed only before any response row exists. Once a
  survey has a response, including a withdrawn, erased, or otherwise tombstoned row, changing
  either setting is rejected with the retention-policy-immutable conflict.
- Disabling retention affects only submissions made while the policy is disabled: those
  responses receive a null `retention_expires_at` and are not due for retention purge. It does
  not clear or extend deadlines already snapped on earlier responses. Because the policy becomes
  immutable after the first response, toggling it is a pre-response configuration decision.
- The Phase 3 migration makes existing survey policy fields enabled with 1,825 days and
  backfills existing response deadlines from their recorded submission timestamps. Review that
  backfill before enabling the purge job.

At read time, a response is eligible only when it is not logically deleted and its deadline is
either null or later than the current server time. Raw reads, aggregates, and exports all apply
this predicate. Expired rows therefore disappear from those operations immediately, even if the
scheduled purge has not run yet.

## Withdrawal code flow

- The browser generates a private code with 32 cryptographically random bytes (`crypto.getRandomValues`)
  and presents it as unpadded base64url text. This is a 256-bit respondent-held secret.
- The code is sent with Phase 1 and is shown once after the minimal submission acknowledgement.
  Phase 2 updates the same response and does not create another code. The browser provides copy
  support and links to the public `/survey/withdraw`
  page. The backend never returns the code in a response, read schema, audit event, or log.
- The backend stores only an HMAC-SHA-256 digest under the dedicated
  `WITHDRAWAL_CODE_HMAC_SECRET`; it never persists the plaintext code. Production requires a
  dedicated random secret of at least 32 bytes. The withdrawal code and the rate-limit HMAC key
  must not be reused.
- Legacy responses identified by an answers-only idempotency hash may receive missing consent
  evidence on a compatible replay, but the replay never binds or replaces a withdrawal digest
  and never upgrades that hash with the supplied code. A legacy row without a Phase 3 withdrawal
  digest remains non-withdrawable unless a separate ownership proof is designed.
- The public backend operation is `POST /api/v1/survey/responses/withdraw`. It accepts only the
  code, looks up the digest, and returns the generic not-found/already-withdrawn response for an
  unknown code. A valid request logically tombstones the response and is safe to repeat; direct
  identity and answers are removed, while the survey-scoped pseudonymous dedupe digest is retained
  so the same Google account cannot submit again. Administrative erasure clears that digest.
- A lost code cannot be recovered by PEII: no response id, distribution token, or plaintext code
  is available to support a recovery lookup. The respondent must retain the code after submission.

## Response operations and permissions

Survey response authorization is global capability RBAC, not survey ownership or membership.
Authentication alone is insufficient, and each operation has its own capability:
The default `admin` and `researcher` roles have `survey_responses.read_identity`; `staff` does
not. The identity endpoint additionally requires `survey_responses.read_raw`.

| Operation | Route | Capability / policy |
| --- | --- | --- |
| Raw page | `GET /api/v1/surveys/{survey_id}/responses/` | `survey_responses.read_raw` |
| Identity page | identity response endpoint | both `survey_responses.read_raw` and `survey_responses.read_identity` |
| Aggregate | `GET /api/v1/surveys/{survey_id}/responses/aggregates` | `survey_responses.read_aggregates` |
| CSV export | `GET /api/v1/surveys/{survey_id}/responses/export` | `CSV_EXPORT_ENABLED=true` and `survey_responses.export` |
| Erasure | `POST /api/v1/surveys/{survey_id}/responses/erase` | `survey_responses.erase` plus request confirmation and UUID `Idempotency-Key` |

The respondent routes are deliberately separate from these protected operations:
`GET /api/v1/survey/{token}`, `POST /api/v1/survey/{token}/respond`, and
`PATCH /api/v1/survey/{token}/respond` require the dedicated
Google OAuth respondent session and backend proof. The server-rendered page may fetch the GET from
FastAPI through `BACKEND_INTERNAL_URL` after isolated auth; browser submission uses the focused
same-origin Next.js BFF at `/api/survey/[token]`. These operations do not use the portal
`/api/backend` BFF or direct browser calls to `NEXT_PUBLIC_API_URL`. `POST /api/v1/survey/responses/withdraw`
remains direct and code-only; the frontend withdrawal page is
`/survey/withdraw` and does not require Google OAuth, a survey link, or portal login.

Raw, aggregate, and CSV response contracts remain identity-free. Identity snapshots are exposed
only through the separately gated identity endpoint, which requires both raw-read and
identity-read capability.

### Generated two-phase questionnaire

The generated Graduate Tracer questionnaire stores both phases in one response row under one
distribution link. Question configuration marks Phase 1 and Phase 2 explicitly. The authenticated
GET returns only the phase currently available to that Google respondent: POST creates the row for
Phase 1, PATCH locks and merges Phase 2 answers into it, and a completed or withdrawn response
returns no form. `created_at` records Phase 1; `updated_at` at completion and the immutable
`phase1_submitted` / `phase2_submitted` audit events record the two submission times.

The one withdrawal code removes the whole two-phase response. `responses_count` remains a count of
participant rows, so Phase 2 does not increment it. Existing surveys whose questions do not carry
phase metadata keep the original single-submit behavior.

### Raw response listing

Raw reads return only non-deleted, non-expired responses, including when an authorized user
reads an archived survey. They use offset pagination: `limit` defaults to 50 and is capped at
100, `offset` defaults to 0, and ordering is `created_at` with `asc` or `desc` plus a stable id
tiebreaker. The supported filters are:

- `submitted_from` (inclusive submission timestamp);
- `submitted_before` (exclusive submission timestamp); and
- `distribution_id`.

The lower bound must be earlier than the upper bound. There is no raw-answer filter and no
`include_deleted` escape hatch; deleted and expired rows remain excluded. The response envelope
includes both pagination metadata and the applied filter metadata.

### Aggregates

Aggregates are available for every survey status, including `Inactive`, live `Active`, `Closed`,
and archived (soft-deleted) surveys. Results for an active survey can change as responses arrive.
The endpoint has no filter or pagination parameters and emits only aggregate cells for supported
single-choice, boolean, multiple-choice, scale, ranking, and matrix questions; raw answer
documents never cross the aggregate contract.

Aggregates return exact totals and cell counts even when only one to four responses contribute.
They are therefore not anonymous, confidential, or a privacy-preserving guarantee; an authorized
viewer may be able to infer a known participant's answer in a small group or by comparing live
results over time. Aggregate access must remain limited to approved roles. Capacity remains
bounded to 1,000 cells per question and 10,000 cells per survey.

### Streamed CSV export

CSV export is implemented but disabled for the initial online deployment. FastAPI returns a
generic `404` and the frontend hides the export action unless the server-only
`CSV_EXPORT_ENABLED` flag is explicitly `true` in both deployments. The following contract
applies when export is enabled.

Exports use the same live-response predicate, allow authorized access to archived surveys, and
have no client-side filters. A preflight count is performed before the stream starts; more than
10,000 eligible responses returns `413` without opening the database stream or writing an export
start audit. The CSV is long-format with these columns:
`response_id`, `submitted_at`, `question_id`, `question_text`, `question_type`, and
`answer_json`. Database rows are read in partitions with the accepted preflight count applied as
a stream bound, and emitted in bounded chunks rather than materializing the full export in memory.
The stream records the number of response records actually traversed; successful and aborted
audit events use that actual count, while the start audit retains the accepted preflight count.

Every export receives an export id. The `export_started` audit commits before the response
headers and stream are returned. A successful stream records a correlated `export` audit with
the response and answer-row counts. A cancelled or failed stream records a best-effort
correlated `export_aborted` audit; after headers have been sent, the original stream failure is
not hidden by a secondary audit failure.

The response sets `private, no-store`, no-cache, `nosniff`, `no-referrer`, same-origin, sandbox,
and buffering-control headers. Provider/CDN behavior must still be verified: the runbook smoke
test must confirm that the CSV is not cached, stored, indexed, or buffered unexpectedly and that
provider access logs redact the route, authorization/cookie headers, and response content as
appropriate.

## Logical erasure and scheduled retention purge

Selected erasure accepts up to 100 unique response UUIDs and the literal confirmation
`ERASE_SELECTED_RESPONSES`. All-response erasure accepts the literal
`ERASE_ALL_RESPONSES`, requires an archived survey, and requires the expected live response
count to match. Reusing an idempotency key with the same request returns the original result;
reusing it with a different request is rejected.

Both erasure paths logically tombstone rows rather than physically deleting them. Tombstoning
clears answers, direct identity, distribution linkage, submission idempotency data, consent
version/time/snapshot, and the withdrawal digest, then retains only the response row's minimal
tombstone state. Survey counts are reconciled in the same transaction. The mutation and its
audit entry commit atomically; an erasure receipt is retained for batch idempotency. A retention
purge uses the same tombstone operation and records a `retention_purge` audit per bounded batch.
Retention purge clears the withdrawal digest; respondent withdrawal clears direct identity and
answers but retains the survey-scoped pseudonymous dedupe digest so the same account cannot submit
again. Withdrawal-cleared tombstones have already had their direct identity and answers deleted
and are outside the live-response set; they are therefore not ordinary response-retention purge
work. The remaining survey-scoped dedupe digest is intentional one-account enforcement and
remains until administrative erasure.

The purge is an operational command, not an in-process timer:

```bash
# run from backend/
./.venv/bin/python scripts/purge_expired_responses.py --dry-run
./.venv/bin/python scripts/purge_expired_responses.py
```

The command defaults to batches of 100 and supports `--batch-size` and an ISO-8601 `--cutoff`.
It purges expired short-lived Google proof rows as well as due live responses and prints
`proofs` alongside `purged`, `surveys`, `batches`, and `cutoff`. Schedule it from a single
external managed job at least daily, alert on a non-zero exit or a missed run, and reconcile
response output with `retention_purge` audit events. A dry run counts due rows/proofs without
mutating or auditing them. The operation locks a survey before bounded response batches and is
repeat-safe.

Logical tombstoning does not mean that all traces vanish immediately. Minimal database
tombstones, erasure receipts, and audit records remain by design. Managed database backups and
PITR may contain pre-tombstone answers until the provider's configured backup/PITR retention
window expires; PEII cannot claim that backups are immediately erased. The owner must approve
and record primary retention, backup/PITR retention, provider log retention, withdrawal handling,
and the approved raw-answer and identity-reader roles before launch.

## Traffic, logs, and launch gate

Production requires `RATE_LIMIT_ENABLED=true`, managed Redis,
`RATE_LIMIT_READ_FAILURE_POLICY=fail_closed`, the server-side
`RATE_LIMIT_KEY_HMAC_SECRET`, the dedicated `WITHDRAWAL_CODE_HMAC_SECRET`, the dedicated
`SURVEY_RESPONDENT_HMAC_SECRET`, and the documented fixed-window limits. The respondent HMAC
secret must be random, at least 32 bytes, and stable for survey lifetimes because raw Google
subject is not stored. Routine rotation cannot preserve dedupe; incident rotation requires
explicit acceptance that prior accounts may submit again or a controlled closure/reconciliation
plan. Non-debug startup requires rate limiting and client-IP buckets. Withdrawal uses a strict
per-client limit before a separate high global circuit breaker; exhausting one client bucket does
not consume the remaining global allowance. Redis outage blocks rate-limited requests rather than
falling back to local memory. Trusted ingress CIDRs must be configured for forwarded headers, and
`MAX_REQUEST_BODY_BYTES=65536` rejects oversized requests before parsing.
Survey read/submit limits are applied only after Google respondent proof validation, keyed by the
verified subject, session, and token, with separate materially higher global breakers. Portal
login and recovery retain normalized identifier limits but intentionally exclude the shared Next.js
BFF peer and browser forwarding headers from those budgets; their higher global breakers remain
availability safeguards rather than user budgets.

Survey pages use no-store, no-referrer, noindex, nosniff, frame-deny, and
`frame-ancestors 'none'` headers. Provider logs must redact tokenized URL paths, request bodies,
authorization/cookie headers, idempotency keys, withdrawal codes, and respondent identifiers.
Verify those controls and provider retention settings before accepting real responses.

FastAPI owns these public survey API headers; Next.js owns browser/document headers. Exact
`BACKEND_CORS_ORIGINS` HTTPS origins are required in production, with no wildcard, path, or
trailing slash. Local Compose uses `DATABASE_TLS_MODE=disable`; Supabase production requires
`DATABASE_TLS_MODE=require`. This configures psycopg2/Alembic with `sslmode=require`, which
encrypts transport but does not verify the server certificate or hostname. Asyncpg uses
`ssl="require"` so the Supavisor pooler connection follows the same encryption-only transition.
Provider SSL enforcement and eventual CA-backed `verify-full` for every database path remain
manual follow-up items with an owner and deadline. Provider/CDN behavior must be verified on the real ingress.

Before launch, operators must configure Google in Supabase Auth with minimum scopes
`openid email profile`, allowlist the exact `${APP_ORIGIN}/auth/survey/google/callback`, configure
the matching Google/Supabase provider callback, and complete a real provider-backed browser
verification of Google sign-in, survey GET, and submit. Operators must also execute and verify the
Alembic migration against PostgreSQL; application tests and a liveness check are not proof of
either provider or database behavior. Rotate any credentials exposed during development, remove
`public` from Supabase Data API exposed schemas/tables, enable Supabase SSL enforcement after TLS
client deployment, track eventual CA-backed `verify-full` for all database paths, configure HSTS
on Vercel and Render, and verify log redaction, no-store behavior, backups/PITR, and purge
scheduling. This document does not claim those provider actions have run.

Real respondents remain blocked until rate limiting and Redis fail-closed behavior, the approved
consent and privacy contact, retention and backup/PITR policy, trusted ingress, purge scheduling
and monitoring, PostgreSQL migration execution, real Google provider/browser verification,
provider log redaction, and provider streaming/no-store behavior are all verified and recorded.
Passing application tests alone does not open this gate.
