# Survey Route Guide

## Scope
This guide covers `src/app/survey/` and dynamic alumni survey route segments.

## Current Responsibilities
- `[alumniToken]/page.tsx` loads a public survey from `NEXT_PUBLIC_API_URL` without caching,
  handles unavailable/empty surveys, and passes the structure to `ClientSurveyForm`.
- `[alumniToken]/loading.tsx` provides the accessible route loading state.
- The token is currently displayed in the footer and should be treated as a domain input.

## Survey Rules
- Type tokenized route params explicitly and actually use them.
- Prefix intentionally unused params with `_`; unused variables fail lint.
- Keep survey pages focused on the survey flow: instructions, form fields, validation,
  consent/confidentiality copy, and submission actions.
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
  navigation, answers, validation, submission/idempotency, and success/error states.
- Public responses post directly to `${NEXT_PUBLIC_API_URL}/survey/${token}/respond`; they
  do not use the authenticated `/api/backend` proxy.
