# Alembic Revisions Guide

## Purpose
`alembic/versions/` stores the committed migration history. Treat these files as the
database change log, not as scratch files.

## Revision Rules
- Add a new revision for each new schema change.
- Do not rewrite older shared or already-applied revisions.
- Start model-driven migrations with Alembic autogenerate, then edit only after reviewing
  the generated diff.
- Keep each revision focused on the schema change it represents.
- Keep `revision`, `down_revision`, `branch_labels`, and `depends_on` accurate.
- Keep upgrade and downgrade paths paired when practical.

## Safe Change Patterns
- For new non-null fields on existing tables, use a safe transition: add nullable or with
  a temporary default, backfill, then enforce non-null/constraints.
- For persisted renames after a migration has already been applied, add a follow-up
  rename revision instead of editing the older file.
- For unique fields, think through existing rows before creating the unique index.
- Keep data backfills deterministic and narrow. Avoid broad business logic in migrations.
- Use SQLAlchemy/Alembic operations unless raw SQL is clearer and portable enough for the
  supported database path.

## Consistency Checks
- Confirm the final migration state matches the current SQLModel definitions.
- Confirm schema files and services agree with the migrated database shape.
- Confirm imports and style pass backend Ruff.
- If autogenerate creates noisy or unrelated operations, stop and understand the metadata
  mismatch before committing the revision.
