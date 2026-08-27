"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Check, CheckCircle2, Copy, Loader2, RefreshCw, Share2, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { createDistribution, fetchDistributions, revokeDistribution, rotateDistribution } from "@/lib/surveys"
import { cn } from "@/lib/utils"
import type { Distribution, DistributionSecret } from "@/lib/surveys"

interface SurveyDistributionManagerProps {
  surveyId: string
  open: boolean
  canManage: boolean
  onOpenChange: (open: boolean) => void
}

function ExpirySelect({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  
  const options = [
    { value: 0, label: "30 days (Default)" },
    { value: 1, label: "1 day" },
    { value: 7, label: "7 days" },
    { value: 30, label: "30 days" },
  ]
  
  const selectedLabel = options.find((o) => o.value === value)?.label

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            type="button"
            disabled={disabled}
            className="h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 shadow-sm focus:border-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-between gap-2"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronDown className="size-4 text-slate-500 shrink-0 opacity-60" />
          </Button>
        }
      />
      <PopoverContent
        align="start"
        style={{ width: "var(--anchor-width)" }}
        className="p-1 flex flex-col gap-0.5 bg-white border border-slate-200 rounded-lg shadow-md animate-in fade-in-0 zoom-in-95 duration-100 z-[60]"
      >
        {options.map((option) => {
          const isSelected = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className={cn(
                "flex items-center justify-between w-full px-2.5 py-1.5 text-[13px] font-medium rounded-md text-left transition-colors cursor-pointer outline-none",
                isSelected
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <span>{option.label}</span>
              {isSelected && <Check className="size-3.5 text-slate-900" />}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}

function formatDistributionDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never"
}

function statusLabel(status: Distribution["status"]): string {
  return status[0]?.toUpperCase() + status.slice(1)
}

function statusGuidance(status: Distribution["status"]): string {
  switch (status) {
    case "active":
      return "This link can accept responses until it expires."
    case "suspended":
      return "This link is suspended and cannot accept responses until it is restored by the backend."
    case "expired":
      return "This link has expired. Issue a new link with a new expiry date."
    case "revoked":
      return "This link was revoked and cannot accept responses. Issue a new link to continue."
  }
}

function distributionMetadata(secret: DistributionSecret): Distribution {
  return {
    id: secret.id,
    surveyId: secret.surveyId,
    status: secret.status,
    isActive: secret.isActive,
    expiresAt: secret.expiresAt,
    revokedAt: secret.revokedAt,
    createdAt: secret.createdAt,
  }
}

function DistributionLifecycle({
  distributions,
  canManage,
  action,
  onRevoke,
}: {
  distributions: Distribution[]
  canManage: boolean
  action: "create" | "rotate" | "revoke" | null
  onRevoke: (distributionId: string) => void
}) {
  if (distributions.length === 0) return null

  return (
    <div className="space-y-4 pt-4 border-t border-slate-200/60">
      <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Link lifecycle</h3>
      {distributions.map((distribution) => (
        <div key={distribution.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", distribution.status === "active" ? "bg-emerald-500" : "bg-slate-400")} />
                <span className="font-medium text-slate-800">{statusLabel(distribution.status)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{statusGuidance(distribution.status)}</p>
            </div>
            {canManage && distribution.status === "active" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRevoke(distribution.id)}
                disabled={action !== null}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                {action === "revoke" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                Revoke
              </Button>
            )}
          </div>
          <dl className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
            <div><dt className="inline font-medium text-slate-600">Created: </dt><dd className="inline">{formatDistributionDate(distribution.createdAt)}</dd></div>
            <div><dt className="inline font-medium text-slate-600">Expires: </dt><dd className="inline">{formatDistributionDate(distribution.expiresAt)}</dd></div>
          </dl>
        </div>
      ))}
    </div>
  )
}


export function SurveyDistributionManager({
  surveyId,
  open,
  canManage,
  onOpenChange,
}: SurveyDistributionManagerProps) {
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [secret, setSecret] = useState<DistributionSecret | null>(null)
  const [expiryDays, setExpiryDays] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<"create" | "rotate" | "revoke" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clipboardError, setClipboardError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const loadId = useRef(0)

  const activeDistribution = distributions.find((d) => d.status === "active")
  const hasActiveLink = !!activeDistribution

  const load = useCallback(async () => {
    const requestId = ++loadId.current
    setLoading(true)
    setError(null)
    try {
      const nextDistributions = await fetchDistributions(surveyId)
      if (requestId === loadId.current) setDistributions(nextDistributions)
    } catch (loadError) {
      if (requestId === loadId.current) {
        setError(loadError instanceof Error ? loadError.message : "We could not load distribution links.")
      }
    } finally {
      if (requestId === loadId.current) setLoading(false)
    }
  }, [surveyId])

  useEffect(() => {
    if (!open) return
    const timeoutId = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [load, open])

  const issuedUrl = useMemo(() => {
    if (!secret || secret.surveyId !== surveyId || typeof window === "undefined") return null
    return `${window.location.origin}/survey/${secret.token}`
  }, [secret, surveyId])

  const performCreate = async () => {
    if (!canManage) return
    setAction("create")
    setError(null)
    setClipboardError(null)
    try {
      let expiresAtValue: string | null = null
      if (expiryDays > 0) {
        const expiry = new Date()
        expiry.setDate(expiry.getDate() + expiryDays)
        expiresAtValue = expiry.toISOString()
      }
      const created = await createDistribution(surveyId, expiresAtValue)
      setSecret(created)
      setDistributions((current) => [distributionMetadata(created), ...current.filter((item) => item.id !== created.id)])
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "We could not issue a distribution link.")
    } finally {
      setAction(null)
    }
  }

  const performRotate = async (distributionId: string) => {
    if (!canManage) return
    setAction("rotate")
    setError(null)
    setClipboardError(null)
    try {
      let expiresAtValue: string | null = null
      if (expiryDays > 0) {
        const expiry = new Date()
        expiry.setDate(expiry.getDate() + expiryDays)
        expiresAtValue = expiry.toISOString()
      }
      const replacement = await rotateDistribution(
        surveyId,
        distributionId,
        expiresAtValue,
      )
      setSecret(replacement)
      setDistributions((current) => [distributionMetadata(replacement), ...current.filter((item) => item.id !== replacement.id)])
      await load()
    } catch (rotateError) {
      setError(rotateError instanceof Error ? rotateError.message : "We could not rotate the distribution link.")
    } finally {
      setAction(null)
    }
  }

  const performRevoke = async (distributionId: string) => {
    if (!canManage) return
    setAction("revoke")
    setError(null)
    try {
      await revokeDistribution(surveyId, distributionId)
      await load()
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "We could not revoke the distribution link.")
    } finally {
      setAction(null)
    }
  }

  const handleToggleActive = async (checked: boolean) => {
    if (!canManage) return
    if (checked) {
      await performCreate()
    } else if (activeDistribution) {
      await performRevoke(activeDistribution.id)
    }
  }

  const copyLink = async () => {
    if (!issuedUrl) return
    setClipboardError(null)
    try {
      await navigator.clipboard.writeText(issuedUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (copyError) {
      setClipboardError(copyError instanceof Error ? copyError.message : "We could not copy the link.")
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      loadId.current += 1
      setSecret(null)
      setCopied(false)
      setClipboardError(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl sm:max-w-xl p-0 overflow-hidden bg-white border-0 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] sm:rounded-2xl">
        <DialogHeader className="px-8 pt-7 pb-5 border-b border-slate-100 pr-14 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 border border-slate-100">
                <Share2 className="size-4.5 text-slate-700" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-lg font-medium text-slate-900 tracking-tight text-left">Distribute Survey</DialogTitle>
                <DialogDescription className="text-sm text-slate-500 text-left mt-0.5 truncate pr-2">Manage your survey&apos;s shareable link.</DialogDescription>
              </div>
            </div>
            {canManage && (
              <div className="flex items-center gap-3 sm:pl-4 sm:border-l border-slate-100 pt-2 sm:pt-0 shrink-0">
                <label className="text-sm font-medium text-slate-700 cursor-pointer whitespace-nowrap" htmlFor="link-active-toggle">
                  Link active
                </label>
                <Switch
                  id="link-active-toggle"
                  checked={hasActiveLink}
                  onCheckedChange={(c) => void handleToggleActive(c)}
                  disabled={loading || action !== null}
                />
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6 bg-slate-50/30 px-8 pb-8 pt-6 min-w-0">
          {error && <p className="rounded-lg border border-red-200/50 bg-red-50/50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
          {clipboardError && <p className="rounded-lg border border-red-200/50 bg-red-50/50 px-4 py-3 text-sm text-red-700" role="alert">Clipboard error: {clipboardError}</p>}

          {loading ? (
            <div className="space-y-4 min-w-0 animate-in fade-in-0 duration-200">
              <div className="flex flex-col gap-3 min-w-0">
                <Skeleton className="h-4 w-24 bg-slate-200/60" />
                <div className="flex flex-col sm:flex-row gap-2">
                  <Skeleton className="h-10 flex-1 rounded-lg bg-slate-200/60" />
                  <Skeleton className="h-10 w-full sm:w-[72px] rounded-lg shrink-0 bg-slate-200/60" />
                </div>
              </div>

              {canManage && (
                <>
                  <div className="my-6 border-t border-slate-200/60" />
                  <div className="space-y-4 min-w-0">
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-4 w-32 bg-slate-200/60" />
                      <Skeleton className="h-3 w-64 bg-slate-200/60" />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-end gap-3 min-w-0">
                      <div className="flex flex-col gap-2 w-full sm:flex-1">
                        <Skeleton className="h-4 w-28 bg-slate-200/60" />
                        <Skeleton className="h-10 w-full rounded-lg bg-slate-200/60" />
                      </div>
                      <Skeleton className="h-10 w-full sm:w-[156px] rounded-lg shrink-0 bg-slate-200/60" />
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4 min-w-0">
              {!hasActiveLink ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
                  <p className="text-sm font-medium text-slate-900 mb-1">Survey link is disabled</p>
                  <p className="text-xs text-slate-500 mb-6">Enable the link to start collecting responses.</p>
                  {canManage && (
                    <div className="flex flex-col gap-4 max-w-[280px] mx-auto">
                      <div className="flex flex-col text-left gap-1.5">
                        <label className="text-sm font-medium text-slate-700" htmlFor="create-expiry-select">
                          Link expires in
                        </label>
                        <ExpirySelect
                          value={expiryDays}
                          onChange={setExpiryDays}
                          disabled={loading || action !== null}
                        />
                      </div>
                      <Button onClick={() => void handleToggleActive(true)} disabled={loading || action !== null} className="w-full">
                        {action === "create" ? <Loader2 className="animate-spin size-4 mr-2" /> : null}
                        Enable Link
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4 min-w-0">
                  <div className="flex flex-col gap-3 min-w-0">
                    <label className="text-sm font-medium text-slate-700">Shareable Link</label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 pl-3 min-w-0">
                      <code className="min-w-0 flex-1 truncate text-sm text-emerald-900">{issuedUrl || "Token unavailable after reload."}</code>
                      <Button variant="outline" size="sm" onClick={() => void copyLink()} disabled={!issuedUrl} className="w-full sm:w-auto shrink-0 bg-white">
                        {copied ? <CheckCircle2 data-icon="inline-start" className="mr-1.5 size-4" /> : <Copy data-icon="inline-start" className="mr-1.5 size-4" />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>

                  {canManage && (
                    <>
                      <div className="my-6 border-t border-slate-200/60" />
                      <div className="space-y-4 min-w-0">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-medium text-slate-700">
                            Regenerate Link
                          </label>
                          <p className="text-xs text-slate-500">
                            Generate a fresh link. The current link will be instantly revoked.
                          </p>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-end gap-3 min-w-0">
                          <div className="flex flex-col gap-1.5 w-full sm:flex-1">
                            <label className="text-sm font-medium text-slate-700" htmlFor="rotate-expiry-select">
                              Link expires in
                            </label>
                            <ExpirySelect
                              value={expiryDays}
                              onChange={setExpiryDays}
                              disabled={loading || action !== null}
                            />
                          </div>
                          <Button variant="secondary" onClick={() => void performRotate(activeDistribution.id)} disabled={loading || action !== null} className="h-10 px-4 w-full sm:w-auto whitespace-nowrap shrink-0">
                            {action === "rotate" ? <Loader2 className="animate-spin size-4 mr-2" /> : <RefreshCw className="size-4 mr-2" />}
                            Generate new link
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <DistributionLifecycle
                distributions={distributions}
                canManage={canManage}
                action={action}
                onRevoke={(distributionId) => void performRevoke(distributionId)}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
