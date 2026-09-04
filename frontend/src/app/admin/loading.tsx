import { Skeleton } from "@/components/ui/skeleton"

export default function AdminLoading() {
  return (
    <div className="space-y-8 p-2 animate-in fade-in duration-500">
      <div className="space-y-1.5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-44 rounded-lg" />
        ))}
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  )
}
