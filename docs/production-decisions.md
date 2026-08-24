# Production Decisions

## Deployment Topology

- Frontend: managed Next.js Node.js host, provider and region to be selected before launch.
- Backend: managed Python web service, provider and region to be selected before launch.
- Database: Supabase PostgreSQL or another managed PostgreSQL provider in the same region as the backend.
- Authentication: Supabase Auth.
- Rate limiting: managed Redis. Redis-backed rate limiting is a required follow-up implementation before public launch.
- Docker deployment is out of scope. Compose remains for local development only.

## Release Procedure

1. Build and deploy the frontend and backend application releases.
2. Run `./.venv/bin/alembic upgrade head` once as the protected backend release job.
3. Start or promote API replicas only after the migration job succeeds.
4. Roll back application releases through the managed-host release controls. Do not roll back database migrations without a reviewed, explicit downgrade or restore procedure.

## Backup And Recovery

- The database provider must provide automated backups and point-in-time recovery before launch.
- Recovery is performed by restoring to an isolated database, validating the required revision and application health, then promoting according to the provider's documented procedure.
- Production domains, runtime versions, provider account owners, and regional placement must be filled in here before the first release.

## Public Surface

- Distribution expiry is mandatory.
- Archiving a survey revokes all unrevoked distribution links.
- Restored surveys are inactive and require explicit reactivation and a newly issued link.
- Surveys are a shared workspace for authenticated portal users; accounts have no survey ownership-transfer requirement.
- API documentation exposure, trusted-proxy configuration, and TLS/host-header policy must be explicitly approved during host setup.
