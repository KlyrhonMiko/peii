"use client"

import dynamic from "next/dynamic"

import type { PEIIDomainScore } from "@/components/PEIIDimensionsChart"

interface ClientPEIIDimensionsChartProps {
  data?: PEIIDomainScore[]
  isLoading?: boolean
}

const PEIIDimensionsChartDynamic = dynamic(
  () =>
    import("@/components/PEIIDimensionsChart").then(
      (module) => module.PEIIDimensionsChart
    ),
  { ssr: false }
)

export function ClientPEIIDimensionsChart(props: ClientPEIIDimensionsChartProps) {
  return <PEIIDimensionsChartDynamic data={props.data || []} isLoading={props.isLoading} />
}
