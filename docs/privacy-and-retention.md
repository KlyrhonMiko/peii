# Privacy And Retention

## Response Handling

- Responses are pseudonymous: the application stores answer data and distribution association, not a respondent account.
- Successful respondent IP addresses are not retained.
- IP addresses may be held temporarily by managed Redis only for rate limiting when that capability is implemented.
- Researchers receive aggregate access by default. Raw-response access remains separately permissioned.

## Consent And Retention

- A versioned, explicit consent record is required before accepting a production response. Persisting and enforcing this record is a required follow-up implementation before public launch.
- Response retention duration, withdrawal contact, and authorized roles for raw-answer access must be approved by the data owner before launch and recorded in the production runbook.
- Survey deletion is recoverable archival, not permanent erasure. Archival revokes public distribution links; restoration leaves the survey inactive.
