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
- Keep ORM statements, business rules, conflict checks, and commits in services. Existing
  direct-query exceptions in RBAC, public-survey, and audit-detail routes are technical debt,
  not examples for new routes.
- Use `core.deps.AsyncDBSession` for database session injection.
- Keep endpoint-specific query dependencies with the resource route unless they are truly
  reusable across resources.
- Register resource routers through `routers/api.py`; do not add ad hoc route mounting in
  `main.py`.
- Prefer explicit status codes for create and other non-default responses.

## Paginated List Endpoint Rules
- Parse query params with FastAPI `Query(...)` so validation and OpenAPI docs stay useful.
- Return a typed query-param schema object to the service.
- Prefer route-level `sort_by` literals aligned with the resource schema and service
  allow-list. Include a business id when the UI exposes it for list search or sorting.
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

## Async & Request ID Handlers
- All new and existing route handlers must be declared as `async def`.
- Always inject `core.deps.AsyncDBSession` (instead of the synchronous `DBSession`) for database operations.
- Extract client details such as `request.client.host` in the router and pass the narrow
  value to services for audit logging.
- Prefer explicit `summary` and `description` fields on endpoint decorators. Current ML
  routes rely on function docstrings.

## Auth Boundary
- Protected routes use `CurrentPrincipal` or `require_permissions(...)` from `core.deps`.
- Survey routes additionally enforce owner/collaborator access in the survey authorization
  layer. Public token routes remain intentionally unauthenticated.
- Frontend guards never replace backend authorization.
