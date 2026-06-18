# UI Primitive Guide

## Scope
This guide covers `src/components/ui/`, the generic component primitive layer.

## Current Responsibilities
- This directory holds shadcn-style primitives: `button`, `card`, `input`, `separator`,
  `sheet`, `sidebar`, `skeleton`, and `tooltip`.
- The project uses `components.json` with `style: "base-nova"`, Base UI primitives,
  Tailwind v4 CSS variables, and lucide icons.

## Primitive Rules
- Keep primitives generic and reusable.
- Product-specific copy, routes, data labels, and business semantics belong in
  `src/components/` or `src/app/`.
- Preserve `data-slot` attributes; local styling relies on them.
- Use `cn()` for class merging and conditional classes.
- Use `cva` for variant-driven styling when a primitive has meaningful variants.
- Prefer props, variants, and composition over duplicating near-identical primitives.
- Keep accessibility behavior intact when changing focus management, keyboard handling,
  ARIA attributes, portals, dialogs, sheets, or tooltips.

## Base UI Composition
- This project uses Base UI, not Radix.
- Use Base UI `render={...}` patterns for custom rendered elements. Do not assume
  `asChild` exists.
- When `render` changes a button-like primitive to a non-button element, preserve correct
  Base UI button semantics.
- Keep render-prop and slot surfaces typed.
- Sheet/Dialog-style overlays must include accessible titles. Use `sr-only` only when the
  title should be visually hidden.

## Styling Rules
- Use semantic tokens such as `bg-background`, `bg-card`, `text-foreground`,
  `text-muted-foreground`, `border-border`, `ring-ring`, and sidebar tokens.
- Use built-in variants before overriding colors or typography through `className`.
- Use `gap-*` rather than `space-x-*` or `space-y-*` in new primitive code.
- Use `size-*` when width and height are equal.
- Use `truncate` instead of hand-written overflow/truncation combinations.
- Avoid manual dark-mode color overrides; use CSS variables and semantic tokens.
- Avoid manual z-index on overlay consumers. If primitive internals need stacking, keep it
  centralized in the primitive.

## Icons And Loading States
- Use lucide icons unless `components.json` changes.
- Icons inside `Button` should use `data-icon="inline-start"` or
  `data-icon="inline-end"`.
- Do not add manual icon sizing inside buttons or other primitives unless a component API
  explicitly requires it.
- `Button` has no `isLoading` or `isPending` prop. Compose disabled state, a loading
  indicator when available, and text instead.

## Updates
- When adding or updating shadcn components, use the shadcn CLI workflow rather than
  copying raw registry files manually.
- Review generated files after adding them; registry output can still need alias,
  composition, or icon-library fixes.
- Do not overwrite locally customized primitives without explicit approval.
