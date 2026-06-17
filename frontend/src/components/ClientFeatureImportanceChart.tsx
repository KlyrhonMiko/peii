"use client"

import dynamic from "next/dynamic"

export const ClientFeatureImportanceChart = dynamic(
  () =>
    import("@/components/FeatureImportanceChart").then(
      (module) => module.FeatureImportanceChart
    ),
  { ssr: false }
)
