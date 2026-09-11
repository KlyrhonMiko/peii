# PEII Test Plan

## Status and purpose

**Status: Planned — not yet run.** This is a practical plan for checking PEII before a release.
It uses the eight quality areas in ISO/IEC 25010:2011 as a guide. It is **not** an ISO
certification for PEII, its team, or any service provider.

PEII is a web system for alumni-employability research. Staff manage surveys and view approved research information; invited respondents complete a consent-based survey. Administrators manage users, roles, and audit records. The system uses a web frontend, an API, PostgreSQL, Redis, and selected sign-in and storage providers.

## What this plan covers

We will test:

- Portal sign-in, sign-out, invitation, recovery, and access based on a person's role.
- Survey creation and normal, non-ML researcher dashboards and aggregates.
- The public survey: Google-based respondent sign-in, consent, its two stages, safe repeat submission, and withdrawal.
- Access to aggregate, raw, and identity data; exports; retention; erasure; and audit logs.
- User and role administration, including prevention of role escalation.
- API responses, health and readiness, PostgreSQL/RLS/migrations, Redis limits/cache, deployment, browsers, accessibility, load, recovery, and provider checks.

We will **not** test or accept:

- Broken or inconsistent ML endpoints, the model catalog, or sentiment-derived analytics.
- Placeholder researcher survey-detail and survey-settings pages.
- The development sentiment page, except to confirm `/dev/sentiment-test` is hidden in production.
- Respondent file uploads. The interface must not imply that an upload succeeded.
- Internal workings of Supabase, Google, managed PostgreSQL/Redis, hosting, email, storage, or ML providers. We check PEII's connection to them and visible outcomes only.

## Who tests

- **Ordinary end users** use test accounts and complete realistic tasks: signing in, reading consent, completing a survey, withdrawing a response, and using permitted staff screens.
- **IT experts** check security, APIs, data, permissions, speed, recovery, providers, and deployment with isolated test systems and synthetic data.
- **Test owner and product/privacy owner** agree the scope, data-handling choices, targets, risks, and final decision.

## How testing works

Start with automated checks, then test real user journeys in a browser. IT experts also send valid and invalid API requests, check the resulting data and audit records, and run controlled database, Redis, failure, recovery, and load checks. Test both the normal result and the safe result when something is missing, invalid, unavailable, or not permitted.

Use only synthetic accounts and survey answers. Keep screenshots, sanitized responses, request IDs, audit entries, and test notes. Never include passwords, tokens, email addresses, withdrawal codes, signed links, exports, or other secrets in evidence.

Before testing, the team must agree the supported browsers/devices and the performance, resource, usability, and accessibility targets. This plan does not invent those targets.

## The eight quality areas

| Quality area | In simple terms | How PEII will be checked |
| --- | --- | --- |
| Functional suitability | Does it do the useful things it promises? | Complete normal portal, survey, research, admin, export, withdrawal, and erasure tasks; also try invalid and forbidden actions. |
| Performance efficiency | Is it fast and resource-conscious enough? | Run agreed load, stress, and longer-running tests for core non-ML tasks; compare cold and warm cache behaviour. Targets must be agreed first. |
| Compatibility | Does it work with supported browsers and connected systems? | Check the agreed browser/device list, API responses, browser origin rules, PostgreSQL, Redis, and the frontend-to-backend connection. |
| Usability | Can people understand and complete tasks? | Have ordinary users complete consent, both survey stages, withdrawal, recovery, and staff tasks; record accessibility and usability problems. |
| Reliability | Does it keep working and recover safely? | Repeat submissions, simulate dependency loss, check recovery, retention, erasure, migrations, and readiness. |
| Security | Are people and data protected? | Check sign-in separation, roles, data permissions, RLS, limits, safe errors, audit records, and production settings. |
| Maintainability | Can the team safely check and change it? | Run code checks; review migrations, request IDs, logs, test evidence, and documented operational steps. |
| Portability | Can it be set up and released in supported places? | Check local, Compose, staging, and approved release paths, with separate evidence for hosted providers. |

## Key user and IT checks

