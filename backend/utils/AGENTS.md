# Utils Guide

## Purpose
`utils/` contains small reusable helpers that are not owned by one route, one resource,
or shared FastAPI infrastructure.

## Belongs Here
- Pure or near-pure helpers with narrow responsibilities.
- Generic utilities that are shared across resource boundaries.
- Reusable identifier primitives such as human-readable business id generation.
- Reusable query helpers that do not know about a specific model or request.

## Does Not Belong Here
- FastAPI dependencies or response-envelope policy. Those belong in `core/`.
- Endpoint-specific query parsing. That belongs in `routers/`.
- Resource-specific filters, conflict checks, or write workflows. Those belong in
  `services/`.
- Helpers that need request context, database sessions, settings branching, or model-
  specific behavior unless they are clearly shared across resources.

## Current Helpers
- `identifiers.py` owns `generate_business_id()`, the shared helper for UI-facing
  resource ids.
- `sorting.py` owns `stable_order_by()`, which applies the primary order plus `id` as a
  deterministic tiebreaker.

## Identifier Helper Rules
- Keep human-readable id generation centralized in `identifiers.py`.
- Keep helpers resource-agnostic. Services choose the prefix for each table.
- Do not put database uniqueness checks, retry loops, or resource-specific prefix policy
  in `utils/` unless the behavior becomes genuinely shared across resources.
- Business ids are UI references, not authorization controls and not replacements for the
  internal UUID primary key.

## Sorting Helper Rules
- Keep `stable_order_by()` generic. Services choose the allowed primary column and pass it in.
- Do not make sorting helpers accept raw client field names.
- Keep tie-breaking deterministic for pagination stability.
