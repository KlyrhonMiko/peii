# Utility Guide

## Scope
This guide covers `src/lib/`.

## Current Responsibilities
- `utils.ts` provides `cn()` and `formatDate()`.
- `api.ts` owns the authenticated browser API envelope/error client.
- `public-survey.ts` owns the public survey phase contract, submission payload, private 256-bit
  withdrawal-code generation/request parsing, envelope parsing, and retry-after helpers.
- `users.ts`, `rbac.ts`, and `surveys.ts` own domain types, mapping, and operations. `surveys.ts`
  includes retention-aware survey settings, distribution, aggregate, paginated raw-response,
  streamed export, and erasure operations.
- `auth.ts` owns server-side current-user and permission guards.
- `supabase/` owns the server client and cookie policy.
- `safe-redirect.ts` and `backend-proxy-policy.ts` own navigation and backend endpoint
  security policy. Focused Vitest tests are colocated with these modules.
- `survey-oauth-state.ts` and `supabase/survey-server.ts` own the server-only, flow-bound Google
  survey OAuth state and respondent session boundary. Keep `SURVEY_OAUTH_STATE_KEY` server-only.

## Utility Rules
- Keep `src/lib/` for framework-agnostic helpers and narrowly shared Next.js/frontend
  infrastructure. Retain `server-only` boundaries and never import those modules into
  client components.
- Pure helpers should be deterministic. Data/auth infrastructure may perform explicitly
  bounded fetch, session, cookie, and redirect effects.
- Prefer tiny composable helpers over catch-all utility modules.
- Keep type signatures explicit and reusable.
- Use `unknown` plus narrowing for uncertain external values.
- Do not add route components, route handlers, React hooks, JSX components, or browser
  subscriptions here. Shared routing-security helpers may live here.
- If a helper becomes React-specific, move it to `src/hooks/` or `src/components/`.

## `cn()` Usage
- Use `cn()` for conditional and merged class names.
- Do not manually concatenate Tailwind classes when conditions or user-provided
  `className` values are involved.
- Keep `cn()` as the single class merge helper unless a clear repo-wide need emerges.

## API And Data Helpers
- Keep `api.ts`, `users.ts`, `rbac.ts`, and `surveys.ts` aligned with backend schemas and
  the shared envelope shape.
- Forward the effective capability set to researcher UI; authentication is not sufficient for
  survey operations. Distribution metadata must remain token-free after reload, while create
  and rotate may expose a token only in their one-time secret response.
- Authenticated browser calls use `api.ts` and `/api/backend`. Server-only calls use
  `BACKEND_INTERNAL_URL`; the server-rendered identified survey page may use it for the survey
  GET after Google OAuth, while browser submission uses the focused same-origin
  `/api/survey/[token]` BFF. Public withdrawal remains a direct, code-only `NEXT_PUBLIC_API_URL`
  operation.