| What to test | How to test it | Success result | Expected failure or safe response | Tester |
| --- | --- | --- | --- | --- |
| Portal access | Sign in as an active staff user, use a permitted page, then sign out. Try a respondent session and a user without permission. | Permitted page opens; sign-out ends access. | Wrong session or missing permission shows a safe denial and no data. | End user + IT expert |
| Invite, recovery, and password change | Use test invitations and recovery links; try expired or reused links. | Approved flow works; a reset link is one-time. | Invalid or reused link cannot change a password and shows a safe message. | End user + IT expert |
| Researcher work | Create, edit, archive, search, and view a synthetic survey and non-ML results. | Changes save, results match approved aggregate data, and actions are audited. | Invalid changes or missing permission are rejected without misleading results. | End user + IT expert |
| Public survey access and consent | Use a test Google respondent, read consent, decline once, then accept and complete both stages. | Survey requires valid respondent proof; consent is recorded; both stages make one response. | Token alone, invalid consent, or missing required answer does not submit data. | End user + IT expert |
| Safe repeat survey submission | Send the same first-stage submission twice, including controlled simultaneous requests; finish stage two. | One response is created or reused as intended; stage two joins it. | Conflicting or malformed repeats do not create duplicates or reveal identity data. | IT expert |
| Withdrawal | Submit a synthetic response, withdraw it with its code, then retry and try a wrong code. | Valid code withdraws the full response; normal reads and aggregates follow policy. | Wrong/lost code reveals nothing; repeat attempts are safe and limited. | End user + IT expert |
| Data permissions and aggregates | Compare aggregate, raw, and identity views using different roles and withdrawn/expired data. Test aggregate limits. | Only approved roles see each level; identity needs the required extra permission. | Unapproved users get no raw or identity data; limit breaches give a safe failure. | IT expert |
| Small groups | Request exact aggregates for very small response groups. | Exact values may be returned to authorized users. | They must be described as exact, **not anonymous or privacy-preserving**. | IT expert |
| Export, retention, and erasure | Test export disabled/enabled with approval; test 10,000 and 10,001 eligible responses; erase selected/all eligible data and repeat. | 10,000 is accepted; export is private and audited; eligible erasure is minimal and repeat-safe. | 10,001 is rejected with `413` and no artifact; unauthorized/ineligible requests expose nothing. | IT expert |
| Administration and audit | Create, invite, disable, and assign permitted roles to test users; attempt role escalation; search audit history. | Approved changes persist and are auditable; disabled users lose access. | Escalation and unauthorized audit access are denied safely. | End user + IT expert |
| API behaviour | Test normal reads/creates and invalid, unauthenticated, forbidden, duplicate, and oversized requests. | Responses follow the route contract and include a request ID where applicable. | Errors are safe, explain the problem simply, and contain no secrets. | IT expert |
| PostgreSQL, RLS, and migrations | Use a disposable PostgreSQL database; migrate from empty; test concurrent writes and direct access rules. | Migration succeeds; allowed application/migration identities work; protected data is blocked from Data API roles. | Unsafe access or failed integrity fails closed. Never use production data. | IT expert |
| Redis limits and cache | In isolation, make controlled bursts for sign-in, recovery, survey reads/submits, and withdrawal; change data and check cache refresh. | Normal requests work within the agreed budget; cache updates after changes. | Excess attempts are limited safely; Redis loss follows the approved policy. | IT expert |
| Health, recovery, and deployment | Check health/readiness, safely make a required dependency unavailable, restore it, build/start a release, and verify the production dev route is absent. | Health and readiness report correctly; recovery is recorded; `/dev/sentiment-test` returns `404` in production. | Unready dependencies return a safe `503`; exposed dev route fails this check. | IT expert |
| Browsers, accessibility, and load | Complete supported tasks on the agreed browser/device list; use keyboard/focus/error checks; run approved non-ML load tests. | Results meet targets agreed before testing. | A missing target or representative environment is Blocked, not Passed; defects are recorded. | End user + IT expert |
| Providers | In staging/production, separately check sign-in, Google flow, Redis, storage export, TLS/CORS, backups, purge scheduling, and release migration. | Each provider check has its own approved evidence. | Missing provider evidence is “not run” or Blocked, never Passed. | IT expert + owner |

## Important rules

