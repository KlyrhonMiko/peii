# Alembic Guide

## Purpose
`alembic/` owns migration runtime configuration and the revision tree. It translates
SQLModel metadata changes into database schema changes.

## Command Surface
- Run Alembic commands from `backend/`.
- Apply migrations with `./.venv/bin/alembic upgrade head`.
- Generate migrations with
  `./.venv/bin/alembic revision --autogenerate -m "describe change"`.
- Use the repo-local virtualenv dependencies; do not assume system Alembic is configured.
- The canonical first-release baseline is `20260825_v1`; the forward revisions are
  `f77a807cf2f9_expand_distribution_security`, `d1f9bad768ad`, the Phase 3
  `fb1c93d15474` retention/withdrawal revision, `2bf09a6bc738`, and the
  `d5a4f7c91e2b` Supabase Data API lockdown revision, and
  `a8055c9859f5` Google survey respondent identity/auth-proof revision.
  `a8055c9859f5` is the current migration head.
  That revision requires the migration identity to own every protected table before changing
  privileges or RLS, retains RLS on `alembic_version`, and `env.py` preflights owner-or-BYPASSRLS
  access plus effective CRUD privileges on that table for later migrations.
  Fresh environments run `./.venv/bin/alembic upgrade head`, and production runs that command
  once as the protected release job before API replicas are promoted.

## Autogenerate-First Rule
- For any `models/` change that alters table shape, generate a migration with
  `./.venv/bin/alembic revision --autogenerate ...` before hand-editing a new revision.
- Review the generated operations against the intended model diff.
- Make manual edits only after review, and keep them narrow: data backfills, safe
  nullability transitions, naming fixes, or dialect-specific adjustments.
- Do not hand-write a fresh migration first for model changes.

## `env.py` Rules
- Keep `env.py` loading the repo-root `.env`.
- Keep it resolving the URL through `core.config.settings.database_url`.
- Keep `target_metadata = SQLModel.metadata`.
- Import every live model needed for metadata registration before autogenerate runs.
- Keep `compare_type=True` and `compare_server_default=True` unless there is a documented
  reason to change migration detection.
- Avoid application startup side effects in Alembic imports. Metadata registration should
  be enough.

## Revision Tree Rules
- Revisions live in `alembic/versions/`.
- Add new revisions for new schema changes. Do not rewrite older shared or applied
  revision files.
- The first-release baseline intentionally replaces all predecessor history. Future schema
  changes should be added as forward revisions after `20260825_v1`.
- The Phase 2 expand revision historically retained plaintext distribution tokens for
  compatibility. The reviewed `2bf09a6bc738` forward revision is the digest-only/drop gate: it
  reconciles existing digests and prefixes, makes the digest non-null, and drops the plaintext
  column. Its downgrade is intentionally irreversible.
- The database expiry column remains nullable for compatibility with historical rows, but current
  distribution create/rotate runtime behavior applies the configured default when expiry is
  omitted (currently 30 days) and rejects explicit expiry beyond the configured maximum (currently
  30 days).
- The Phase 3 revision adds per-survey retention settings, response deadline snapshots,
  withdrawal-code digests, and their indexes/constraint. It backfills existing surveys to
  enabled/1,825 days and existing response deadlines from submission timestamps. Review this
  backfill before activating the externally scheduled retention purge.
- If an earlier applied migration used the wrong name or shape, add a follow-up revision
  that moves the live schema forward.
- Keep migration files lintable and readable.

## Validation
- Inspect generated migration files before committing.
- Run backend Ruff after migration edits.
- When possible, run `./.venv/bin/alembic upgrade head` against a fresh disposable database.
- Keep model, schema, service/router behavior, tests, and migrations aligned in the same
  feature change.
