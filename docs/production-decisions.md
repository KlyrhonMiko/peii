# Production Decisions

## Deployment Topology

- Frontend: managed Next.js Node.js host, provider and region to be selected before launch.
- Backend: managed Python web service, provider and region to be selected before launch.
- Database: Supabase PostgreSQL or another managed PostgreSQL provider in the same region as the backend.
- Authentication: Supabase Auth.
- Rate limiting: managed Redis. Redis-backed rate limiting is a required follow-up implementation before public launch.
- Docker deployment is out of scope. Compose remains for local development only.
- Managed Redis rate limiting is not part of the completed Phase 1A implementation.

## Access And Survey Semantics

- Survey access is global RBAC. Authentication establishes the principal; it does not grant
  unrestricted access, and surveys have no ownership or membership model.
- The seven survey capabilities are `surveys.read`, `surveys.manage`,
  `survey_distributions.manage`, `survey_responses.read_aggregates`,
  `survey_responses.read_raw`, `survey_responses.export`, and `survey_responses.erase`.
  The default survey grants are: admin all seven; researcher all except erase; staff
  `surveys.read` and `survey_responses.read_aggregates`. Existing portal and ML grants remain.
  Raw and export are separate permissions; erase is admin-default.
- Deleting a survey is recoverable archive: it revokes every unrevoked distribution. Restore
  leaves the survey inactive. Distribution metadata is token-free, expiry is explicit, and an
  issued or rotated token is returned only once.
- Aggregates use conservative `k=5` suppression for supported categorical, boolean,
  multiple-choice, scale, ranking, and matrix types. Raw reads, CSV export, and erasure are
  separately guarded. Selected and all-scope erasure use minimal tombstones and idempotency;
  all-scope erasure requires the survey to be archived.

Mutations that can contend across response lifecycles follow one lock order: survey, then
distributions ordered by UUID, then responses ordered by UUID.

## Release Procedure

1. Build and deploy the frontend and backend application releases.
2. Run `./.venv/bin/alembic upgrade head` once as the protected backend release job. The
   current head is `20260825_0001` (after `20260825_0002`).
3. Start or promote API replicas only after the migration job succeeds.
4. Roll back application releases through the managed-host release controls. Do not roll back
   database migrations with an ad hoc downgrade: the `81568591615f` collaboration downgrade
   is unusable. Use a reviewed forward-fix or a validated backup/PITR restore, and do not
   rewrite older collaboration migrations.

For a legacy database, run `./.venv/bin/python scripts/bridge_collaboration_upgrade.py` from
`backend/` as a dry run first. The supported starting revision is `5b37d61c76ff`. Unknown
legacy roles require a role-mapping JSON file; apply only with `--apply --confirm-backup`
after a verified backup/PITR point. The JSON report can contain null `auth_user_id` values;
reconcile those identities with Supabase Auth before enabling migrated users.

## Backup And Recovery

- The database provider must provide automated backups and point-in-time recovery before launch.
- Recovery is performed by restoring to an isolated database, validating the required revision and application health, then promoting according to the provider's documented procedure.
- Production domains, runtime versions, provider account owners, and regional placement must be filled in here before the first release.

## Public Surface

- Distribution expiry is mandatory.
- Archiving a survey revokes all unrevoked distribution links.
- Restored surveys are inactive and require explicit reactivation and a newly issued link.
- Survey workspace scope is global RBAC, not authentication-only access or ownership transfer.
- API documentation exposure, trusted-proxy configuration, and TLS/host-header policy must be explicitly approved during host setup.
