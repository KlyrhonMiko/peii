"use client"

import dynamic from "next/dynamic"

export const ClientPEIIDimensionsChart = dynamic(
  () =>
    import("@/components/PEIIDimensionsChart").then(
      (module) => module.PEIIDimensionsChart
    ),
  { ssr: false }
)
