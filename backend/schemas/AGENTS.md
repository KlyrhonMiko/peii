# Schemas Guide

## Purpose
`schemas/` owns request/response shapes and typed query-param models.

## Shared Vs Specific
- Keep truly shared schemas in `common.py`.
- Keep resource-specific list/query schemas in the resource module, for example `UserListQueryParams` in `user.py`.
- Do not move endpoint-specific filters into `common.py` just because they live under `meta.filters`.
- Use `ConfigDict(from_attributes=True)` on read-oriented schemas when they are populated directly from SQLModel instances.

## Response Contracts
- Preserve `APIResponse` as the universal top-level envelope.
- Keep shared list response metadata types in `common.py`, including shared pagination structure.
- The `filters` slot in list metadata is shared structurally, but its field set is resource-specific.
- Exclude sensitive fields from read schemas. Current user reads deliberately omit the stored password hash column.

## Query Params
- Shared list params belong in `ListQueryParams`.
- Audit-style shared query params can exist, but only expose them from routes that actually need them.
- Resource-specific `sort_by` literals should stay tight to the resource schema so the allowed values are explicit in both validation and docs.
