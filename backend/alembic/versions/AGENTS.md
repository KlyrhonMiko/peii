# Alembic Revisions Guide

## Purpose
`alembic/versions/` stores the committed migration history. Treat these files as the
database change log, not as scratch files.

## Revision Rules
- Add future revisions only for forward changes after the first-release baseline.
- The directory contains the canonical first-release baseline `20260825_v1`, the Phase 2
  compatibility revision `f77a807cf2f9_expand_distribution_security`, the follow-up
  `d1f9bad768ad` expiry compatibility revision, the Phase 3 `fb1c93d15474` retention/withdrawal
  revision, the current `2bf09a6bc738` digest-only distribution-token revision, the
  `d5a4f7c91e2b` Supabase Data API lockdown revision, and this guide.
  `d5a4f7c91e2b` is the current head. Future revisions may follow these revisions, but predecessor
  history must not be reintroduced.
  The lockdown revision requires its migration identity to own every protected table before
  changing privileges or RLS and retains RLS on `alembic_version`; `alembic/env.py` guards later
  migrations with an owner-or-BYPASSRLS and effective CRUD preflight.
- Start model-driven migrations with Alembic autogenerate, then edit only after reviewing
  the generated diff.
- Keep each revision focused on the schema change it represents.
- Keep `revision`, `down_revision`, `branch_labels`, and `depends_on` accurate.
- Keep upgrade and downgrade paths paired for future incremental revisions when practical.

## Safe Change Patterns
- For new non-null fields on existing tables, use a safe transition: add nullable or with
  a temporary default, backfill, then enforce non-null/constraints.
- For new human-readable business id fields, backfill existing rows with unique prefixed
  values before enforcing non-null and unique index constraints.
- For persisted renames after a migration has already been applied, add a follow-up
  rename revision instead of editing the older file.
- For unique fields, think through existing rows before creating the unique index.
- Keep data backfills deterministic and narrow. Avoid broad business logic in migrations.
- Use SQLAlchemy/Alembic operations unless raw SQL is clearer and portable enough for the
  supported database path.
- The Phase 3 backfill uses each response's recorded submission timestamp and the survey's
  enabled/1,825-day policy. Do not activate retention purge until that backfill has been reviewed.
- The `f77a807cf2f9` revision's plaintext-token compatibility behavior is historical. The
  `2bf09a6bc738` revision backfills missing digests/prefixes and removes the plaintext token
  column; it cannot be downgraded to recover those values.

## Consistency Checks
- Confirm the final migration state matches the current SQLModel definitions.
- Confirm schema files and services agree with the migrated database shape.
- Confirm imports and style pass backend Ruff.
- If autogenerate creates noisy or unrelated operations, stop and understand the metadata
  mismatch before committing the revision.
