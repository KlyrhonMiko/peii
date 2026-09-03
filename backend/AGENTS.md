# Backend Guide

## Scope
This file applies to all of `backend/`. Directory-local guides add stricter rules for their
own area:

- `core/AGENTS.md`
- `models/AGENTS.md`
- `schemas/AGENTS.md`
- `routers/AGENTS.md`
- `services/AGENTS.md`
- `utils/AGENTS.md`
- `tests/AGENTS.md`
- `alembic/AGENTS.md`
- `alembic/versions/AGENTS.md`

Read this file first, then the guide closest to the files you are changing.

## Command Surface
- Run backend commands from `backend/` unless a command explicitly says otherwise.
- Use the repo-local virtualenv: `python3.14 -m venv .venv` and
  `./.venv/bin/pip install -r requirements.txt`.
- Start the API with `./.venv/bin/uvicorn main:app --reload --no-access-log --no-proxy-headers`.
- Apply migrations with `./.venv/bin/alembic upgrade head`.
- Run the backend validation gate with:
  - `./.venv/bin/ruff check .`
  - `./.venv/bin/mypy .`
  - `env DEBUG=false ./.venv/bin/pytest -q`
- PostgreSQL integration tests are marked `integration` and skip when
  `TEST_DATABASE_URL` is absent. Run them explicitly with
  `TEST_DATABASE_URL=postgresql+psycopg2://... env DEBUG=false ./.venv/bin/pytest -q --require-postgres`.
- The committed config is Python 3.14-oriented: `ruff.toml` targets `py314`, `mypy.ini`
  uses `python_version = 3.14`, and the Docker image is `python:3.14-slim`.
- No tracked pre-commit configuration currently runs these checks automatically.

### Runtime Configuration
- `core/config.py` loads the repo-root `.env` with Pydantic settings. Core application settings
  fail fast when missing; traffic-security and public-policy settings have local-safe defaults,
  but production must explicitly set the required Redis, rate-limit, trusted-proxy, request-size,
  Google survey respondent-auth, and approved consent values documented in
  `docs/production-decisions.md`.
- Keep `.env.example` aligned whenever backend config keys, modes, or expected formats change.
- Database selection is environment-driven:
  - `DB_MODE=local` uses `LOCAL_DATABASE_URL`.
  - `DB_MODE=supabase` uses `SUPABASE_DATABASE_URL`.
- Async URLs convert `postgresql+psycopg2://` to `postgresql+asyncpg://` and `sqlite://`
  to `sqlite+aiosqlite://`. Other URL schemes pass through unchanged.
- Converted PostgreSQL URLs disable prepared-statement caching. Non-SQLite async engines
  also receive asyncpg cache/name connection arguments in `core/database.py`.
- `SQL_ECHO` controls SQLAlchemy logging; keep normal development output quiet unless debugging SQL specifically.
- `LOG_JSON` controls whether structured logs are formatted as JSON lines (for production aggregators) or colored console logs (for local development).
- `RATE_LIMIT_INCLUDE_CLIENT_IP` may be false only in debug/local environments. Non-debug rate
  limiting requires it to be true; verify the complete trusted forwarding chain before
  production startup.
- In production Supabase mode (`DEBUG=false`, `DB_MODE=supabase`), startup requires
  `RATE_LIMIT_READ_FAILURE_POLICY=fail_closed`, a nonempty list of valid `TRUSTED_PROXY_CIDRS`,
  and either a secure HTTPS Upstash REST URL/token pair or a `rediss://` Redis URL. The CIDRs
  must be the verified immediate proxy networks; broad RFC1918 ranges are not production-ready.
- Google respondent authentication uses `GOOGLE_OAUTH_CLIENT_ID`, the dedicated
  `SURVEY_RESPONDENT_HMAC_SECRET` (random, at least 32 bytes, stable for survey lifetimes),
  `SURVEY_GOOGLE_SESSION_MAX_AGE_SECONDS` (default 300, production maximum 3,600), and
  `GOOGLE_SURVEY_ATTEST_RATE_LIMIT=5` with `GOOGLE_SURVEY_ATTEST_RATE_WINDOW_SECONDS=60`.
- `CSV_EXPORT_ENABLED` is a server-side release flag. Keep it false for the initial online
  deployment; enabling export also requires the existing `survey_responses.export` capability.
- `BACKEND_CORS_ORIGINS` is parsed as a list by settings. Keep examples valid for Pydantic.

## Architecture
- `main.py` wires the FastAPI app, CORS, exception handlers, the versioned router from `routers/api.py`, and the ASGI `RequestIdMiddleware`.
- In `DEBUG=true`, the root URL `/` redirects visitors to `/api/v1/docs`; with
  `DEBUG=false`, production documentation and the root route are absent.
- `/api/v1/health` is a liveness-only endpoint. A successful health response does not establish
  dependency readiness or verify the production ingress forwarding chain.
