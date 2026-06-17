# Hook Guidelines

## Scope
This guide covers `src/hooks/`.

## Current Responsibilities
- `use-mobile.ts` contains the responsive mobile-state hook.

## Standards
- Hooks must obey the full React Hooks lint set; do not fight `rules-of-hooks`, `exhaustive-deps`, `purity`, or `set-state-in-effect`.
- Name hooks with the `use` prefix and export a single, concrete responsibility per hook.
- Prefer deriving values during render when possible; use effects only for subscriptions and real browser synchronization.
- When reading browser APIs such as `matchMedia`, keep setup and cleanup symmetrical.
- Return stable, minimal values from hooks. Avoid exposing unnecessary intermediate state if callers only need a boolean or a narrow object.
