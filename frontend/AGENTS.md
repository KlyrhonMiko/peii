# Frontend Guidelines

## Scope And Entry Point
This directory is a Next.js 16 app using React 19, TypeScript 5, Tailwind CSS 4, and shadcn/ui primitives. Start here, then follow the deeper guide for the area you are editing:
- `src/app/AGENTS.md`
- `src/app/admin/AGENTS.md`
- `src/app/researcher/AGENTS.md`
- `src/app/survey/AGENTS.md`
- `src/components/AGENTS.md`
- `src/components/ui/AGENTS.md`
- `src/hooks/AGENTS.md`
- `src/lib/AGENTS.md`

Read the relevant Next.js docs under `node_modules/next/dist/docs/` before relying on older Next conventions. The app-router structure and APIs may differ from older training data.

## Current Structure
- `src/app/` contains app-router layouts, pages, and global CSS.
- `src/components/` contains product-level UI such as charts and the shared sidebar.
- `src/components/ui/` contains reusable shadcn-style primitives and layout helpers.
- `src/hooks/` contains reusable React hooks.
- `src/lib/` contains small shared utilities such as class name merging helpers.
- `public/` contains static assets served as-is.

## Commands
Run all frontend commands from `frontend/`:
- `npm install` installs dependencies.
- `npm run dev` starts the Next.js dev server.
- `npm run lint` runs `eslint . --max-warnings=0` and must pass cleanly.
- `npm run build` runs the production build and must pass before commit.
- `npm run start` serves the production build.

## Pre-Commit And Validation
The repo-level `.pre-commit-config.yaml` runs these frontend checks:
- `pre-commit`: `cd frontend && npm run lint`
- `pre-commit`: `cd frontend && npm run build`
- `pre-push`: `cd frontend && npm run build`

Before committing frontend work, run at least:
- `npm run lint`
- `npm run build`

If you changed route behavior, navigation flow, chart rendering, or responsive layout, validate those paths in the browser as well.

## TypeScript Standards
The frontend is intentionally strict. Keep these compiler guarantees intact:
- `strict`
- `exactOptionalPropertyTypes`
- `noUncheckedIndexedAccess`
- `noImplicitOverride`
- `noFallthroughCasesInSwitch`
- `forceConsistentCasingInFileNames`

Practical rules:
- Prefer explicit domain types over `any`. `@typescript-eslint/no-explicit-any` is enforced as an error.
- Prefer `unknown` plus narrowing when the shape is uncertain.
- Prefer `import type` for type-only imports.
- Do not add `@ts-ignore`. `@ts-expect-error` is only acceptable with a meaningful description.
- Avoid unnecessary type assertions. Fix the source type instead of forcing a cast when possible.

## ESLint Policy
The app extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`, then adds stricter project-owned rules in `eslint.config.mjs`.

Current enforced rule families include:
- React correctness rules such as `react/jsx-key`, `react/no-string-refs`, and `react/no-deprecated`
- React Hooks rules including `rules-of-hooks`, `exhaustive-deps`, `set-state-in-effect`, `set-state-in-render`, `immutability`, and `purity`
- Next.js app rules such as `@next/next/no-html-link-for-pages`, `@next/next/no-sync-scripts`, and `@next/next/inline-script-id`
- TypeScript ESLint rules such as `no-explicit-any`, `no-floating-promises`, `no-misused-promises`, `consistent-type-imports`, `no-unused-vars`, and `no-unnecessary-type-assertion`
- Accessibility warnings from `jsx-a11y`

Project-owned strict rules currently set to error:
- `@typescript-eslint/ban-ts-comment`
- `@typescript-eslint/consistent-type-imports`
- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-floating-promises`
- `@typescript-eslint/no-misused-promises`
- `@typescript-eslint/no-unnecessary-type-assertion`
- `@typescript-eslint/no-unused-expressions`
- `@typescript-eslint/no-unused-vars`
- `react-hooks/exhaustive-deps`
- unused `eslint-disable` directives

Do not weaken lint rules to get a change through unless the rule is demonstrably wrong for this codebase and the change is documented in the config itself.

## Architecture And Coding Standards
- Use the `@/*` alias for internal imports.
- Keep route files focused on route composition, metadata, and page-level layout.
- Move reusable display logic into `src/components/`.
- Keep reusable primitives in `src/components/ui/` rather than duplicating wrappers across pages.
- Keep hooks in `src/hooks/` and utilities in `src/lib/`.
- Prefer server components by default. Add `"use client"` only when hooks, browser APIs, or client-only interactivity require it.
- When a route and a shared component need the same data shape, declare a concrete type instead of duplicating inline object literals in multiple places.
- Preserve the current visual language unless the task is explicitly a redesign: compact spacing, slate/indigo palette, card surfaces, and Tailwind utility-first styling.
- Use `next/link` for internal navigation instead of raw anchors, unless a third-party component requires a render prop escape hatch.

## Styling Strategy
- Tailwind CSS 4 is the primary styling system.
- `src/app/globals.css` is the global stylesheet entrypoint.
- The shadcn configuration in `components.json` uses aliases for `components`, `ui`, `hooks`, `lib`, and `utils`; keep new generated primitives aligned with those aliases.
- Reuse existing spacing, border, and text patterns before inventing a new visual system.
- Prefer composition with existing `ui` primitives for buttons, inputs, tooltips, sheets, cards, and sidebars.

## Change Strategy
- Make lint-clean, build-clean changes. The pre-commit hooks are strict enough that partial compliance is not useful.
- If you harden lint or TypeScript rules, expect follow-up cleanup in the affected files rather than leaving the tree red.
- Keep docs aligned with the live config. If frontend commands or lint rules change, update the relevant AGENTS guide in the same change.
