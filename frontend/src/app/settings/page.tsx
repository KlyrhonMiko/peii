import Link from "next/link"

import { AppSidebar } from "@/components/app-sidebar"
import { NavBar } from "@/components/nav-bar"
import { SettingsAccountForms } from "@/components/SettingsAccountForms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SidebarProvider } from "@/components/ui/sidebar"
import { getPortalMfaStatus, requirePortalUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export const metadata = { title: "Settings | PEII" }

const ACCESS_LABELS: Record<string, string> = {
  "portal.access": "Access the portal",
  "surveys.read": "View surveys",
  "surveys.manage": "Manage surveys and retention",
  "survey_responses.read_aggregates": "View aggregate responses",
  "survey_responses.read_raw": "View raw responses",
  "survey_responses.read_identity": "Respondent identity access (also requires raw-response access)",
  "survey_responses.import": "Import responses",
  "survey_responses.export": "Export responses when enabled",
  "survey_responses.erase": "Erase responses",
  "users.read": "View users",
  "users.invite": "Invite users",
  "users.update": "Update user profiles",
  "users.assign_roles": "Assign roles",
  "users.change_status": "Activate or deactivate users",
  "users.revoke_sessions": "Revoke user sessions",
  "users.delete": "Delete users",
  "users.restore": "Restore users",
  "roles.read": "View roles and permissions",
  "roles.manage": "Manage roles and permissions",
  "audit_logs.read": "View audit logs",
  "ml.models.read": "View ML model catalog",
  "ml.sentiment.run": "Run sentiment analysis",
  "survey_distributions.manage": "Legacy distribution permission (no active control)",
}

export default async function SettingsPage() {
  const user = await requirePortalUser("portal.access", "/settings")
  const mfa = await getPortalMfaStatus()
  const permissions = new Set(user.permissions)
  const canManageSurveys = permissions.has("surveys.manage")
  const destinations = [
    { href: "/researcher/dashboard", label: "Dashboard", detail: "View the research overview and aggregate trends", show: true },
    { href: "/researcher/survey", label: "Surveys", detail: canManageSurveys ? "Edit surveys, collection status, and retention before responses arrive" : "View surveys available in the shared workspace", show: permissions.has("surveys.read") },
    { href: "/admin/users", label: "Users", detail: "Invitations, account status, and role assignments", show: permissions.has("users.read") },
    { href: "/admin/roles", label: "Roles & permissions", detail: "Review or manage the access model", show: permissions.has("roles.read") },
    { href: "/admin/audit-logs", label: "Audit logs", detail: "Review recorded administrative and research actions", show: permissions.has("audit_logs.read") },
  ].filter((item) => item.show)
  const effectiveAccess = user.permissions.filter((permission) => permission in ACCESS_LABELS)

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-muted/20">
        <NavBar breadcrumbs={[{ label: "Settings", active: true }]} />
        <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 p-5 lg:p-8">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your account and see what is available in your workspace.</p>
          </header>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
            <SettingsAccountForms mfaFactors={mfa.factors} user={user} />
            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader>
                  <CardTitle>Your access</CardTitle>
                  <CardDescription>Permissions are set by administrators and apply across the shared survey workspace.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Roles</p>
                    <p className="mt-1 text-sm">{user.roles.length > 0 ? user.roles.join(", ") : "No role assigned"}</p>
                  </div>
                  <details className="group rounded-lg border border-border p-3">
                    <summary className="cursor-pointer text-sm font-medium">View effective permissions ({effectiveAccess.length})</summary>
                    <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                      {effectiveAccess.map((permission) => <li key={permission}>{ACCESS_LABELS[permission]}</li>)}
                    </ul>
                  </details>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Workspace</CardTitle>
                  <CardDescription>Open the tools your current permissions allow.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-2">
                    {destinations.map((item) => (
                      <li key={item.href}>
                        <Link className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={item.href}>
                          <span className="text-sm font-medium">{item.label}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </SidebarProvider>
  )
}