- A public survey has two stages. Consent is required, and repeated requests must not create duplicate responses (idempotency).
- Aggregate, raw, and identity information have different permissions. Identity access needs the stricter permission. Exact small-group aggregates are not anonymous.
- Retention and erasure must remove only eligible data, leave the minimum needed record where policy requires it, and remain safe if repeated.
- Role assignment must not allow someone to give themselves more power. Important changes need an audit record.
- PostgreSQL RLS and migrations, Redis rate limits/cache, health/readiness, provider checks, browser/accessibility checks, and load tests are release evidence, not optional claims.

## Common API results

| Result | Plain meaning |
| --- | --- |
| `200` / `201` | The request succeeded. `201` commonly means something was created. |
| `400` / `422` | The request or its input is invalid. |
| `401` | Sign-in is required or invalid. |
| `403` | The signed-in person is not allowed to do this. |
| `404` | The item is unavailable or not found. |
| `409` | The request conflicts with existing state, such as a duplicate. |
| `413` | The request or allowed result is too large. |
| `429` | Too many attempts were made. |
| `502` / `503` | A needed outside service or dependency is unavailable. |

For handled failures, PEII should show a safe message and a request ID that support can use.
It must not expose secrets, tokens, personal data, or internal provider details.

## Before, stop, and finish rules

**Before testing:** agree the release and scope; prepare an isolated environment, synthetic
accounts/data, consent/retention decisions, provider access, evidence storage, and all targets.

**Stop testing:** stop affected work if there is a security, privacy, or data-loss risk; an
environment is no longer representative; production/shared data may be affected; a provider is
down; or a required decision/target is missing. Preserve what was observed and mark it Blocked.

**Finish testing:** record every in-scope check as Passed, Failed, Blocked, or Not applicable
with a reason. Do not release with an unresolved Critical or High issue unless the responsible
owners approve the risk in writing. Provider and production claims need separate evidence.

## Evidence, issues, and sign-off

For each check, record the release/build, environment, tester/date, test account, what happened,
sanitized request ID/status, evidence link, and any issue or retest. Screenshots help show the
user experience but do not by themselves prove permissions, data, cache, migrations, or providers.

| Issue severity | Meaning |
| --- | --- |
| Critical | Security/privacy breach, data loss, access bypass, unsafe migration, or core service unavailable. Stop release. |
| High | Core task, withdrawal, erasure, recovery, or major control fails. No release without written exception. |
| Medium | Important problem with a workaround. Plan and track a fix. |
| Low | Minor wording, appearance, or usability issue without material data/control impact. Track it. |

| Sign-off field | Record |
| --- | --- |
| Release, environment, and test dates | `[value]` |
| Results and open risks | `[Passed / Failed / Blocked / N/A and links]` |
| Critical/High issues or approved exceptions | `[value]` |
| Provider/production checks not run | `[value]` |
| Release recommendation | `[go / conditional go / no-go]` |
| Test owner | `[name / signature / date]` |
| Product/privacy owner | `[name / signature / date]` |
| Approver | `[name / signature / date]` |

## Technical appendix: existing validation commands

These commands are regression evidence, not proof of end-user, provider, browser, load, or
production behaviour. Run them only from the stated directory and record the output.

```bash
# frontend/
npm run lint
npm test
npm run build

# backend/ (the shared test harness overrides DEBUG=true for deterministic local tests)
./.venv/bin/ruff check .
./.venv/bin/mypy .
env DEBUG=false ./.venv/bin/pytest -q

# backend/: isolated PostgreSQL integration only
TEST_DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/peii_test \
  TEST_DATABASE_TLS_MODE=disable \
  env DEBUG=false ./.venv/bin/pytest -q -m integration --require-postgres
```

Normal backend tests use mocks/SQLite, and `backend/tests/conftest.py` sets `DEBUG=true`.
PostgreSQL, provider, and browser checks are separate. Before execution, confirm that the
approved targets and environments exist; otherwise mark the relevant check Blocked.
`TEST_DATABASE_TLS_MODE` affects only isolated-schema Alembic subprocesses and defaults to
`disable` for local disposable Compose PostgreSQL. It accepts only `disable`, `require`, or
`verify-full`.
