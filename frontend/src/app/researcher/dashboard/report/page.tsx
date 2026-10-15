import { notFound } from "next/navigation"

import { PrintableReport } from "@/components/PrintableReport"

export const metadata = {
  title: "PEII Results Report",
}

interface ReportPageProps {
  searchParams: Promise<{ survey?: string; code?: string; batch?: string; department?: string; degree?: string }>
}

/** Printable results report for one survey and the dashboard filters, opened from Export. */
export default async function ReportPage({ searchParams }: ReportPageProps) {
  const params = await searchParams
  if (!params.survey || !params.code) notFound()

  return (
    <PrintableReport
      surveyId={params.survey}
      surveyCode={params.code}
      filters={{
        batch: params.batch || "All Batches",
        department: params.department || "All Departments",
        degree: params.degree || "All Degrees",
      }}
    />
  )
}
