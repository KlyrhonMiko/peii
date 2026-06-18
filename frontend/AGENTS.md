# Frontend Guide

## Scope
This directory is a Next.js 16 app using React 19, TypeScript 5, Tailwind CSS 4,
and shadcn-style source components backed by Base UI primitives.

Read this file first, then the guide closest to the files you are changing:

- `src/app/AGENTS.md`
- `src/app/admin/AGENTS.md`
- `src/app/researcher/AGENTS.md`
- `src/app/survey/AGENTS.md`
- `src/components/AGENTS.md`
- `src/components/ui/AGENTS.md`
- `src/hooks/AGENTS.md`
- `src/lib/AGENTS.md`

## Current Structure
- `src/app/` owns App Router layouts, pages, route segments, metadata, and
  `globals.css`.
- `src/components/` owns product-level reusable UI: sidebar, chart wrappers, and charts.
- `src/components/ui/` owns generic shadcn-style primitives.
- `src/hooks/` owns reusable React hooks.
- `src/lib/` owns small shared utilities such as `cn()`.
- `public/` contains static assets served directly by Next.js.

## Command Surface
Run frontend commands from `frontend/`:

- `npm install` installs dependencies.
- `npm run dev` starts the local Next.js dev server.
- `npm run lint` runs `eslint . --max-warnings=0`; warnings fail the command.
- `npm run build` runs the production Next.js build.
- `npm run start` serves a production build.

The repo-level `.pre-commit-config.yaml` runs frontend lint and build on
`pre-commit`, and frontend build again on `pre-push`.

## Validation
- Before committing frontend changes, run `npm run lint` and `npm run build`.
- If you changed routing, navigation, charts, browser-only behavior, or responsive layout,
  also verify the affected screen in a browser.
- If lint or TypeScript rules are hardened, fix the newly exposed issues in the same
  change instead of leaving the tree red.
- Do not weaken ESLint or TypeScript settings to land a feature unless the rule is
  demonstrably wrong for this repo and the config change explains why.

## Stack Contracts
- `package.json` declares Next 16.2, React 19.2, Tailwind 4, Recharts, Base UI,
  lucide icons, and shadcn.
- `components.json` uses `style: "base-nova"`, `rsc: true`, Tailwind v4 CSS variables,
  Base UI composition, and lucide as the icon library.
- Internal imports should use the configured `@/*` alias.
- `src/app/globals.css` is the Tailwind v4 and shadcn theme entrypoint. Do not create
  another global theme file.
- `next.config.ts` is intentionally minimal. Keep framework-level config changes explicit
  and easy to justify.

## TypeScript Standards
The frontend is intentionally strict. Preserve these compiler guarantees:

- `strict`
- `exactOptionalPropertyTypes`
- `noUncheckedIndexedAccess`
- `noImplicitOverride`
- `noFallthroughCasesInSwitch`
- `forceConsistentCasingInFileNames`

Practical rules:

- Do not introduce `any`; `@typescript-eslint/no-explicit-any` is an error.
- Use `unknown` plus narrowing when external data shape is uncertain.
- Use `import type` for type-only imports.
- Do not add `@ts-ignore`.
- Use `@ts-expect-error` only with a meaningful description and only when the type
  mismatch is intentional.
- Avoid unnecessary assertions. Prefer correcting the source type.

## ESLint Policy
The app extends `eslint-config-next/core-web-vitals` and
`eslint-config-next/typescript`, then adds project-owned rules in `eslint.config.mjs`.

Important enforced areas:

- React and React Hooks correctness, including complete dependencies.
- Next.js App Router correctness.
- Type-aware TypeScript checks through `parserOptions.projectService`.
- `no-floating-promises`, `no-misused-promises`, `no-explicit-any`,
  `consistent-type-imports`, and unused-variable enforcement.
- Unused `eslint-disable` directives are errors.

If a rule appears absent from `eslint.config.mjs`, inspect the effective Next config
before assuming it is not active.

## Architecture
- Prefer server components by default.
- Add `"use client"` only when hooks, browser APIs, event handlers, timers, or client-only
  libraries require it.
- Keep route files focused on route composition, page-level content, and metadata.
- Move reusable product UI into `src/components/`.
- Keep generic primitives in `src/components/ui/`.
- Keep reusable hooks in `src/hooks/` and framework-agnostic helpers in `src/lib/`.
- When a route and component share data, define a concrete type instead of duplicating
  inline object shapes.
- For independent async work, start requests in parallel rather than creating waterfalls.
- Keep client component props small and serializable; avoid passing duplicate large data
  through multiple client boundaries.

## UI And Styling
- Preserve the current PEII product feel unless the task is explicitly a redesign:
  compact operational screens, light surfaces, subtle borders, and restrained
  slate/indigo accents.
- New or heavily touched UI should prefer existing `src/components/ui/` primitives before
  custom markup.
- Use built-in component variants before overriding colors or typography with `className`.
- Use semantic tokens such as `bg-background`, `text-foreground`, `text-muted-foreground`,
  `border-border`, and PEII theme tokens from `globals.css` when practical.
- Use `cn()` for conditional classes.
- Prefer `gap-*` over `space-x-*` or `space-y-*` in new code.
- Prefer `size-*` over matching `w-* h-*`.
- Use `truncate` instead of manually combining overflow utilities.
- Use lucide icons because `components.json` sets `"iconLibrary": "lucide"`.
- Icons inside buttons should use `data-icon="inline-start"` or `data-icon="inline-end"`
  and should not add manual sizing classes.

## Navigation And Browser APIs
- Use `next/link` for internal navigation in route/page code.
- Base UI primitives use `render={...}` for custom rendered elements; do not assume Radix
  `asChild` APIs.
- Browser-only APIs belong in client components or hooks with cleanup.
- Keep mount-only state effects out of components when render-time derivation or CSS can
  solve the problem.

## Docs Drift
- Keep guide text aligned with live files. If commands, TypeScript settings, lint rules,
  aliases, theme files, or shadcn configuration change, update the relevant `AGENTS.md`
  file in the same change.
