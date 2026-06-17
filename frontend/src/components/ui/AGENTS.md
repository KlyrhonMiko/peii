# UI Primitive Guidelines

## Scope
This guide covers `src/components/ui/`, which contains reusable building blocks derived from or aligned with shadcn/ui patterns.

## Current Responsibilities
- This directory holds primitives such as `button`, `card`, `input`, `separator`, `sheet`, `sidebar`, `skeleton`, and `tooltip`.

## Standards
- Keep primitives generic and reusable. Product-specific copy, routes, and business semantics belong in `src/components/` or `src/app/`.
- Preserve existing shadcn-style composition patterns and alias usage from `components.json`.
- Prefer extending primitives via props, variants, and composition instead of duplicating near-identical components.
- Keep accessibility behavior intact when changing focus management, keyboard handling, aria attributes, or portals.
- When a primitive exposes render props or slot APIs, keep those surfaces typed and documented by the code.
- Avoid coupling primitives to a single page or route.
