import { ClientSurveyForm } from "@/components/ClientSurveyForm"

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"

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
      <div className="flex min-h-screen items-center justify-center bg-[#f0f2f5]">
        <div className="rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-black/[0.04]">
          <p className="text-sm text-slate-500">
            Survey not found or unavailable.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ClientSurveyForm
      title={survey.title}
      description={survey.description}
      sections={survey.sections}
      token={alumniToken}
    />
  )
}
