# Routers Guide

## Purpose
`routers/` owns FastAPI route wiring: URL paths, HTTP methods, dependencies, query
parsing, status codes, response models, and response assembly.

## Current Pattern
- `routers/api.py` builds the versioned API router and includes resource routers.
- `main.py` includes only `api_router` under `settings.API_V1_PREFIX`.
- Resource modules define their own `APIRouter`.
- Routes return `APIResponse[...]` and declare `response_model=APIResponse[...]`.
- Routes call service functions for data access and business behavior.

## Router Rules
- Keep routers thin. They should parse HTTP input, call services, convert models to read
  schemas, and return the shared response envelope.
- Do not build ORM statements, apply business rules, check uniqueness, hash passwords,
  or commit sessions in routers.
- Use `core.deps.DBSession` for database session injection.
- Keep endpoint-specific query dependencies with the resource route unless they are truly
  reusable across resources.
- Register resource routers through `routers/api.py`; do not add ad hoc route mounting in
  `main.py`.
- Prefer explicit status codes for create and other non-default responses.

## List Endpoint Rules
- Parse query params with FastAPI `Query(...)` so validation and OpenAPI docs stay useful.
- Return a typed query-param schema object to the service.
- Keep route-level `sort_by` literals aligned with the resource schema and service
  allow-list. Include the resource business id when the UI exposes it for list search or
  sorting.
- Normalize small HTTP-facing values here when appropriate, such as trimming search text.
- Do not compute total counts in routers. Services should return rows plus filtered total.
- Build list metadata with `list_meta_response()` using the same query-param schema passed
  to the service.
- Preserve both `meta.pagination` and `meta.filters`.

## Response Rules
- Use `success_response()` for successful routes.
- Let `AppError`, validation errors, and integrity errors flow to global handlers instead
  of manually returning one-off error dictionaries.
- Convert SQLModel instances to read schemas before returning when the read schema controls
  field visibility.
- Keep route messages stable when tests assert them.

## Auth Boundary
- No route-level authentication or authorization dependency is currently wired.
- Do not imply an endpoint is protected unless the route depends on a real auth/current-user
  dependency and tests cover the behavior.
- When auth arrives, enforce it through route dependencies and document the dependency path.
