# Privacy And Retention

## Phase 2 response contract

Responses are pseudonymous: the application stores answers and distribution association, not a
respondent account. A public distribution is a shared bearer link. It does not establish a
person's identity or guarantee one response per person; the idempotency key only makes retries
safe for one distribution/key pair. Do not promise confidentiality or respondent anonymity.

## Consent and immutable evidence

- The public consent policy is one server-owned, global, versioned contract across surveys.
  `GET /survey/{token}` publishes its current version, notice, purpose, retention statement,
  and contact.
- A production submission must include `accepted=true` and the current consent version. A
  stale version is rejected, so a respondent must reload and review the current contract.
- Each accepted response records `consent_version`, `consented_at`, and an immutable
  `consent_notice_snapshot` containing the full contract at submission. Later configuration
  changes do not rewrite that snapshot. Erasure clears the snapshot with answers and linkage.
- The public acknowledgement contains no response id, token, answers, or consent text: its data
  is exactly `{"accepted": true}`. Replays with the same idempotency key return the same minimal
  acknowledgement.

The production runbook must contain the approved notice text, purpose, retention duration, and
withdrawal/privacy contact. Placeholder values in local configuration are not approval.

## Token and audit handling

- New and reconciled distribution rows store a SHA-256 digest and an 8-character display prefix.
  The digest is the first lookup path; listings never return the token and issue/rotation
  returns plaintext only once.
- The Phase 2 compatibility migration backfills these fields but deliberately retains the
  plaintext token. The required sequence is **expand -> dual-write/digest-first -> reconcile ->
  digest-only app -> later contract/drop gate**. Plaintext removal is a later reviewed migration,
  not a completed Phase 2 action.
- Successful respondent IP addresses are excluded from public-response audit events. Redis may
  temporarily use HMAC-digested IP identifiers for rate limiting; administrative audit events
  may retain their own actor/request context.
- Public-response audit changes are sanitized to exclude answers, token values, idempotency
  material, and consent notice content.

## Distribution and retention lifecycle

- Every distribution has an explicit expiry. Archiving revokes unrevoked links; restoring a
  survey leaves it inactive until explicitly reactivated and redistributed.
- Aggregate access uses `k=5` suppression and separate capability checks for aggregate, raw,
  export, and erasure access. CSV exports are private/no-store and capped at 10,000 responses.
- Selected and all-response erasure requires a UUID idempotency key. It clears answers,
  distribution linkage, idempotency data, consent version/time/snapshot, and marks the response
  erased. A minimal erasure receipt/tombstone is retained. All-response erasure requires an
  archived survey and an expected-count match.
- The data owner must approve and record the response retention duration, withdrawal handling,
  raw-answer roles, backup/PITR retention, and provider log retention before launch.

## Traffic and logging safeguards

Production requires `RATE_LIMIT_ENABLED=true`, managed Redis, `RATE_LIMIT_READ_FAILURE_POLICY=fail_closed`,
the server-side `RATE_LIMIT_KEY_HMAC_SECRET`, and the documented fixed-window limits. Redis
outage therefore blocks rate-limited requests rather than falling back to local memory. The
ingress must be trusted and its actual CIDRs configured for `X-Forwarded-For`; untrusted or
malformed forwarding headers are ignored. Keep `RATE_LIMIT_INCLUDE_CLIENT_IP=false` unless the
complete forwarding chain is verified; enable it only after confirming the app-owned resolver's
peer and header chain. `MAX_REQUEST_BODY_BYTES=65536` rejects oversized requests before parsing.

Survey pages use no-store, no-referrer, noindex, nosniff, frame-deny, and frame-ancestors-none
headers. Provider logs must redact tokenized URL paths, request bodies, authorization/cookie
headers, idempotency keys, and respondent identifiers. Verify this behavior and the provider's
retention settings before accepting real responses.

## Launch gate

Real respondents remain blocked until all of the following are verified and recorded: rate
limiting enabled, Redis connectivity and fail-closed outage behavior, approved consent
text/contact/retention, trusted ingress configuration, and provider log redaction. Passing code
tests alone does not open this gate.
