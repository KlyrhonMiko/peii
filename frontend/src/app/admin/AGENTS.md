# Admin Route Guidelines

## Scope
This guide covers `src/app/admin/` and its nested admin routes.

## Current Responsibilities
- `users/page.tsx` currently renders the admin portal shell plus a placeholder user-management view.

## Standards
- Keep admin routes aligned with the shared sidebar and shell patterns already used in the app.
- Reuse shared components and providers instead of creating a separate admin-only shell unless the product requirements genuinely diverge.
- When adding real admin features, replace placeholders with typed data models and reusable components rather than expanding a single page file indefinitely.
- Use clear admin-oriented labels, but keep styling consistent with the existing portal surfaces and typography.
- If admin pages gain forms, tables, or dialogs, move reusable pieces into `src/components/` or `src/components/ui/`.
