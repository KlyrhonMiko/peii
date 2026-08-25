# Production Decisions

## Canonical First Release

- The first release has one database baseline: `20260825_v1`.
- `20260825_v1` is applied to a fresh database with
  `./.venv/bin/alembic upgrade head`. The release process does not import or transform an
  existing database.
- Future schema changes are forward revisions after `20260825_v1`.
- The frontend and backend are released independently of the database job, but API replicas
  are promoted only after the single migration job succeeds.

## Deployment Topology

- Frontend: managed Next.js Node.js host, with provider and region recorded before launch.
- Backend: managed Python web service in the same region as the database.
- Database: Supabase PostgreSQL or another managed PostgreSQL provider.
- Authentication: Supabase Auth.
- Rate limiting: managed Redis. Distributed rate limiting is a launch gate.
- Docker Compose is for local development; production uses managed services.

## Global Capability RBAC

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
| `survey_distributions.manage` | Create, list, rotate, and revoke survey distributions. |
| `survey_responses.read_aggregates` | View aggregated survey responses. |
| `survey_responses.read_raw` | View raw survey responses. |
| `survey_responses.export` | Export survey responses. |
| `survey_responses.erase` | Erase survey responses. |

The canonical system-role defaults are:

- `admin`: all 21 catalog capabilities.
- `researcher`: `portal.access`, `ml.models.read`, `ml.sentiment.run`,
  `surveys.read`, `surveys.manage`, `survey_distributions.manage`,
  `survey_responses.read_aggregates`, `survey_responses.read_raw`, and
  `survey_responses.export`.
- `staff`: `portal.access`, `ml.models.read`, `surveys.read`, and
  `survey_responses.read_aggregates`.

Raw reads, long-format export, aggregate reads, distribution management, and erasure remain
separate capabilities. Erasure is an administrator capability by default.

## Survey And Privacy Controls

- Every public distribution has a mandatory explicit expiry.
- Distribution metadata never returns a token. A newly issued or rotated token is returned
  only once.
- Archiving a survey revokes every unrevoked distribution. Restoring a survey leaves it
  inactive; reactivation and a newly issued link are explicit actions.
- Aggregates use conservative `k=5` suppression and support categorical, boolean,
  multiple-choice, scale, ranking, and matrix question types. Exact response counts and
  count-based sorting require raw, export, or erasure capability.
- Selected and all-response erasure is idempotent, requires a UUID idempotency key, clears
  answer and linkage data, and retains only minimal tombstone or receipt state. All-response
  erasure requires an archived survey.
- Responses are pseudonymous, successful respondent IP addresses are not retained, and
  production responses require an explicit consent record.

## Release Validation

Run these checks before release:

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

Run PostgreSQL integration validation against an isolated database with an explicit
`TEST_DATABASE_URL`; a skipped integration test is not a passed validation gate:

```bash
TEST_DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/peii_test \
  env DEBUG=false ./.venv/bin/pytest -q -m integration --require-postgres
```

Rehearse `./.venv/bin/alembic upgrade head` against a disposable fresh database, verify
application health and the RBAC seed, then run a release smoke test before promoting replicas.

## Backup And Rollback

- The database provider must supply automated backups and point-in-time recovery before
  launch.
- Recover by restoring to an isolated database, running the release validation gates, and
  promoting only after schema, RBAC, privacy controls, and application health are verified.
- Roll back application artifacts with managed-host release controls.
- For database incidents, use a validated backup/PITR restore or a reviewed forward fix;
  do not use an ad hoc baseline downgrade.
- Record provider, region, domains, runtime settings, trusted-proxy/TLS policy, account
  owners, backup schedule, and recovery procedure before public launch.
