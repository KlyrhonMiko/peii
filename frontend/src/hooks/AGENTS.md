# Hook Guide

## Scope
This guide covers `src/hooks/`.

## Current Responsibilities
- `use-mobile.ts` contains the responsive mobile-state hook used by sidebar primitives.

## Hook Rules
- Hook filenames should describe the hook, and exported hook names must start with `use`.
- Keep one clear responsibility per hook.
- Hooks must obey the React Hooks lint set. Do not fight `rules-of-hooks`,
  `exhaustive-deps`, `purity`, or set-state rules.
- Prefer deriving values during render when possible.
- Use effects for real subscriptions, browser synchronization, timers, or external systems.
- Browser APIs such as `matchMedia`, `localStorage`, and event listeners require client
  usage and cleanup.
- Return the smallest stable value callers need.
- Avoid exposing intermediate state when callers only need a boolean or narrow object.

## Performance And Safety
- Use lazy `useState` initialization for expensive initial reads.
- Keep effect dependencies complete and primitive where practical.
- Use functional state updates when next state depends on previous state.
- Avoid module-level mutable state unless it is intentionally shared across the browser
  session and documented in code.
- Do not put data fetching policy here unless the hook is explicitly a shared data hook.
