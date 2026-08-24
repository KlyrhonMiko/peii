# Privacy And Retention

## Response Handling

- Responses are pseudonymous: the application stores answer data and distribution association, not a respondent account.
- Successful respondent IP addresses are not retained.
- IP addresses may be held temporarily by managed Redis only for rate limiting when that capability is implemented.
- Survey access is global capability-based RBAC, not unrestricted authentication and not
  ownership or membership. The default survey capabilities are: admin all seven; researcher
  all except `survey_responses.erase`; staff `surveys.read` and
  `survey_responses.read_aggregates`. Existing portal and ML capabilities remain. Raw reads,
  CSV export, and erasure are separately permissioned; erase is admin-default.
- Aggregate responses use conservative `k=5` suppression. Only single-choice, boolean,
  multiple-choice, scale, ranking, and matrix question types are aggregated; unsupported
  types are omitted. Raw response reads remain available only through the raw capability.
- CSV export is long-format, capped at 10,000 responses, audited, marked private/no-store,
  and escapes spreadsheet formula prefixes. Distribution metadata never returns tokens; an
  issued or rotated token is returned only once and every distribution has an explicit expiry.

## Consent And Retention

- A versioned, explicit consent record is required before accepting a production response. Persisting and enforcing this record is a required follow-up implementation before public launch.
- Response retention duration, withdrawal contact, and authorized roles for raw-answer access must be approved by the data owner before launch and recorded in the production runbook.
- Survey deletion is recoverable archival, not permanent erasure. Archival revokes public
  distribution links; restoration leaves the survey inactive.
- Response erasure is a separate admin-default capability. Selected and all-scope requests
  clear answer and linkage data, retain only minimal tombstone/audit state, and require a UUID
  idempotency key. Replays with the same request are safe; all-scope erasure requires an
  archived survey and an expected-count match.
