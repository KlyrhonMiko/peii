import { Cpu, Server, Activity } from "lucide-react"

export const dynamic = "force-dynamic"

interface ModelInfo {
  id: string
  name: string
  type: string
  description: string
}

async function getModels(): Promise<ModelInfo[]> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"
  try {
    const res = await fetch(`${API_BASE}/ml/models`, { cache: 'no-store' })
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
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-[20px] font-semibold text-slate-900 tracking-tight">System Models</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Machine learning models currently utilized by the platform for inference tasks.
        </p>
      </div>

      {models.length === 0 ? (
        <div className="text-[13px] text-slate-500 bg-white border border-slate-200/80 p-5 rounded-xl text-center">
          No models found or unable to connect to the backend API.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <div
              key={model.id}
              className="rounded-xl border border-slate-200/80 bg-white p-5 hover:border-slate-300/80 transition-colors shadow-sm flex flex-col"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                      <Cpu className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-900 leading-tight">{model.name}</h3>
                      <div className="text-[11px] font-mono text-slate-500 mt-1 line-clamp-1" title={model.id}>{model.id}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-3">
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {model.type.replace("-", " ")}
                </span>
              </div>
              
              <p className="text-[13px] text-slate-600 mt-4 leading-relaxed flex-1">
                {model.description}
              </p>
              
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-4 text-[12px]">
                 <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                    <Server className="w-3.5 h-3.5" />
                    Local Inference
                 </div>
                 <div className="flex items-center gap-1.5 text-emerald-600 font-medium">
                    <Activity className="w-3.5 h-3.5" />
                    Online
                 </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