- Keep route registration centralized in `routers/api.py`; do not mount feature routers directly from `main.py`.
- Keep routers thin: parse HTTP input, depend on shared async dependencies, call services,
  and assemble the shared response envelope. Endpoint handlers are `async def`.
- Keep ORM queries, transactions, conflict checks, business rules, soft-delete behavior, and persistence transforms in `services/`.
- Keep SQLModel table definitions and field-level persistence constraints in `models/`.
- Keep request, response, and query-param shapes in `schemas/`.
- Keep shared infrastructure in `core/`:
  - `context.py` defines thread-safe request ID context variables.
  - `logging.py` sets up `structlog` with automated request ID injection.
  - `middleware.py` defines the ASGI request tracing propagator.
- Only put a helper in `utils/` when it is genuinely reusable outside one resource.
- Prefer explicit typed schemas and return models over ad hoc dictionaries at API boundaries.

## API Contract
- Preserve the response envelope for successful routes and handled application,
  validation, and integrity failures: `data`, `message`, `errors`, `meta`.
- Successful responses should go through `core.responses.success_response()`.
- Expected app failures should raise `core.exceptions.AppError` so `core.handlers` can render the shared error envelope.
- Validation failures and SQL integrity failures are handled globally in `core/handlers.py`; do not reimplement those shapes per route.
- A UUIDv7 request ID is generated when absent. A caller-supplied `X-Request-ID` is
  propagated verbatim and is not validated for shape or uniqueness.
- Paginated list responses use `core.responses.list_meta_response()` and include:
  - `meta.pagination`: shared pagination fields.
  - `meta.filters`: the endpoint-specific filters that were applied.
- Keep `meta.filters` structurally present for paginated list endpoints even when
  individual filter values are `None`. Non-paginated collections return the standard
  success envelope without pagination metadata.

## Data And Persistence
- `models/base_model.py` provides `TimestampedUUIDModel` and `BaseModel` with UUIDv7 ids,
  timestamps, soft-delete fields, and `performed_by`. `AuditLog` uses its own direct
  `SQLModel` shape.
- Add a generated human-readable business id to top-level user-facing resources when the
  product needs one. Association and internal tables generally use UUIDs/natural keys.
- All resource mutations (create, update, delete, restore, reorder, revoke, or compound writes) must use `commit_with_audit` in `services.audit_service` so the resource change and its audit entry commit atomically.
- Timezone handling: Base helper `utc_now` must strip timezone info (`tzinfo=None`) when writing to `TIMESTAMP WITHOUT TIME ZONE` postgres columns to prevent `asyncpg` validation failures.
- Persistence uses explicit SQLModel asynchronous queries (`await session.exec(statement)`).
- New models must be exported from `models/__init__.py` and imported by metadata wiring such as `core/database.py` and `alembic/env.py` so tests, table creation, and Alembic autogenerate see them.
- Treat `include_deleted` as query behavior. It is not authorization.
- User passwords are managed by Supabase Auth and are not persisted in the local `users`
  table. User create/update schemas reject local password fields.

## Human-Readable Business IDs
- Use `utils.identifiers.generate_business_id(prefix)` for UI-facing ids.
- Name the persisted field after the resource, for example `user_id`, not `business_id`, when that is the clearest API contract for the table.
- Business id columns should be unique, indexed, non-null after migration backfill, and long enough for the configured prefix plus random suffix.
- Generate business ids in services during create flows. Do not accept them from create or update request payloads unless a feature explicitly requires an imported external id.
- Expose business ids from read schemas when the frontend needs a stable human-readable reference.
- Include business ids in list search and `sort_by` allow-lists when the UI displays or filters by them.
- Do not use business ids as a substitute for authorization or as proof that a record is safe to access.

## Filtering And Sorting
- Shared list query fields live in `schemas/common.py` and `core/deps.py` only when they are truly cross-resource.
- Resource-specific query parsing stays with the resource route, as `routers/users.py` does with `get_user_list_query_params()`.
- Resource-specific filter/query schemas stay in the owning schema module.
- Each service must map allowed `sort_by` values to ORM columns explicitly.
- Never pass raw client field names into ORM ordering.
- Use `utils.sorting.stable_order_by()` for sorted lists so ties fall back to `id`.

## Authentication Boundary
- `core.auth` verifies Supabase bearer JWTs through JWKS and issuer/audience checks.
- `core.deps.CurrentPrincipal` resolves the local user and effective roles/permissions.
  Resolving a principal requires `portal.access`; fine-grained capabilities are still checked
  per route with `require_permissions(...)`.
- Use `require_permissions(...)` for capability-gated routes. Survey access is global RBAC:
  authentication alone is not authorization. Survey authorization is global RBAC. Keep
  `surveys.read`, `surveys.manage`, aggregate reads, raw reads,
  identity reads, export, and erase as separate capabilities. The Google-authenticated survey
  GET and submit flow requires a dedicated respondent session and backend proof; the portal
  remains password/invite/recovery based and rejects OAuth sessions. Public withdrawal remains
  direct and code-only.
