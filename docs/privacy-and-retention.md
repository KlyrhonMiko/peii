# Privacy And Retention

## Canonical First-Release Policy

The first release uses the single `20260825_v1` baseline on a fresh database. Privacy and
retention behavior below is part of that canonical application contract; production launch
also requires the deferred consent and retention decisions to be recorded in the runbook.

## Response Handling

- Responses are pseudonymous: the application stores answer data and distribution association,
  not a respondent account.
- Successful respondent IP addresses are not retained. Managed Redis may hold an IP address
  temporarily for rate limiting when that launch capability is enabled.
- Survey authorization uses global capability RBAC. A permitted principal can act on any survey
  in the shared workspace, and each operation requires its explicit capability.
- The seven survey capabilities are `surveys.read`, `surveys.manage`,
  `survey_distributions.manage`, `survey_responses.read_aggregates`,
  `survey_responses.read_raw`, `survey_responses.export`, and `survey_responses.erase`.
  The defaults are exact: `admin` receives all seven; `researcher` receives all except
  `survey_responses.erase`; `staff` receives `surveys.read` and
  `survey_responses.read_aggregates`. The existing portal and ML capabilities remain in the
  `admin`, `researcher`, and `staff` defaults described in the production decisions.
- Aggregate responses use conservative `k=5` suppression. Supported types are categorical,
  boolean, multiple-choice, scale, ranking, and matrix; unsupported types are omitted. Exact
  response counts and count-based sorting require raw, export, or erasure capability. Users with
  aggregate-only access receive no count below the threshold.
- Raw reads, long-format CSV export, aggregate reads, and erasure are separately permissioned.
  CSV export is capped at 10,000 responses, audited, marked private/no-store, and escapes
  spreadsheet formula prefixes.

## Distribution Privacy

- Every public distribution has a mandatory explicit expiry.
- Distribution metadata never returns tokens. A newly issued or rotated token is returned only
  once.
- Archiving a survey revokes all unrevoked public links. Restoration leaves the survey inactive;
  reactivation and a newly issued link are explicit actions.

## Consent And Retention

- An explicit consent record is required before accepting a production response. Persisting and
  enforcing that record is a launch gate.
- The data owner must approve the response retention duration, withdrawal contact, and roles
  authorized for raw-answer access before launch; record those decisions in the production
  runbook.
- Survey archival is recoverable state management. Response erasure is a separate
  administrator-default capability, not a consequence of archival.

## Erasure

- Selected and all-response requests clear answer and linkage data and retain only minimal
  tombstone or receipt state.
- Erasure requires a UUID idempotency key. Repeating the same request is safe and idempotent.
- All-response erasure requires an archived survey and an expected-count match.
- Erasure operations are audited without retaining erased answer content.
