"use client"

import dynamic from "next/dynamic"
import type { FeedbackClassification } from "@/lib/surveys"

const DynamicChart = dynamic(
  () =>
    import("@/components/FeedbackClassificationChart").then(
      (module) => module.FeedbackClassificationChart
    ),
  { ssr: false }
)

export function ClientFeedbackClassificationChart({ 
  data, 
  isExport 
}: { 
  data?: FeedbackClassification[] | undefined
  isExport?: boolean | undefined 
}) {
  return <DynamicChart data={data} isExport={isExport} />
}
