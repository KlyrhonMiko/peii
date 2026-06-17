# Core Guide

## Purpose
`core/` is for shared backend infrastructure only.

## Put Here
- App settings and environment loading.
- Database engine/session wiring.
- Shared FastAPI dependencies that are genuinely cross-endpoint.
- Global exception and response helpers.
- App-wide bootstrapping pieces that are consumed from `main.py`.

## Do Not Put Here
- Endpoint-specific query parsing such as `UserListQueryParams` dependencies.
- Resource-specific business logic.
- Resource-specific response shaping beyond shared envelope/meta helpers.
- Authentication claims or permission helpers that are not actually wired through real route dependencies yet.

## Current Conventions
- `config.py` owns `BaseSettings` loading from the repo-root `.env` and exposes computed properties like `database_url` and `is_sqlite`.
- `database.py` owns the engine and `get_session()`, and currently imports live models so metadata is registered before table creation and migrations.
- `responses.py` owns the universal response envelope helpers and shared list metadata assembly.
- `handlers.py` translates `AppError`, validation failures, and `IntegrityError` into the shared JSON error shape.
- `deps.py` should only contain dependencies that multiple endpoints can reuse without knowing about one resource.
- Keep shared list meta helpers here, but keep endpoint-specific filter contents outside `core/`.
