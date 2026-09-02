import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f2f5]">
      <div className="flex items-center gap-2 rounded-xl bg-white px-5 py-4 text-sm text-slate-500 shadow-sm ring-1 ring-black/[0.04]" role="status" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-indigo-500" />
        <span>Loading survey...</span>
      </div>
    </div>
  )
}
