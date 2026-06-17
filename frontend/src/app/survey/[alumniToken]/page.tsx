import { Button } from "@/components/ui/button"

export default function SurveyPage({ params }: { params: { alumniToken: string } }) {
  return (
    <div className="min-h-screen bg-[#f7f8fb] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-[480px]">
        {/* Card */}
        <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-8 pb-6 text-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-3 py-1 mb-4 uppercase tracking-wide">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4" /></svg>
              Alumni Survey
            </div>
            <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">
              Alumni Outcome Survey
            </h1>
            <p className="text-[13px] text-slate-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
              Help us understand your journey since graduation to improve our institution.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-slate-100 mx-6" />

          {/* Form */}
          <form className="px-6 py-6 space-y-5">
            {/* Employment Status */}
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700 block">
                Current Employment Status
              </label>
              <div className="relative">
                <select className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-700 transition-colors hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 cursor-pointer">
                  <option>Employed Full-Time</option>
                  <option>Employed Part-Time</option>
                  <option>Seeking Employment</option>
                  <option>Further Studies</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            {/* Income Range */}
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700 block">
                Annual Income Range
                <span className="text-slate-400 font-normal ml-1">(Optional)</span>
              </label>
              <div className="relative">
                <select className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-700 transition-colors hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 cursor-pointer">
                  <option>Prefer not to say</option>
                  <option>Below ₱250,000</option>
                  <option>₱250,000 - ₱500,000</option>
                  <option>Above ₱500,000</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            {/* Degree Relevance */}
            <div className="space-y-2.5">
              <label className="text-[13px] font-medium text-slate-700 block">
                Degree Relevance to Current Role
              </label>
              <div className="px-0.5">
                <input
                  type="range"
                  min="1"
                  max="5"
                  defaultValue="3"
                  className="w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600 focus:outline-none"
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                <span>Not Relevant</span>
                <span>Highly Relevant</span>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <Button className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium h-10 text-[13px] transition-colors">
                Submit Response
              </Button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400 mt-4">
          Pasig Education Impact Index · Confidential Survey
        </p>
      </div>
    </div>
  )
}
