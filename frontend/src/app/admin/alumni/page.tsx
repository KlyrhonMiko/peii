import { AdminAlumniCounts } from "@/components/AdminAlumniCounts"
import { requirePortalUser } from "@/lib/auth"

export default async function AlumniCountsPage() {
  await requirePortalUser("alumni_counts.manage")

  return <AdminAlumniCounts />
}
