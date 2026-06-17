# Alembic Revisions Guide

## Purpose
`alembic/versions/` stores committed migration revisions.

## Rules
- Add new revision files; do not rewrite old revisions that may already be shared or applied.
- Start each new migration with autogenerate, then make narrow manual fixes only when required.
- Keep revision files focused on the exact schema change they represent.
- If model, schema, and service behavior changed together, make sure the migration still matches the final model state before commit.
- When autogenerate leaves transitional nullable fields or temporary defaults, make the smallest manual fix needed in the new revision rather than retrofitting older revisions.
