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
- `researcher/` contains authenticated dashboard, analytics, survey, and model routes.
- `admin/` contains authenticated, permission-gated user, role, and audit-log management routes.
- `survey/` contains Google-authenticated tokenized alumni survey routes, loading UI, and the
  public `/survey/withdraw` response-withdrawal page.
- `login/`, `forgot-password/`, `reset-password/`, and `auth/confirm/` implement Supabase
  authentication and recovery flows.
- `api/backend/[...path]/` is the authenticated, allowlisted backend proxy.
- `access-denied/` handles authorization failures; `dev/sentiment-test/` is a development
  utility that 404s in production builds (the interactivity lives in
  `src/components/SentimentTest.tsx`).
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
- Keep authentication mutations in server actions and validate redirect destinations with
  `safeInternalPath()`.
- Keep backend and Supabase secrets server-only. Authenticated browser backend calls should
  use `/api/backend`; unsafe proxy methods require an exact application-origin match.
- The server-rendered survey page may fetch the survey GET from FastAPI through
  `BACKEND_INTERNAL_URL` after isolated Google authentication; browser submission uses the
  focused same-origin `/api/survey/[token]` BFF and requires backend proof. The portal remains
  password/invite/recovery based and rejects OAuth sessions. Public withdrawal remains a direct
  code-only operation.
- The global `src/proxy.ts` matcher excludes `/api`, so the BFF owns Supabase session lookup.
  It bounds request bodies at 65,536 bytes with a 15-second body deadline, waits up to 15
  seconds only for upstream response headers, propagates client cancellation, performs no
  retries, and marks locally generated errors `no-store`. Keep the canonical operational
  detail in `docs/production-decisions.md` and `docs/deployment-roadmap.md`.

## Server And Client Boundaries
- Do not move an entire route to the client just because one widget needs interactivity.
- Isolate client-only libraries behind small client components, as chart wrappers do with
  `next/dynamic(..., { ssr: false })`.
- Keep server routes from importing Recharts directly.
- Keep client component props narrow and serializable.
- Start independent async work in parallel when adding data loading.
- `researcher/survey/page.tsx` composes the extracted `SurveyManagement` client component and
  passes its capability set; keep route data/loading and interactive product UI separated.

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
