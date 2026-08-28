import { SurveyManagement } from "@/components/SurveyManagement"
import { requirePortalUser } from "@/lib/auth"

export default async function SurveyPage() {
  const currentUser = await requirePortalUser("surveys.read")
  const csvExportEnabled = process.env.CSV_EXPORT_ENABLED === "true"

  return <SurveyManagement permissions={currentUser.permissions} csvExportEnabled={csvExportEnabled} />
}
