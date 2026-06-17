import { FeatureImportanceChart } from "@/components/FeatureImportanceChart"

export default function AnalyticsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[20px] font-semibold text-slate-900 tracking-tight">Analytics</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Deep dive into institutional factors and their impact on alumni success.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white">
        <FeatureImportanceChart />
      </div>
    </div>
  )
}
