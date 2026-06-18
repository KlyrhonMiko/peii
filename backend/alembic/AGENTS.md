# Alembic Guide

## Purpose
`alembic/` owns migration runtime configuration and the revision tree. It translates
SQLModel metadata changes into database schema changes.

## Command Surface
- Run Alembic commands from `backend/`.
- Apply migrations with `alembic upgrade head`.
- Generate migrations with `alembic revision --autogenerate -m "describe change"`.
- Use the repo-local virtualenv dependencies; do not assume system Alembic is configured.

## Autogenerate-First Rule
- For any `models/` change that alters table shape, generate a migration with
  `alembic revision --autogenerate ...` before hand-editing a new revision.
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
- If an earlier applied migration used the wrong name or shape, add a follow-up revision
  that moves the live schema forward.
- Keep migration files lintable and readable.

## Validation
- Inspect generated migration files before committing.
- Run backend Ruff after migration edits.
- When possible, run `alembic upgrade head` against the intended local database mode.
- Keep model, schema, service/router behavior, tests, and migrations aligned in the same
  feature change.
