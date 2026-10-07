# PEII Main Pages and Functions

PEII, the Pasig Education Impact Index system, helps administrators manage alumni surveys, review educational and employment outcomes, and control staff access. This guide summarizes its main pages and their functions. Available controls depend on the user's assigned permissions.

## 1 Home and Login

**Purpose:** Introduce PEII and provide access to the staff portal.

**What it shows:** A system introduction, feature descriptions, and the **Login** and **Researcher Portal** buttons.

| Function | What it does |
| --- | --- |
| Login / Researcher Portal | Opens the same sign-in dialog for staff and administrators. |
| Sign in | Accepts a username or email and password to access the portal. |
| Forgot password | Requests an email link to reset a forgotten password. |
| Account setup and password reset | Lets an invited user set a password or an existing user replace it through a valid email link. |
| Authenticator verification | Requests a code from an enrolled authenticator app when additional sign-in verification is required. |

## 2 Dashboard

**Purpose:** Analyze survey results and monitor alumni outcomes.

**What it shows:** Educational impact scores, respondent demographics, historical trends, employment outcomes, and written feedback for the selected Active survey.

| Function | What it does |
| --- | --- |
| Survey selection | Chooses the Active survey whose results appear on the Dashboard. |
| Batch, department, and degree filters | Narrows the results to the selected group of respondents. |
| Overview | Shows Total Responses, PEII Improvement Score, Primary Driver, Needs Attention, and demographic highlights. |
| Performance | Compares pre- and post-graduation domain scores and displays historical PEII and dimension trends. Historical charts appear with All Batches selected. |
| Employment | Shows hiring speed, income distribution, job-acquisition channels, employment security/stability, and degree alignment. |
| Feedback | Shows sentiment by dimension and individual comments. Supports category filters, sentiment sorting, and loading more comments. |
| Sentiment correction | Lets authorized administrators change a feedback entry's positive, neutral, or negative classification. |
| Export | Downloads dashboard sections or individual charts as PNG images. |

Dashboard figures depend on the selected filters and available answers. Incomplete responses can affect scores, and different charts may use different response totals.

## 3 Survey Management

**Navigation:** **Surveys**.

**Purpose:** Prepare questionnaires, manage collection, and review responses.

**What it shows:** Survey titles, collection status, response counts when permitted, creation dates, and available actions. Search, status/cohort filters, sorting, pagination, and **Show Archived** help locate surveys.

| Function | What it does |
| --- | --- |
| Edit Survey Template | Maintains the reusable questionnaire used to generate surveys. |
| Generate Questionnaire | Previews the template and creates a separate Inactive survey when **Generate Survey** is selected. |
| Edit survey | Changes permitted title, description, retention, status, sections, and questions. The editor supports required questions, choices, ratings, rankings, matrices, and existing conditional-question settings. |
| View Details → Questions | Displays the questionnaire's sections, wording, options, and conditional notes for review without submitting answers. |
| View Details → Responses | Displays question summaries and provides authorized access to individual records. |
| Load raw records | Retrieves individual responses so administrators can inspect recorded answers. |
| Load respondent identity | Retrieves available verified respondent names/emails when raw-response and identity access are allowed. |
| Import CSV | Downloads a survey-specific template, validates a completed CSV, and appends historical responses to that survey. |
| Export | Downloads response data as CSV when export permission and deployment enablement allow it. |
| Share survey | Copies the respondent link for an Active, unarchived survey. It does not send invitations itself. |
| Change status | Sets a survey to Inactive, Active, or Closed to manage collection. |
| Archive / Restore | Hides a survey from the ordinary listing while retaining responses, or restores it with Inactive status. |
| Erase responses | Permanently removes selected response data, or all eligible responses from an archived survey, after confirmation. |

**Key rules:** The first response locks survey content and retention settings; collection status remains editable. Imports append records, so uploading the same file again can create duplicates. Archiving retains responses; erasing has no user-facing undo.

## 4 User Management

**Navigation:** **Users**.

**Purpose:** Manage staff accounts and their access to PEII.

**What it shows:** User details, assigned roles, account status, last login, and available actions. Search and filters help find active, inactive, or deleted records.

