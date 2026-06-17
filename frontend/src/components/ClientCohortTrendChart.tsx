"use client"

import dynamic from "next/dynamic"

export const ClientCohortTrendChart = dynamic(
  () => import("@/components/CohortTrendChart").then((module) => module.CohortTrendChart),
  { ssr: false }
)
