# Routers Guide

## Purpose
`routers/` owns HTTP wiring, query parsing, and response assembly.

## Rules
- Keep routers thin. Parse request state here, then delegate data work and business rules to `services/`.
- Endpoint-specific query-param dependencies should live here or in a resource-local helper module, not in `core/deps.py`.
- Return the shared `APIResponse` envelope for both success and failure paths.
- Register resource routers through `routers/api.py` under `settings.API_V1_PREFIX` rather than mounting ad hoc routers from `main.py`.

## List Endpoints
- Use shared list meta structure: `meta.pagination` and `meta.filters`.
- Build `meta.filters` from the endpoint's query-param schema.
- Do not compute total counts in routers; call services that return enough information for pagination.
- Normalize lightweight request shaping here when it is HTTP-facing, for example trimming an optional search query before it reaches the service.

## Auth Boundary
- Do not imply route-level permission enforcement exists unless a real auth dependency is wired on the route.
- If auth is added later, document and enforce it per route dependency instead of relying on comments or response messaging.
