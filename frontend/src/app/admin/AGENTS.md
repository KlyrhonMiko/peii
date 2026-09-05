# Admin Route Guide

## Scope
This guide covers `src/app/admin/` and nested admin routes.

## Current Responsibilities
- `layout.tsx` owns the authenticated admin shell while composing shared portal chrome.
- `users/page.tsx` requires `users.read` and renders live listing, invitation, profile,
  status, role, session, deletion, and restoration workflows.
- `roles/page.tsx` requires `roles.read` and renders role, permission, and status
  management. User-role assignment remains in the user-management workflow.
- `audit-logs/page.tsx` requires `audit_logs.read` and renders the read-only append-only
  audit trail with resource/action/request-id filters and pagination.

## Admin Rules
- Keep admin pages aligned with the shared portal chrome unless requirements clearly
  diverge.
- Keep live tables, filters, forms, and dialogs in the existing management components under
  `src/components/` rather than growing route files.
- Keep typed admin models and backend response-envelope mapping in `src/lib/`.
- Keep role/access wording explicit and operational.
- Use shared UI primitives for buttons, cards, inputs, sheets, skeletons, and separators.
- For destructive or permission-sensitive admin actions, require explicit confirmation UI
  and clear status messaging.

## Data And API Contracts
- Keep frontend user/admin types aligned with backend schemas.
- Admin routes authenticate through `requirePortalUser()`. Pages request `users.read`,
  `roles.read`, or `audit_logs.read`, and action availability derives from the returned
  permission set.
- Frontend checks improve UX but do not replace backend permission enforcement.

## Styling
- Keep admin screens dense, scannable, and work-focused.
- Preserve the existing light surfaces, subtle borders, and compact typography.
- Preserve loading/error states, explicit confirmations, permission-aware actions, and
  pagination/filter behavior when changing live admin data flows.
