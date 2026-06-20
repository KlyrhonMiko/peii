import { Button } from "@/components/ui/button"
import {
  ClipboardList,
  Briefcase,
  Wallet,
  GraduationCap,
  ShieldCheck,
  ArrowRight,
} from "lucide-react"

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ alumniToken: string }>
}) {
  const { alumniToken } = await params

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* Background accent strip */}
      <div className="h-[240px] bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500" />

      <div className="mx-auto w-full max-w-[640px] px-4 -mt-[200px] pb-12">
        {/* ── Title card ────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-xl border-t-[6px] border-t-indigo-500 bg-white shadow-sm ring-1 ring-black/[0.04]">
          <div className="px-7 pt-7 pb-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <ClipboardList className="size-[18px]" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
                Alumni Survey
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Alumni Outcome Survey
            </h1>
            <p className="mt-2 max-w-md text-[15px] leading-relaxed text-slate-500">
              Help us understand your journey since graduation. Your responses
              are confidential and will be used to improve our institution.
            </p>
          </div>
        </div>

        {/* ── Form cards ────────────────────────────────────────── */}
        <form className="mt-3 space-y-3">
          {/* Employment Status */}
          <fieldset
            id="field-employment"
            className="rounded-xl bg-white px-7 py-6 shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md"
          >
            <legend className="sr-only">Employment Status</legend>
            <div className="mb-1 flex items-center gap-2.5">
              <Briefcase className="size-4 text-indigo-500" />
              <label
                htmlFor="employment-select"
                className="text-sm font-medium text-slate-800"
              >
                Current Employment Status
              </label>
            </div>
            <p className="mb-4 text-[13px] leading-relaxed text-slate-400">
              Select the option that best describes your current work situation.
            </p>
            <div className="relative">
              <select
                id="employment-select"
                className="w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-700 transition-colors hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
              >
                <option value="">Select an option…</option>
                <option>Employed Full-Time</option>
                <option>Employed Part-Time</option>
                <option>Seeking Employment</option>
                <option>Further Studies</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400">
                <svg
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </fieldset>

          {/* Income Range */}
          <fieldset
            id="field-income"
            className="rounded-xl bg-white px-7 py-6 shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md"
          >
            <legend className="sr-only">Income Range</legend>
            <div className="mb-1 flex items-center gap-2.5">
              <Wallet className="size-4 text-indigo-500" />
              <label
                htmlFor="income-select"
                className="text-sm font-medium text-slate-800"
              >
                Annual Income Range
                <span className="ml-1.5 text-xs font-normal text-slate-400">
                  Optional
                </span>
              </label>
            </div>
            <p className="mb-4 text-[13px] leading-relaxed text-slate-400">
              This information helps us assess employment quality outcomes.
            </p>
            <div className="relative">
              <select
                id="income-select"
                className="w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-700 transition-colors hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
              >
                <option value="">Select an option…</option>
                <option>Prefer not to say</option>
                <option>Below ₱250,000</option>
                <option>₱250,000 – ₱500,000</option>
                <option>Above ₱500,000</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400">
                <svg
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </fieldset>

          {/* Degree Relevance */}
          <fieldset
            id="field-relevance"
            className="rounded-xl bg-white px-7 py-6 shadow-sm ring-1 ring-black/[0.04] transition-shadow hover:shadow-md"
          >
            <legend className="sr-only">Degree Relevance</legend>
            <div className="mb-1 flex items-center gap-2.5">
              <GraduationCap className="size-4 text-indigo-500" />
              <label className="text-sm font-medium text-slate-800">
                Degree Relevance to Current Role
              </label>
            </div>
            <p className="mb-5 text-[13px] leading-relaxed text-slate-400">
              Rate how relevant your degree has been to your current career.
            </p>
            <div className="px-1">
              <input
                type="range"
                min="1"
                max="5"
                defaultValue="3"
                aria-label="Degree relevance rating from 1 to 5"
                className="w-full cursor-pointer appearance-none rounded-full accent-indigo-600 focus:outline-none
                  [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-slate-100
                  [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-600 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110
                  [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-slate-100
                  [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-indigo-600 [&::-moz-range-thumb]:shadow-md"
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <span>Not Relevant</span>
              <span>Somewhat</span>
              <span>Highly Relevant</span>
            </div>
          </fieldset>

          {/* Submit */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="size-3.5" />
              <span>Your responses are confidential</span>
            </div>
            <Button
              className="h-10 gap-2 rounded-lg bg-indigo-600 px-6 text-sm font-medium text-white shadow-sm transition-all hover:bg-indigo-700 hover:shadow-md"
            >
              Submit
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
          </div>
        </form>

        {/* ── Footer ────────────────────────────────────────────── */}
        <footer className="mt-8 text-center">
          <p className="text-xs text-slate-400">
            Pasig Education Impact Index
          </p>
          <p className="mt-0.5 text-[11px] text-slate-300">
            Token&ensp;{alumniToken}
          </p>
        </footer>
      </div>
    </div>
  )
}
