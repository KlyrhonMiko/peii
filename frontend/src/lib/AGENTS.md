# Utility Guidelines

## Scope
This guide covers `src/lib/`.

## Current Responsibilities
- `utils.ts` currently provides the shared `cn()` class name helper.

## Standards
- Keep `src/lib/` for small framework-agnostic helpers and narrowly shared frontend utilities.
- Utilities should stay deterministic and side-effect light.
- Prefer tiny, composable helpers over catch-all utility files.
- If a helper becomes React-specific, move it into `src/hooks/` or `src/components/` depending on responsibility.
- Keep type signatures explicit and reusable.