- Phase 3 response routes live in `routers/survey_public.py`, `routers/survey_responses.py`, and
  `routers/survey_analytics.py`; retention and export behavior belongs to the corresponding
  services. `scripts/purge_expired_responses.py` is an externally scheduled operational command,
  not an application timer.
- Password login, recovery, invitation, logout, and password changes delegate to Supabase;
  never persist or log credentials or tokens locally.
- User role assignment is capability-safe: an actor cannot grant a role whose permissions exceed
  the actor's effective permissions, and the protected system Admin role may be assigned only by
  an active Admin.

## Migrations
- For every `models/` change that alters table shape, run
  `./.venv/bin/alembic revision --autogenerate -m "describe change"` first.
- Review the generated diff before making manual edits. Manual edits should be narrow and explainable from the model change, data backfill, or database limitation.
- When adding a required business id to an existing table, use a safe migration sequence: add nullable, backfill existing rows with unique prefixed values, alter to non-null, then add the unique index.
- Add a new revision for new schema work. Do not rewrite older shared or applied revisions.
- The database uses the canonical first-release baseline `20260825_v1`, followed by
  `f77a807cf2f9_expand_distribution_security`, `d1f9bad768ad`, the Phase 3 `fb1c93d15474`
  revision, `2bf09a6bc738`, `d5a4f7c91e2b`, `a8055c9859f5`, `b9055c9859f6`, `f88b9c1d0000`,
  `3aad20b0fc8a`, `b0d864b9935b`, and `a6c42481a0d9`. `a6c42481a0d9` is the current migration head. Fresh environments
  must run `./.venv/bin/alembic upgrade head`; production runs it once as the protected release
  job before API replicas are promoted.
- Historically, the `f77a807cf2f9` compatibility revision added SHA-256 token digests and
  8-character prefixes while retaining plaintext distribution tokens, and `d1f9bad768ad` made
  the database expiry column nullable. The `2bf09a6bc738` contract revision backfilled
  and required digests, then dropped the plaintext token column; it was irreversible because
  plaintext tokens cannot be reconstructed.
- The distribution table and its runtime contract were removed in `f88b9c1d0000`, which drops
  `survey_distributions` and `survey_responses.distribution_id` and replaces the response
  idempotency unique with the survey-scoped `uq_survey_responses_survey_idempotency(survey_id,
  idempotency_key)`. Its downgrade is a no-op `pass`, so it cannot restore the dropped
  distribution feature.
- The `d5a4f7c91e2b` revision enables RLS and removes effective public/anon/authenticated/
  service-role table and column access and schema creation for protected application tables.
  It requires the migration identity to own all protected tables before making any changes,
  retains RLS on `alembic_version`, and has an Alembic preflight that verifies later migration
  identities retain owner-or-BYPASSRLS access plus effective CRUD privileges. It is policy-free,
  validates its ACL/RLS postconditions, and has a fail-closed irreversible downgrade. Production
  must verify this lockdown during the one-time release migration.
- The `a8055c9859f5` revision adds short-lived Google survey auth proofs, nullable
  legacy-compatible response identity snapshots, survey-scoped dedupe uniqueness, and
  `survey_responses.read_identity`, with proof-table ACL/RLS lockdown. Admin and the default
  researcher receive identity permission; staff does not. Raw, aggregate, and CSV contracts
  remain identity-free, and the identity endpoint requires both raw and identity permission.
- `b9055c9859f6` adds `is_template`; `f88b9c1d0000` drops `survey_distributions` and
  `survey_responses.distribution_id`; `3aad20b0fc8a`/`b0d864b9935b`/`a6c42481a0d9` add
  `ml_sentiments`, `false_positive_feedbacks`, and `polarity_override`.
- Keep model, schema, service/router contract, tests, and migration files in sync when one feature touches all of them.

## Testing Standards
- Tests live under `tests/` and are discovered by `pytest.ini`.
- API tests are predominantly async/AnyIO and use an `httpx.AsyncClient` against the
  running Uvicorn server thread; focused unit/static tests may be synchronous.
- `tests/conftest.py` overrides `get_session()` (sync) and `get_async_session()` (async) with in-memory SQLite database setups; keep this deterministic pattern unless a test specifically needs another database.
- Assert that API response bodies contain `meta.request_id`.
- Verify database state and side effects (like audit logs) using direct async session queries.
- Cover response-envelope changes, list metadata, filtering, sorting, soft delete/restore,
  conflict behavior, Supabase identity linkage, permissions, and audit side effects.
- When adding a business id to a resource, cover creation, read-schema exposure, prefix shape, search/sort behavior when applicable, and the fact that create/update payloads do not control the generated value.
