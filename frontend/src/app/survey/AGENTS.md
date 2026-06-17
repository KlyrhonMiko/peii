# Survey Route Guidelines

## Scope
This guide covers `src/app/survey/` and dynamic alumni survey route segments.

## Current Responsibilities
- `[alumniToken]/page.tsx` renders the survey card UI for an alumni token route.

## Standards
- Treat tokenized route params as domain inputs. Type them explicitly and actually use them; unused params now fail lint unless intentionally prefixed with `_`.
- Keep survey pages focused on the survey flow itself: instructions, form controls, validation messaging, and submission actions.
- Prefer accessible native form controls or shared UI primitives over custom control implementations unless the custom interaction is necessary.
- If survey logic grows beyond a single page, extract form sections, field groups, and shared validation helpers rather than growing the route file monolithically.
- Keep survey wording and confidentiality copy explicit and user-facing.
