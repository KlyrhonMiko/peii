import { Cpu, Server, Activity } from "lucide-react"

import { createSupabaseServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

interface ModelInfo {
  id: string
  name: string
  type: string
  description: string
}

async function getModels(): Promise<ModelInfo[]> {
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) throw new Error("BACKEND_INTERNAL_URL is not configured")
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getSession()
  if (!data.session?.access_token) return []
  try {
    const res = await fetch(`${backendUrl}/ml/models`, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      cache: "no-store",
    })
    if (!res.ok) {
      throw new Error("Failed to fetch models")
    }
    const json = await res.json()
    return json.data || []
  } catch (error) {
    console.error("Failed to load models:", error)
    return []
  }
}

export default async function ModelsPage() {
  const models = await getModels()

  return (
    <div className="space-y-12 animate-in fade-in duration-500 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-6 border-b border-slate-200">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">System Models</h2>
          <p className="text-base text-slate-500 max-w-xl">
            Machine learning models currently utilized by the platform for inference tasks.
          </p>
        </div>
      </div>

      {models.length === 0 ? (
        <div className="text-[14px] text-slate-500 py-12 text-center border-b border-slate-200">
          No models found or unable to connect to the backend API.
        </div>
      ) : (
        <div className="pt-2">
          {/* Desktop Header */}
          <div className="hidden md:grid grid-cols-12 gap-6 pb-4 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <div className="col-span-4 pl-2">Model</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-4">Description</div>
            <div className="col-span-2 text-right pr-2">Status</div>
          </div>
          
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {models.map((model) => (
              <div key={model.id} className="grid grid-cols-1 md:grid-cols-12 gap-6 py-6 items-start hover:bg-slate-50/50 transition-colors px-2 group">
                <div className="col-span-4 flex items-start gap-3">
                  <div className="flex items-center justify-center shrink-0 mt-0.5">
                    <Cpu className="w-[15px] h-[15px] text-slate-400 group-hover:text-indigo-600 transition-colors" />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{model.name}</div>
                    <div className="text-[12px] font-mono text-slate-400 mt-1">{model.id}</div>
                  </div>
                </div>
                
                <div className="col-span-2 flex items-start">
                  <span className="text-[12px] font-medium text-slate-600 capitalize">
                    {model.type.replace(/-/g, " ")}
                  </span>
                </div>
                
                <div className="col-span-4 flex items-start">
                  <p className="text-[13px] text-slate-500 leading-relaxed pr-6">
                    {model.description}
                  </p>
                </div>
                
                <div className="col-span-2 flex items-center justify-end gap-3">
                  <div className="flex items-center text-[12px] text-slate-400" title="Local Inference">
                    <Server className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-emerald-600 font-medium">
                    <Activity className="w-3.5 h-3.5" />
                    Online
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
