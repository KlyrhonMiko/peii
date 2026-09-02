"use client"

import dynamic from "next/dynamic"
import type { SentimentDivergenceTier } from "@/lib/surveys"

const DynamicChart = dynamic(
  () =>
    import("@/components/SentimentDivergenceChart").then(
      (module) => module.SentimentDivergenceChart
    ),
  { ssr: false }
)

export function ClientSentimentDivergenceChart({ data }: { data?: SentimentDivergenceTier[] }) {
  return <DynamicChart data={data} />
}
