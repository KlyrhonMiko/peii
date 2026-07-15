import { ClientPEIIDimensionsChart } from "@/components/ClientPEIIDimensionsChart"
import { ClientSentimentDivergenceChart } from "@/components/ClientSentimentDivergenceChart"

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] font-semibold text-slate-900 tracking-tight">Statistical Analytics</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Deep dive into the mathematical and machine learning models driving the Pasig Education Impact Index.
        </p>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-100/50">
          <ClientPEIIDimensionsChart />
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-100/50">
          <ClientSentimentDivergenceChart />
        </div>
      </div>
    </div>
  )
}
