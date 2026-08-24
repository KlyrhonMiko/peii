import { ClientSurveyForm } from "@/components/ClientSurveyForm"

const API_BASE = process.env.NEXT_PUBLIC_API_URL
if (!API_BASE) throw new Error("NEXT_PUBLIC_API_URL is not configured")

interface PublicQuestion {
  id: string
  question_text: string
  question_type: string
  options: string[] | null
  config: Record<string, unknown> | null
  order_index: number
  is_required: boolean
}

interface PublicSection {
  id: string
  title: string
  description: string | null
  order_index: number
  questions: PublicQuestion[]
}

interface PublicSurvey {
  survey_id: string
  title: string
  description: string | null
  questions: PublicQuestion[]
  sections: PublicSection[]
}

interface ApiResponse<T> {
  data: T | null
  message: string
  errors: unknown | null
  meta: Record<string, unknown>
}

async function getSurvey(token: string): Promise<PublicSurvey | null> {
  try {
    const res = await fetch(`${API_BASE}/survey/${token}`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    const json: ApiResponse<PublicSurvey> = await res.json()
    return json.data
  } catch {
    return null
  }
}

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ alumniToken: string }>
}) {
  const { alumniToken } = await params
  const survey = await getSurvey(alumniToken)

  if (!survey || survey.sections.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f0f2f5] p-6">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-black/[0.04]">
          <h1 className="text-lg font-semibold text-slate-900">This survey is unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This link may have expired, been revoked, or the survey is no longer accepting responses.
          </p>
          <p className="mt-4 text-xs text-slate-500">
            Please contact the person who shared this link if you believe this is unexpected.
          </p>
        </div>
      </main>
    )
  }

  return (
    <ClientSurveyForm
      key={alumniToken}
      title={survey.title}
      description={survey.description}
      sections={survey.sections}
      token={alumniToken}
    />
  )
}
