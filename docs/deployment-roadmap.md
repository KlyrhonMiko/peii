# Deployment Roadmap

Status: the canonical first-release implementation is complete as of 2026-08-25. Public
launch remains gated by the deferred infrastructure, consent, retention, and provider
decisions below.

## First-Release Baseline

- The database starts from one fresh baseline, `20260825_v1`.
- Run `./.venv/bin/alembic upgrade head` once as the protected release job. Promote API
  replicas only after that job succeeds.
- Future database changes are forward revisions after `20260825_v1`.
- Supabase authentication, local identity linkage, global capability RBAC, audit logging,
  survey authoring, public response submission, and the ML portal are included.
- Compose remains the local development path; production uses managed services.

## Capability And Privacy Controls

Survey authorization is global capability RBAC: a permitted principal can operate on any survey
in the shared workspace, with every operation gated by its explicit capability.

- The survey capabilities are `surveys.read`, `surveys.manage`,
  `survey_distributions.manage`, `survey_responses.read_aggregates`,
  `survey_responses.read_raw`, `survey_responses.export`, and `survey_responses.erase`.
- Exact survey defaults are: `admin` all seven; `researcher` all except
  `survey_responses.erase`; and `staff` `surveys.read` plus
  `survey_responses.read_aggregates`. Portal and ML defaults remain: `portal.access`,
  `ml.models.read`, and `ml.sentiment.run` for researcher; `portal.access` and
  `ml.models.read` for staff; admin receives the complete catalog.
- Every public distribution has mandatory explicit expiry. Metadata is token-free, and issue
  or rotation returns a token only once.
- Archiving revokes unrevoked distributions; restoration leaves a survey inactive.
- Aggregates use `k=5` suppression for supported categorical, boolean, multiple-choice, scale,
  ranking, and matrix types. Exact response counts and count sorting require raw, export, or
  erasure capability; raw reads and long-format export remain separate capabilities.
- Selected and all-response erasure is idempotent, uses a UUID idempotency key, clears answer
  and linkage data, and retains minimal tombstone or receipt state. All-response erasure
  requires an archived survey.

## Validation Gates

Run the normal gates before release:

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

The normal backend suite skips integration tests when `TEST_DATABASE_URL` is absent. Run
PostgreSQL integration validation against an isolated database explicitly:

```bash
TEST_DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/peii_test \
  env DEBUG=false ./.venv/bin/pytest -q -m integration --require-postgres
```

Do not report the PostgreSQL integration gate as passed when `TEST_DATABASE_URL` is absent;
the normal suite's skip is not integration validation. Rehearse the baseline migration against
a disposable fresh database, verify application health and the RBAC seed, and complete an
end-to-end release smoke test before promotion.

## Backup, Recovery, And Rollback

- Automated backups and point-in-time recovery are required from the database provider.
- Restore to an isolated database, run the validation gates, and promote only after schema,
  RBAC, privacy controls, and application health are verified.
- Use managed-host controls to roll back application artifacts.
- For database incidents, use a validated backup/PITR restore or a reviewed forward fix; do
  not use an ad hoc baseline downgrade.

## Deferred Before Public Launch

- Implement managed Redis-backed distributed rate limiting.
- Persist and enforce an explicit consent record before accepting production responses.
- Approve response retention duration, withdrawal handling, and raw-answer authorization in
  the production runbook.
- Select and document providers, regions, domains, runtime configuration, trusted-proxy/TLS
  policy, account owners, automated backups, and PITR recovery procedures.
