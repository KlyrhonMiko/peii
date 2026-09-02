# Survey Route Guide

## Scope
This guide covers `src/app/survey/` and dynamic alumni survey route segments.

## Current Responsibilities
- `[alumniToken]/page.tsx` loads the identified, respondent-specific survey phase server-side from FastAPI through
  `BACKEND_INTERNAL_URL` without caching after the dedicated Google OAuth respondent session is
  verified, handles unavailable/empty surveys, and passes the structure to `ClientSurveyForm`.
- `[alumniToken]/loading.tsx` provides the accessible route loading state.
- `withdraw/page.tsx` renders the public withdrawal flow; it does not require a survey token or
  portal authentication.
- The token is a domain input used only for the public API request; never display it in the
  page or in user-facing errors.

## Survey Rules
- Type tokenized route params explicitly and actually use them.
- Prefix intentionally unused params with `_`; unused variables fail lint.
- Keep survey pages focused on the survey flow: instructions, phase state, form fields, validation,
  consent notice, withdrawal-code handoff, and submission actions. Do not make unsupported
  confidentiality or anonymity claims.
- Prefer accessible native controls or shared UI primitives before custom controls.
- If survey logic grows, extract form sections, field groups, validation helpers, and
  submission handling rather than expanding one page indefinitely.
- Keep survey wording user-facing and explicit.

## Forms
- For new or heavily revised forms, prefer shared UI primitives and accessible labels.
- Keep labels associated with controls.
- Use visible validation messaging and `aria-invalid` when fields can fail validation.
- Avoid custom select, slider, or checkbox behavior unless native or existing primitives
  cannot satisfy the interaction.
- Do not collect or display unnecessary sensitive information.

## Client Boundary
- Keep the route server-rendered for survey loading. `ClientSurveyForm` owns section
  navigation, answers, validation, submission/idempotency, client-side 256-bit withdrawal-code
  generation, and success/error states. `WithdrawalForm` posts a saved code to the public
  withdrawal endpoint and must not echo it into URLs or user-facing errors.
- The server-rendered survey GET may use `BACKEND_INTERNAL_URL` directly after Google OAuth; the
  browser uses the focused same-origin `/api/survey/[token]` BFF for Phase 1 POST and Phase 2 PATCH.
  Neither uses the
  authenticated portal `/api/backend` proxy or direct browser `NEXT_PUBLIC_API_URL` calls.
- Public withdrawal posts directly to `${NEXT_PUBLIC_API_URL}/survey/responses/withdraw`; the
  backend stores only the HMAC digest and a lost code cannot be recovered. Withdrawal remains
  code-only and does not require Google OAuth.
