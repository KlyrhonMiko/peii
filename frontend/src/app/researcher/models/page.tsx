"use client"

import { Button } from "@/components/ui/button"
import {
  Cpu,
  MessageSquare,
  Tags,
  TrendingUp,
  ArrowRight,
  CircleDot,
  Layers,
  Gauge,
  Clock,
} from "lucide-react"

const models = [
  {
    id: "sentiment-analysis",
    name: "Contextual Sentiment Analysis",
    description:
      "Analyzes text feedback and survey responses to determine contextual sentiment.",
    icon: MessageSquare,
    status: "Active" as const,
    accuracy: 94.2,
    lastUpdated: "2026-07-08T10:30:00Z",
    architecture: "RoBERTa-Tagalog",
    accent: "indigo",
  },
  {
    id: "tabular-ensemble",
    name: "The Baseline Tabular Ensemble",
    description:
      "Baseline ensemble model for structured tabular data classification and regression tasks.",
    icon: Tags,
    status: "Active" as const,
    accuracy: 89.5,
    lastUpdated: "2026-07-09T14:15:00Z",
    architecture: "Random Forest",
    accent: "emerald",
  },
  {
    id: "diagnostic-engine",
    name: "The Optimized Diagnostic Engine",
    description:
      "Advanced diagnostic model using extreme gradient boosting for high-performance predictive analytics.",
    icon: TrendingUp,
    status: "Training" as const,
    accuracy: null,
    lastUpdated: "2026-07-10T08:00:00Z",
    architecture: "XGBoost",
    accent: "violet",
  },
]

const accentMap = {
  indigo: {
    bg: "bg-indigo-50",
    text: "text-indigo-600",
    border: "border-indigo-100",
    bar: "bg-indigo-500",
    barTrack: "bg-indigo-100",
    pill: "bg-indigo-50 text-indigo-700",
  },
  emerald: {
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    border: "border-emerald-100",
    bar: "bg-emerald-500",
    barTrack: "bg-emerald-100",
    pill: "bg-emerald-50 text-emerald-700",
  },
  violet: {
    bg: "bg-violet-50",
    text: "text-violet-600",
    border: "border-violet-100",
    bar: "bg-violet-500",
    barTrack: "bg-violet-100",
    pill: "bg-violet-50 text-violet-700",
  },
} as const

const activeCount = models.filter((m) => m.status === "Active").length
const trainingCount = models.filter((m) => m.status === "Training").length
const avgAccuracy =
  models.filter((m) => m.accuracy).reduce((a, m) => a + (m.accuracy ?? 0), 0) /
  models.filter((m) => m.accuracy).length

const summaryStats = [
  {
    label: "Total Models",
    value: String(models.length),
    icon: Layers,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
  },
  {
    label: "Active",
    value: String(activeCount),
    icon: CircleDot,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
  },
  {
    label: "Training",
    value: String(trainingCount),
    icon: Cpu,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    label: "Avg. Accuracy",
    value: `${avgAccuracy.toFixed(1)}%`,
    icon: Gauge,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
]

export default function ModelsPage() {
  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div>
        <h2 className="text-[20px] font-semibold text-slate-900 tracking-tight">
          System Models
        </h2>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Monitor and manage the machine learning models powering the PEII
          ecosystem.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {summaryStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200/80 bg-white p-4 hover:border-slate-300/80 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-500">
                {stat.label}
              </span>
              <div
                className={`w-7 h-7 rounded-lg ${stat.iconBg} flex items-center justify-center`}
              >
                <stat.icon
                  className={`w-[14px] h-[14px] ${stat.iconColor}`}
                />
              </div>
            </div>
            <div className="text-[28px] font-semibold mt-2 leading-none tracking-tight text-slate-900">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Model Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {models.map((model) => {
          const colors = accentMap[model.accent]
          return (
            <div
              key={model.id}
              className="group rounded-xl border border-slate-200/80 bg-white hover:border-slate-300/80 transition-all duration-200 flex flex-col"
            >
              {/* Card Header */}
              <div className="p-5 pb-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-9 h-9 rounded-lg ${colors.bg} ${colors.border} border flex items-center justify-center shrink-0`}
                  >
                    <model.icon
                      className={`w-[16px] h-[16px] ${colors.text}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-slate-900 leading-snug">
                      {model.name}
                    </h3>
                    <p className="text-[12px] text-slate-400 mt-1 leading-relaxed line-clamp-2">
                      {model.description}
                    </p>
                  </div>
                </div>
              </div>

              {/* Metrics */}
              <div className="px-5 pb-4 flex-1 space-y-3">
                {/* Status + Architecture */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                      model.status === "Active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        model.status === "Active"
                          ? "bg-emerald-500"
                          : "bg-amber-500 animate-pulse"
                      }`}
                    />
                    {model.status}
                  </span>
                  <span
                    className={`inline-flex items-center text-[11px] font-medium px-2.5 py-1 rounded-full ${colors.pill}`}
                  >
                    {model.architecture}
                  </span>
                </div>

                {/* Accuracy Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      Accuracy / F1
                    </span>
                    <span className="text-[12px] font-semibold text-slate-700">
                      {model.accuracy ? `${model.accuracy}%` : "—"}
                    </span>
                  </div>
                  <div
                    className={`h-1.5 w-full rounded-full ${colors.barTrack}`}
                  >
                    <div
                      className={`h-full rounded-full ${colors.bar} transition-all duration-700 ease-out`}
                      style={{ width: model.accuracy ? `${model.accuracy}%` : "0%" }}
                    />
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Clock className="w-3 h-3" />
                  <span>
                    {new Date(model.lastUpdated).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-3 text-[12px] font-medium text-slate-500 hover:text-slate-900 gap-1.5 cursor-pointer"
                >
                  View Metrics
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
