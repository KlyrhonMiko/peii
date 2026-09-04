"use client"

import dynamic from "next/dynamic"

export const ClientPEIIHistoricalTrendChart = dynamic(
  () =>
    import("@/components/PEIIHistoricalTrendChart").then(
      (module) => module.PEIIHistoricalTrendChart
    ),
  { ssr: false }
)
