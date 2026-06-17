# Tests Guide

## Purpose
`tests/` holds deterministic backend tests.

## Rules
- Keep tests focused on stable backend behavior, not manual smoke scripts.
- `test_*.py` should remain deterministic and safe for normal pytest discovery.
- Cover response contract changes whenever you change `APIResponse`, list meta shape, filtering behavior, or sort behavior.
- Prefer API-level tests through the shared async `httpx` client fixture in `conftest.py` unless a lower-level unit test is the clearest way to lock down behavior.

## What To Assert
- Universal envelope fields: `data`, `message`, `errors`, `meta`.
- For list endpoints, assert `meta.pagination` and `meta.filters`.
- When sorting logic changes, add tie-case coverage so stable ordering is proven, not assumed.
- When persistence transforms happen, assert the stored result too. Current user tests verify Argon2 hashing by opening the overridden test session and reading the row back.
- Keep the in-memory SQLite override pattern in `conftest.py` unless a test truly needs another database behavior.
- Keep tests compatible with the repo hook strategy: `env DEBUG=false ./.venv/bin/pytest -q` runs during both `pre-commit` and `pre-push`.
