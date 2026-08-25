"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, Copy, Link, Loader2, RefreshCw, RotateCcw, Share2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createDistribution, fetchDistributions, revokeDistribution, rotateDistribution } from "@/lib/surveys"
import type { Distribution, DistributionSecret } from "@/lib/surveys"
import { cn } from "@/lib/utils"

interface SurveyDistributionManagerProps {
  surveyId: string
  open: boolean
  canManage: boolean
  onOpenChange: (open: boolean) => void
}

const DEFAULT_EXPIRY_DAYS = 30

function defaultExpiryValue(): string {
  const expiry = new Date()
  expiry.setDate(expiry.getDate() + DEFAULT_EXPIRY_DAYS)
  expiry.setMinutes(expiry.getMinutes() - expiry.getTimezoneOffset())
  return expiry.toISOString().slice(0, 16)
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

function statusLabel(distribution: Distribution): string {
  return distribution.status[0]?.toUpperCase() + distribution.status.slice(1)
}

function statusGuidance(distribution: Distribution): string {
  switch (distribution.status) {
    case "active":
      return "This link can accept responses until it expires."
    case "expired":
      return "This link has expired. Issue a new link with a new expiry date."
    case "revoked":
      return "This link was revoked and cannot accept responses. Issue a new link to continue."
    case "suspended":
      return "This link is suspended and cannot accept responses until it is restored by the backend."
  }
}

function secretForDistribution(distribution: Distribution, secret: DistributionSecret | null): DistributionSecret | null {
  return secret?.id === distribution.id ? secret : null
}

export function SurveyDistributionManager({
  surveyId,
  open,
  canManage,
  onOpenChange,
}: SurveyDistributionManagerProps) {
  const [distributions, setDistributions] = useState<Distribution[]>([])
  const [secret, setSecret] = useState<DistributionSecret | null>(null)
  const [expiryAt, setExpiryAt] = useState(defaultExpiryValue)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<"create" | "rotate" | "revoke" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clipboardError, setClipboardError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const loadId = useRef(0)

  const load = useCallback(async (hideSecret: boolean) => {
    const requestId = ++loadId.current
    setLoading(true)
    setError(null)
    if (hideSecret) {
      setSecret(null)
      setCopied(false)
    }
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
      void load(true)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [load, open])

  const issuedUrl = useMemo(() => {
    if (!secret || typeof window === "undefined") return null
    return `${window.location.origin}/survey/${secret.token}`
  }, [secret])

  const performCreate = async () => {
    if (!canManage || !expiryAt) return
    setAction("create")
    setError(null)
    setClipboardError(null)
    try {
      const created = await createDistribution(surveyId, new Date(expiryAt).toISOString())
      setSecret(created)
      setDistributions((current) => [created, ...current.filter((item) => item.id !== created.id)])
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "We could not issue a distribution link.")
    } finally {
      setAction(null)
    }
  }

  const performRotate = async (distributionId: string) => {
    if (!canManage || !expiryAt) return
    setAction("rotate")
    setError(null)
    setClipboardError(null)
    try {
      const replacement = await rotateDistribution(
        surveyId,
        distributionId,
        new Date(expiryAt).toISOString(),
      )
      setSecret(replacement)
      setDistributions((current) => [replacement, ...current.filter((item) => item.id !== replacement.id)])
      await load(false)
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
      setSecret((current) => (current?.id === distributionId ? null : current))
      await load(false)
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "We could not revoke the distribution link.")
    } finally {
      setAction(null)
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
      <DialogContent className="max-w-xl p-0 overflow-hidden bg-white border-slate-200 shadow-2xl sm:rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200/50">
              <Share2 className="size-5 text-slate-700" />
            </div>
            <div>
              <DialogTitle>Distribute Survey</DialogTitle>
              <DialogDescription>Create and manage shareable links.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 bg-slate-50/30 px-6 pb-6 pt-5">
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Tokens are shown only once when a link is issued. Reloading this list does not reveal a token again.
          </p>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
          {clipboardError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">Clipboard error: {clipboardError}</p>}

          {canManage && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-end gap-3">
                <label className="flex-1 space-y-1.5 text-sm font-medium text-slate-700">
                  Expiry date and time
                  <input
                    aria-label="Distribution expiry"
                    type="datetime-local"
                    value={expiryAt}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(event) => setExpiryAt(event.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal"
                  />
                </label>
                <Button onClick={() => void performCreate()} disabled={loading || action !== null || !expiryAt}>
                  {action === "create" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Link data-icon="inline-start" />}
                  Issue new link
                </Button>
              </div>
              <p className="text-xs text-slate-500">The UI defaults to 30 days; the selected expiry is sent explicitly.</p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-10" role="status"><Loader2 className="size-6 animate-spin text-slate-400" /></div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Link lifecycle</h3>
                <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={action !== null}>
                  <RefreshCw data-icon="inline-start" /> Reload
                </Button>
              </div>
              {distributions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
                  <p className="text-sm font-medium text-slate-700">No distribution links issued</p>
                  <p className="mt-1 text-xs text-slate-500">Use Issue new link to create the first link.</p>
                </div>
              ) : distributions.map((distribution) => {
                const distributionSecret = secretForDistribution(distribution, secret)
                const isActionForThis = action !== null && distributionSecret?.id === distribution.id
                return (
                  <div key={distribution.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn("size-2 rounded-full", distribution.status === "active" ? "bg-emerald-500" : "bg-slate-400")} />
                          <span className="font-medium text-slate-800">{statusLabel(distribution)}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{statusGuidance(distribution)}</p>
                      </div>
                      {canManage && distribution.status === "active" && (
                        <Button variant="ghost" size="sm" onClick={() => void performRevoke(distribution.id)} disabled={action !== null} className="text-red-600 hover:bg-red-50 hover:text-red-700">
                          {action === "revoke" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null} Revoke
                        </Button>
                      )}
                    </div>
                    <dl className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                      <div><dt className="inline font-medium text-slate-600">Created: </dt><dd className="inline">{formatDate(distribution.createdAt)}</dd></div>
                      <div><dt className="inline font-medium text-slate-600">Expires: </dt><dd className="inline">{formatDate(distribution.expiresAt)}</dd></div>
                    </dl>
                    {distributionSecret && issuedUrl ? (
                      <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                        <code className="min-w-0 flex-1 truncate text-xs text-emerald-900">{issuedUrl}</code>
                        <Button variant="outline" size="sm" onClick={() => void copyLink()}>
                          {copied ? <CheckCircle2 data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                          {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    ) : distribution.status === "active" && canManage ? (
                      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                        <span className="text-xs text-slate-500">Token unavailable after reload.</span>
                        <Button variant="outline" size="sm" onClick={() => void performRotate(distribution.id)} disabled={action !== null}>
                          {isActionForThis || action === "rotate" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RotateCcw data-icon="inline-start" />}
                          Issue new link
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
