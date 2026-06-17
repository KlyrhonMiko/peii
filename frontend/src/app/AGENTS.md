# App Router Guidelines

## Scope
This guide covers `src/app/`, which owns app-router layouts, pages, route segments, and `globals.css`.

Follow the more specific guide as needed:
- `admin/AGENTS.md`
- `researcher/AGENTS.md`
- `survey/AGENTS.md`

## Current Responsibilities
- `layout.tsx` defines app-wide metadata, fonts, and top-level providers.
- `page.tsx` is the public landing page.
- `researcher/` contains the researcher portal routes and layout shell.
- `admin/` contains admin routes.
- `survey/` contains alumni survey routes.
- `globals.css` is the single global CSS entrypoint.

## Route Standards
- Default to server components. Add `"use client"` only when the file truly needs hooks, browser APIs, timers, or client-side event handling.
- Keep layouts responsible for shared shells, navigation, and providers for their subtree.
- Keep pages responsible for page composition and route-level content, not reusable widgets.
- Use `next/link` for internal navigation.
- Export metadata from route/layout files when page identity changes.
- Do not move reusable view logic into route files when it belongs in `src/components/`.

## State And Effects
- Avoid mount-only `setState` effects when a render-time or CSS-based solution exists. `react-hooks/set-state-in-effect` is enforced.
- Prefer derived UI state over synchronization effects when possible.
- Keep effect dependencies complete. `react-hooks/exhaustive-deps` is an error.
- Await or intentionally handle promises; floating promises are lint errors.

## Styling
- Keep route-level layout styling in Tailwind utilities.
- Reuse the existing slate, white, and indigo visual language unless the task explicitly calls for a redesign.
- Use `globals.css` for true globals only. Prefer component-local class composition for page-specific styling.
