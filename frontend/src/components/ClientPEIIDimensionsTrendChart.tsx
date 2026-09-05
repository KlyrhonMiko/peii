"use client"
import dynamic from "next/dynamic"

export const ClientPEIIDimensionsTrendChart = dynamic(
  () =>
    import("@/components/PEIIDimensionsTrendChart").then(
      (module) => module.PEIIDimensionsTrendChart
    ),
  { ssr: false }
)
