import { AdminAuditLogs } from "@/components/AdminAuditLogs"
import { requirePortalUser } from "@/lib/auth"

export default async function AuditLogsPage() {
  await requirePortalUser("audit_logs.read")

  return <AdminAuditLogs />
}
