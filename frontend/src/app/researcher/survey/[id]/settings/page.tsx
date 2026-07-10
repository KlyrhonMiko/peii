export default async function SurveySettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[20px] font-semibold text-slate-900 tracking-tight">Survey Settings</h2>
        <p className="text-[13px] text-slate-500 mt-0.5">Manage settings for survey: {resolvedParams.id}</p>
      </div>
      <div className="rounded-xl border border-slate-200/80 bg-white p-6">
        <p className="text-sm text-slate-500">Survey settings form placeholder</p>
      </div>
    </div>
  )
}
