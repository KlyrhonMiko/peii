# Tests Guide

## Purpose
`tests/` holds deterministic backend tests that are safe for normal pytest discovery and
for the repo's pre-commit/pre-push hooks.

## Command
- Run from `backend/`: `env DEBUG=false ./.venv/bin/pytest -q`.
- Keep tests compatible with `pytest.ini`, which discovers `tests/`.
- Use repo-local tools from `./.venv/bin/` in docs and scripts.

## Current Test Harness
- Tests are async and use `pytest.mark.anyio`.
- `conftest.py` starts a local Uvicorn server on an ephemeral localhost port.
- The shared `client` fixture uses `httpx.AsyncClient` against the running app.
- `conftest.py` overrides `core.database.get_session()` with an in-memory SQLite
  SQLModel engine using `StaticPool`.
- `SQLModel.metadata.create_all(engine)` is used for test tables, so new models must be
  registered in metadata imports before tests can see them.
- Dependency overrides are cleared after each client fixture.

## Test Rules
- Prefer API-level tests through the shared `client` fixture for route behavior, response
  envelopes, filtering, sorting, and persistence workflows.
- Use lower-level service or utility tests only when they isolate behavior more clearly
  than an API test.
- Keep tests deterministic. Do not depend on an external Postgres, Supabase project,
  network service, clock-sensitive sleeps, or test order.
- Use unique emails, usernames, or ids inside tests to avoid accidental cross-test coupling.
- Keep manual smoke scripts out of `tests/`; pytest files should be automated assertions.

## What To Assert
- For every API response contract change, assert the universal envelope fields:
  `data`, `message`, `errors`, and `meta`.
- For generated business ids, assert that create responses expose the expected prefixed
  shape, client payloads do not control the value, and list search/sort behavior includes
  the field when the endpoint supports it.
- For list endpoints, assert both `meta.pagination` and `meta.filters`.
- For filters, assert both returned rows and metadata echo.
- For sorting changes, include tie-case coverage proving the stable `id` tiebreaker.
- For soft delete and restore, assert default hiding, `include_deleted`, state fields,
  and restored visibility.
- For expected domain failures, assert the status code and shared error shape.
- For persistence transforms, assert the stored value when it matters. Current user tests
  read the row through the overridden session to verify Argon2 hashing.

## Fixture & Database Override Rules
- `conftest.py` overrides both sync `get_session` and async `get_async_session` with an in-memory SQLite database (`aiosqlite`).
- If a test needs direct database inspection, use the overridden `get_async_session` generator. Call `await anext(session_generator)` to resolve the session and `await session_generator.aclose()` in a `finally` block to close it.
- Always assert that the `meta` dict in any response contains a valid `request_id` trace string.
- Assert database side effects—such as the creation of audit logs on mutations—by executing queries against the active database.
- Keep server startup and teardown in `conftest.py`; individual tests should not start their own app server.

