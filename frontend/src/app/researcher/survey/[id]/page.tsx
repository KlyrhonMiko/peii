export default async function SurveyViewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] font-semibold text-slate-900 tracking-tight">Survey Details</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">Viewing survey: {resolvedParams.id}</p>
      </div>
      <div className="rounded-xl border border-slate-200/80 bg-white p-6">
        <p className="text-sm text-slate-500">Survey analytics and details placeholder</p>
      </div>
    </div>
  )
}
