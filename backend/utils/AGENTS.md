# Utils Guide

## Purpose
`utils/` is for small shared helpers that are not tied to one resource or one HTTP route.

## Put Here
- Reusable helpers like password hashing or stable list ordering.
- Pure helpers with narrow responsibilities.

## Do Not Put Here
- Endpoint-specific filter parsing.
- Response envelope policy that belongs in `core/`.
- One-off helpers that are only used by a single route and make more sense near that route or service.

## Current Conventions
- `security.py` owns password hashing helpers.
- `sorting.py` owns stable secondary ordering using `id` as the shared tiebreaker for sorted list endpoints.
- Keep helpers narrow and reusable. If a helper needs request context, DB access, or resource-specific branching, it probably belongs in `routers/`, `services/`, or `core/` instead.
