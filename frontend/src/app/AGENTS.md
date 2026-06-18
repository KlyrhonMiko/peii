# App Router Guide

## Scope
This guide covers `src/app/`: App Router layouts, pages, route segments, metadata, and
`globals.css`.

Follow the route-area guide when editing a nested route:

- `admin/AGENTS.md`
- `researcher/AGENTS.md`
- `survey/AGENTS.md`

## Current Responsibilities
- `layout.tsx` defines app-wide metadata, fonts, and the top-level `TooltipProvider`.
- `page.tsx` is the public PEII landing page.
- `researcher/` contains the researcher portal layout and analytics routes.
- `admin/` contains admin routes.
- `survey/` contains tokenized alumni survey routes.
- `globals.css` is the Tailwind v4 and shadcn theme entrypoint.

## Route Rules
- Default route files to server components.
- Add `"use client"` only for hooks, browser APIs, timers, event handlers, or client-only
  libraries.
- Keep layouts responsible for subtree shells, navigation, and providers.
- Keep pages responsible for page composition and route-level content.
- Move reusable widgets, charts, navigation pieces, and display helpers to
  `src/components/`.
- Use `next/link` for internal navigation unless a Base UI `render={...}` escape hatch is
  required by a primitive.
- Export route metadata when title, description, or page identity changes.
- Keep route params typed and used. Prefix intentionally unused params with `_`.

## Server And Client Boundaries
- Do not move an entire route to the client just because one widget needs interactivity.
- Isolate client-only libraries behind small client components, as chart wrappers do with
  `next/dynamic(..., { ssr: false })`.
- Keep server routes from importing Recharts directly.
- Keep client component props narrow and serializable.
- Start independent async work in parallel when adding data loading.

## State And Effects
- Avoid mount-only `setState` effects when render-time derivation or CSS is enough.
- Prefer derived UI state over synchronization effects.
- Keep effect dependencies complete; `react-hooks/exhaustive-deps` is an error.
- Await promises or intentionally handle them. Floating promises fail lint.
- Browser subscriptions must clean up after themselves.

## Styling
- Keep route-level layout styling in Tailwind utilities.
- Use `globals.css` only for true globals, theme tokens, and Tailwind/shadcn setup.
- Prefer component-local class composition for page-specific styling.
- Preserve the existing compact light PEII portal style unless the task is a redesign.
- When adding forms or repeated surfaces, prefer shared UI primitives over raw markup.
