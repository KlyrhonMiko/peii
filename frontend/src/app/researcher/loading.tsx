import { Skeleton } from "@/components/ui/skeleton"

export default function ResearcherLoading() {
  return (
    <div className="space-y-12 max-w-6xl mx-auto pb-12 animate-in fade-in duration-500">
      <div className="space-y-2 pb-6 border-b border-slate-200">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 mt-12">
        <div className="lg:col-span-8 flex flex-col gap-24">
          <Skeleton className="h-[460px] w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="lg:col-span-4 flex flex-col gap-16 lg:border-l border-slate-200 lg:pl-16">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
