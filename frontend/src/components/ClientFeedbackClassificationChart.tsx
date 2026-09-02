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

export function ClientFeedbackClassificationChart({ data }: { data?: FeedbackClassification[] }) {
  return <DynamicChart data={data} />
}
