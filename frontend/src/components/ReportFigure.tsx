"use client"

import { ClientDegreeAlignment } from "@/components/ClientDegreeAlignment"
import { ClientEmploymentStability } from "@/components/ClientEmploymentStability"
import { ClientFeedbackClassificationChart } from "@/components/ClientFeedbackClassificationChart"
import { ClientHiringVelocity } from "@/components/ClientHiringVelocity"
import { ClientIncomeDistribution } from "@/components/ClientIncomeDistribution"
import { ClientJobChannels } from "@/components/ClientJobChannels"
import { ClientKeyOutcomes } from "@/components/ClientKeyOutcomes"
import { ClientDomainGainChart } from "@/components/ClientDomainGainChart"
import { ClientPEIIDimensionsTrendChart } from "@/components/ClientPEIIDimensionsTrendChart"
import { ClientPEIIHistoricalTrendChart } from "@/components/ClientPEIIHistoricalTrendChart"
import { ResponseRateBreakdown } from "@/components/ResponseRateBreakdown"
import type { ResponseCoverage } from "@/lib/alumni-counts"
import type { ReportFigureId } from "@/lib/peii-report"
import type { PEIIAnalyticsResponse } from "@/lib/surveys"

/** Renders one dashboard chart for the printable report, from the same analytics response. */
export function ReportFigure({
  id,
  analytics,
  coverage,
}: {
  id: ReportFigureId
  analytics: PEIIAnalyticsResponse
  coverage: ResponseCoverage | null
}) {
  const outcomes = analytics.outcome_distributions
  switch (id) {
    case "rate-batch":
    case "rate-college":
      return coverage ? (
        <ResponseRateBreakdown coverage={coverage} view={id === "rate-batch" ? "batch" : "college"} showViewSwitch={false} />
      ) : null
    case "historical-trend":
      return <ClientPEIIHistoricalTrendChart data={analytics.historical_trend} />
    case "dimension-trend":
      return <ClientPEIIDimensionsTrendChart data={analytics.historical_trend} />
    case "domain-gain":
      return (
        <ClientDomainGainChart
          data={analytics.cohort_result.domains.map((domain) => ({
            dimension: domain.dimension,
            preGrad: domain.pre_grad,
            postGrad: domain.post_grad,
          }))}
        />
      )
    case "income":
      return <ClientIncomeDistribution distribution={outcomes.monthly_income ?? null} />
    case "channels":
      return <ClientJobChannels distribution={outcomes.job_search_channel ?? null} />
    case "hiring-velocity":
      return <ClientHiringVelocity distribution={outcomes.time_to_first_job ?? null} />
    case "employment-quality":
      return <ClientEmploymentStability typeDistribution={outcomes.employment_type ?? null} />
    case "employment-stability":
      return <ClientKeyOutcomes distribution={outcomes.employment_stability} />
    case "degree-alignment":
      return <ClientDegreeAlignment distribution={outcomes.degree_alignment} />
    case "feedback-sentiment":
      return <ClientFeedbackClassificationChart data={analytics.feedback_classification?.classifications ?? []} />
  }
}
