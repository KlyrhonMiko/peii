"use client"

import dynamic from "next/dynamic"

export const ClientSentimentDivergenceChart = dynamic(
  () =>
    import("@/components/SentimentDivergenceChart").then(
      (module) => module.SentimentDivergenceChart
    ),
  { ssr: false }
)
