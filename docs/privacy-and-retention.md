# Privacy And Retention

## Scope and non-goals

Phase 3 adds response retention, respondent withdrawal, raw-response reads, aggregates,
streamed export, and response erasure. Responses are pseudonymous: the application stores
answers and distribution association, not a respondent account. A distribution is a shared
bearer link. It does not establish a person's identity, guarantee one response per person, or
support a promise of confidentiality or anonymity. The idempotency key only makes retries safe
for one distribution/key pair.

The current distribution contract is digest-only. The historical Phase 2 compatibility revision
retained plaintext tokens while adding a digest and prefix, and the follow-up expiry revision kept
the database expiry column nullable. The current `2bf09a6bc738` contract revision removed the
plaintext column after digest reconciliation. Runtime create/rotate stores only the digest and
prefix; list/revoke metadata is token-free; and create/rotate reveal a newly generated token once.
Omitted expiry receives the configured server default (currently 30 days), while an explicit future
expiry cannot exceed the configured maximum (currently 30 days). Legacy rows with null expiry
remain possible and non-expiring.

## Consent and immutable evidence

- The public consent policy is one server-owned, global, versioned contract across surveys.
  `GET /api/v1/survey/{token}` publishes its current version, notice, purpose, retention
  statement, and contact.
- A production submission must include `accepted=true` and the current consent version. A stale
  version is rejected, so a respondent must reload and review the current contract.
- Each accepted response records `consent_version`, `consented_at`, and an immutable
  `consent_notice_snapshot` containing the full contract at submission. Later configuration
  changes do not rewrite that snapshot. Erasure clears the snapshot with answers and linkage.
- The public acknowledgement contains exactly `{"accepted": true}`. It has no response id,
  token, answers, withdrawal code, or consent text. Replays with the same idempotency key return
  the same minimal acknowledgement.

The production runbook must contain the approved notice text, purpose, retention duration, and
withdrawal/privacy contact. Placeholder values in local configuration are not approval.

## Per-survey retention policy

- `retention_enabled` defaults to `true` and `retention_days` defaults to `1825` days (five
  years). The defaults are present in the backend model and request schemas and are also used by
  the frontend create flows.
- On submission, the server snapshots the policy into the response as
  `retention_expires_at = submission_time + retention_days`. The deadline belongs to that
  response and is immutable; later policy changes never move an existing deadline.
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
- The code is sent with the response submission and is shown once after the minimal submission
  acknowledgement. The browser provides copy support and links to the public `/survey/withdraw`
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
  unknown code. A valid request logically tombstones the response and is safe to repeat; the
  digest is retained only to make that repeat idempotent. Administrative erasure clears it.
- A lost code cannot be recovered by PEII: no response id, distribution token, plaintext code,
  or respondent identity is available to support a recovery lookup. The respondent must retain
  the code after submission.

## Response operations and permissions

Survey response authorization is global capability RBAC, not survey ownership or membership.
Authentication alone is insufficient, and each operation has its own capability:

| Operation | Route | Capability / policy |
| --- | --- | --- |
| Raw page | `GET /api/v1/surveys/{survey_id}/responses/` | `survey_responses.read_raw` |
| Aggregate | `GET /api/v1/surveys/{survey_id}/responses/aggregates` | `survey_responses.read_aggregates` |
| CSV export | `GET /api/v1/surveys/{survey_id}/responses/export` | `survey_responses.export` |
| Erasure | `POST /api/v1/surveys/{survey_id}/responses/erase` | `survey_responses.erase` plus request confirmation and UUID `Idempotency-Key` |

The public routes are deliberately separate from these protected operations:
`GET /api/v1/survey/{token}`, `POST /api/v1/survey/{token}/respond`, and
`POST /api/v1/survey/responses/withdraw`. The frontend withdrawal page is `/survey/withdraw` and
posts directly to the public API; it does not require a survey link or portal login.

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
clears answers, distribution linkage, submission idempotency data, consent version/time/snapshot,
and the withdrawal digest, then retains only the response row's minimal tombstone state. Survey
counts are reconciled in the same transaction. The mutation and its audit entry commit
atomically; an erasure receipt is retained for batch idempotency. A retention purge uses the
same tombstone operation and records a `retention_purge` audit per bounded batch. Retention
purge clears the withdrawal digest; respondent withdrawal temporarily retains that digest so a
repeat code request can safely return the same success.

The purge is an operational command, not an in-process timer:

```bash
# run from backend/
./.venv/bin/python scripts/purge_expired_responses.py --dry-run
./.venv/bin/python scripts/purge_expired_responses.py
```

The command defaults to batches of 100 and supports `--batch-size` and an ISO-8601 `--cutoff`.
Schedule it from a single external managed job at least daily, alert on a non-zero exit or a
missed run, and monitor the printed `purged`, `surveys`, `batches`, and `cutoff` values together
with `retention_purge` audit events. A dry run counts due rows without mutating or auditing them.
The operation locks a survey before bounded response batches and is repeat-safe.

Logical tombstoning does not mean that all traces vanish immediately. Minimal database
tombstones, erasure receipts, and audit records remain by design. Managed database backups and
PITR may contain pre-tombstone answers until the provider's configured backup/PITR retention
window expires; PEII cannot claim that backups are immediately erased. The owner must approve
and record primary retention, backup/PITR retention, provider log retention, withdrawal handling,
and the raw-answer roles before launch.

## Traffic, logs, and launch gate

Production requires `RATE_LIMIT_ENABLED=true`, managed Redis,
`RATE_LIMIT_READ_FAILURE_POLICY=fail_closed`, the server-side
`RATE_LIMIT_KEY_HMAC_SECRET`, the dedicated `WITHDRAWAL_CODE_HMAC_SECRET`, and the documented
fixed-window limits. Non-debug startup requires rate limiting and client-IP buckets. Withdrawal
uses a strict per-client limit before a separate high global circuit breaker; exhausting one
client bucket does not consume the remaining global allowance. Redis outage blocks rate-limited
requests rather than falling back to local memory. Trusted ingress CIDRs must be configured for
forwarded headers, and
`MAX_REQUEST_BODY_BYTES=65536` rejects oversized requests before parsing.

Survey pages use no-store, no-referrer, noindex, nosniff, frame-deny, and
`frame-ancestors 'none'` headers. Provider logs must redact tokenized URL paths, request bodies,
authorization/cookie headers, idempotency keys, withdrawal codes, and respondent identifiers.
Verify those controls and provider retention settings before accepting real responses.

Real respondents remain blocked until rate limiting and Redis fail-closed behavior, the approved
consent and privacy contact, retention and backup/PITR policy, trusted ingress, purge scheduling
and monitoring, provider log redaction, and provider streaming/no-store behavior are all
verified and recorded. Passing application tests alone does not open this gate.
