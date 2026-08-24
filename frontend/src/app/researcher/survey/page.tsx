import { SurveyManagement } from "@/components/SurveyManagement"
import { requirePortalUser } from "@/lib/auth"

export default async function SurveyPage() {
  const currentUser = await requirePortalUser("surveys.read")

  return <SurveyManagement permissions={currentUser.permissions} />
}
