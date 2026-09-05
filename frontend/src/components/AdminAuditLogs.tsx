"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw, ScrollText } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { getAuditLog, listAuditLogs, type AuditLog, type AuditLogListParams, type AuditLogListResult } from "@/lib/audit"

const PAGE_SIZE = 20

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Unable to load audit logs."
}

function formatTimestamp(value: string): string {
  // Backend timestamps are naive UTC; normalize before formatting as local time.
  const iso = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatActor(performedBy: string) {
  return performedBy.startsWith("system-") ? performedBy : performedBy.slice(0, 13)
}

function AuditLogDetail({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-foreground tracking-tight">
            {log.action} · {log.resource_type}
          </DialogTitle>
          <DialogDescription className="text-[14px] text-muted-foreground leading-relaxed">
            {log.resource_id}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-2 text-[13px]">
          <div>
            <dt className="font-semibold text-foreground">Performed by</dt>
            <dd className="font-mono text-muted-foreground mt-0.5 break-all">{log.performed_by}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Request ID</dt>
            <dd className="font-mono text-muted-foreground mt-0.5 break-all">{log.request_id ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">IP address</dt>
            <dd className="font-mono text-muted-foreground mt-0.5">{log.ip_address ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-foreground">Created at</dt>
            <dd className="text-muted-foreground mt-0.5">{formatTimestamp(log.created_at)}</dd>
          </div>
          {log.changes !== null && (
            <div className="sm:col-span-2">
              <dt className="font-semibold text-foreground">Changes</dt>
              <dd>
                <pre className="mt-1 p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 text-[12px] leading-relaxed text-zinc-700 overflow-x-auto max-h-72">
                  {JSON.stringify(log.changes, null, 2)}
                </pre>
              </dd>
            </div>
          )}
        </dl>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose} className="h-9 rounded-lg">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AdminAuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<AuditLogListResult["pagination"]>({
    total: 0,
    count: 0,
    limit: PAGE_SIZE,
    offset: 0,
    has_next: false,
    has_prev: false,
  })
  const [resourceType, setResourceType] = useState("")
  const [action, setAction] = useState("")
  const [requestId, setRequestId] = useState("")
  const [offset, setOffset] = useState(0)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  const refresh = useCallback((nextOffset: number) => {
    const params: AuditLogListParams = { limit: PAGE_SIZE, offset: nextOffset }
    const trimmedResourceType = resourceType.trim()
    const trimmedAction = action.trim()
    const trimmedRequestId = requestId.trim()
    if (trimmedResourceType) params.resource_type = trimmedResourceType
    if (trimmedAction) params.action = trimmedAction
    if (trimmedRequestId) params.request_id = trimmedRequestId

    startTransition(() => {
      void listAuditLogs(params)
        .then((result) => {
          setLogs(result.logs)
          setPagination(result.pagination)
          setOffset(result.pagination.offset)
          setError(null)
          setHasLoaded(true)
        })
        .catch((err: unknown) => {
          setError(errorMessage(err))
          setHasLoaded(true)
        })
    })
  }, [action, requestId, resourceType])

  useEffect(() => {
    const timer = window.setTimeout(() => refresh(0), 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, requestId, resourceType])

  const openDetail = (log: AuditLog) => {
    void getAuditLog(log.id)
      .then(setSelectedLog)
      .catch((error: unknown) => toast.error(errorMessage(error)))
  }

  const from = pagination.total === 0 ? 0 : offset + 1
  const to = offset + logs.length

  return (
    <div className="space-y-6 p-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Audit logs</h2>
          <p className="text-[14px] text-zinc-500 max-w-xl">
            Append-only record of privileged and public mutations, in most-recent-first order.
          </p>
        </div>
        <Button
          onClick={() => refresh(offset)}
          variant="outline"
          className="h-9 gap-2 border-zinc-200/80 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 shadow-sm transition-all rounded-lg"
        >
          <RefreshCw className="size-4 text-zinc-400" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-zinc-600">Resource type</span>
          <Input
            value={resourceType}
            onChange={(event) => setResourceType(event.target.value)}
            placeholder="e.g. user, survey"
            className="h-9 w-56 rounded-lg text-[13px]"
            aria-label="Filter by resource type"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-zinc-600">Action</span>
          <Input
            value={action}
            onChange={(event) => setAction(event.target.value)}
            placeholder="e.g. update, delete"
            className="h-9 w-44 rounded-lg text-[13px]"
            aria-label="Filter by action"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-zinc-600">Request ID</span>
          <Input
            value={requestId}
            onChange={(event) => setRequestId(event.target.value)}
            placeholder="Optional request ID"
            className="h-9 w-56 rounded-lg font-mono text-[12px]"
            aria-label="Filter by request ID"
          />
        </label>
        <Button
          onClick={() => refresh(0)}
          className="h-9 bg-zinc-900 hover:bg-zinc-800 text-white shadow-sm transition-all active:scale-[0.98] rounded-lg text-[13px]"
        >
          Apply filters
        </Button>
      </div>

      {error ? (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div className="text-[13px]">
            <p className="font-semibold">{error}</p>
            <p className="mt-0.5 text-red-600/80">Use Refresh to try again.</p>
          </div>
        </div>
      ) : !hasLoaded ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <ScrollText className="size-8 text-zinc-300" />
          <p className="text-[14px] text-zinc-500">No audit logs match the current filters.</p>
        </div>
      ) : (
        <>
          <div className="hidden md:grid grid-cols-12 gap-6 pb-3 px-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            <div className="col-span-2">Time</div>
            <div className="col-span-2">Action</div>
            <div className="col-span-2">Resource</div>
            <div className="col-span-3">Resource ID</div>
            <div className="col-span-3">Performed by</div>
          </div>

          <div className="divide-y divide-zinc-200 border-y border-zinc-200">
            {logs.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => openDetail(log)}
                className="w-full grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 py-3.5 px-2 text-left hover:bg-zinc-50/60 transition-colors"
              >
                <div className="col-span-2 text-[13px] text-zinc-500">{formatTimestamp(log.created_at)}</div>
                <div className="col-span-2">
                  <span className="inline-flex px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 text-[12px] font-medium">
                    {log.action}
                  </span>
                </div>
                <div className="col-span-2 text-[13px] text-zinc-700">{log.resource_type}</div>
                <div className="col-span-3 text-[13px] font-mono text-zinc-500 break-all">{log.resource_id}</div>
                <div className="col-span-3 text-[13px] font-mono text-zinc-500 break-all">{formatActor(log.performed_by)}</div>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-[13px] text-zinc-500">
              Showing {from}–{to} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => refresh(Math.max(0, offset - PAGE_SIZE))}
                disabled={!pagination.has_prev || !hasLoaded || isPending}
                className="h-9 gap-1.5 rounded-lg text-[13px]"
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => refresh(offset + PAGE_SIZE)}
                disabled={!pagination.has_next || !hasLoaded || isPending}
                className="h-9 gap-1.5 rounded-lg text-[13px]"
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {selectedLog && <AuditLogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  )
}
