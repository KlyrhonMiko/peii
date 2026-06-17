# Alembic Guide

## Purpose
`alembic/` owns migration runtime config and revision history.

## Rules
- Keep environment wiring and metadata registration aligned with the live models package.
- Do not use this directory as a place for manual schema experiments.
- Migration generation still starts from model changes with `alembic revision --autogenerate ...`.
- `env.py` should continue to load the repo-root `.env`, resolve `settings.database_url`, and import the live models needed for `SQLModel.metadata`.

## Validation
- Review generated migration diffs carefully before committing.
- Keep migration imports and formatting clean enough to pass the repo's backend linting rules.