| Function | What it does |
| --- | --- |
| Invite user | Creates a staff profile and invites a new authentication account, or links an existing one. |
| Bulk invite | Creates several users from pasted CSV rows. Roles are assigned separately afterward. |
| Edit user | Updates the selected user's username, names, and contact information. Email is read-only in this dialog. |
| Activate / Disable | Controls whether the account can access the portal. |
| Assign roles | Replaces the user's role assignments with the selected active roles. |
| Resend setup email | Sends another setup email to an eligible active user whose onboarding is incomplete. |
| Revoke sessions | Requests sign-out across the selected user's authentication sessions. This is separate from disabling the account. |
| Delete / Restore | Soft-deletes a user record to remove access, or restores a previously deleted record. |

PEII protects against self-deactivation, self-deletion, and changes that would remove the last active administrator. Already-issued access tokens may remain valid until expiry after session revocation.

## 5 Roles and Permissions

**Navigation:** **Roles & permissions**.

**Purpose:** Define the capabilities staff receive through their assigned roles.

**What it shows:** Role names, descriptions, permission counts, active status, and system-role indicators.

| Function | What it does |
| --- | --- |
| Create role | Creates a named collection of permissions. |
| Search permissions | Finds capabilities within the permission checklist. |
| Edit role | Changes the description and permitted capabilities of an existing role. |
| Activate / Deactivate role | Enables or disables a non-system role. |
| Manage users | Opens User Management, where roles are assigned to individual accounts. |

System roles cannot be deactivated, and the protected Admin role's permissions cannot be changed. Administrators cannot grant permissions beyond their own access.

## 6 Audit Logs

**Navigation:** **Audit logs**.

**Purpose:** Review recorded system actions and identify who performed them.

**What it shows:** Event time, action, resource type, resource identifier, and performer.

| Function | What it does |
| --- | --- |
| Filter logs | Narrows events by resource type, action, or request ID. |
| Apply filters / Refresh | Retrieves matching events or reloads the current results. |
| View event details | Opens the full actor identifier, request ID, IP address, timestamp, and recorded changes. |
| Pagination | Moves through the event history. |

Audit Logs is read-only. It does not edit, delete, export, or undo events.

## 7 Account Settings

**Navigation:** **Settings**.

**Purpose:** Maintain the signed-in administrator's profile and account security.

**What it shows:** Profile information, password controls, session controls, authenticator settings, effective roles/permissions, and workspace links.

| Function | What it does |
| --- | --- |
| Save profile | Updates the user's own names, username, and contact information. Email remains read-only. |
| Change password | Requests an email verification code and saves a matching new password after verification. |
| Sign out everywhere | Requests revocation of the user's sessions across devices. |
| Add authenticator | Enrolls an authenticator app using a QR code or setup key and a verification code. |
| Remove authenticator | Removes a verified authenticator after confirmation. |
| Your access | Shows the roles and permissions available to the current account. |
| Workspace links | Opens Dashboard and other permitted research or administration pages. |

## 8 Public Survey

**Entry:** The survey link copied from Survey Management. This is the respondent-facing page administrators distribute to alumni.

**Purpose:** Collect identified survey answers and consent.

**What it shows:** Google sign-in, the survey title, consent/data notice, section instructions, questions, progress, and submission status.

| Function | What it does |
| --- | --- |
| Continue with Google | Verifies the respondent's identity using a session separate from staff portal sign-in. |
| Accept data notice | Records agreement to the displayed notice before first-phase submission. |
| Answer questions | Collects choices, text, numbers, ratings, rankings, matrix answers, and dates. Conditional questions depend on earlier answers. |
| Previous / Next | Moves between sections and checks required answers before proceeding. |
| Submit | Saves the current survey phase or completes a single-stage questionnaire. |
| Continue with Phase 2 | Opens the follow-up stage for a two-phase survey after Phase 1 is saved. |
| Completion confirmation | Confirms recorded answers and identifies an already-completed response when the same account returns. |

Respondents should use the same Google account and survey link when continuing a phased questionnaire.

*Source reference: PEII application version `2ff30f5`, reviewed 17 September 2026.*
