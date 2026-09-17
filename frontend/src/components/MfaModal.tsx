"use client"

import { useActionState, useEffect, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"

import { logoutAction } from "@/app/login/actions"
import { verifyMfaChallengeAction, getMfaChallengeAction } from "@/app/mfa/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Loader2, ShieldCheck, AlertCircle } from "lucide-react"
import type { PortalMfaFactor } from "@/lib/auth"

export function MfaModal() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const returnTo = searchParams.get("returnTo") ?? "/researcher/dashboard"
  const showMfa = searchParams.get("mfa") === "true"

  const [open, setOpen] = useState(false)
  const [factors, setFactors] = useState<PortalMfaFactor[]>([])
  const [loading, setLoading] = useState(true)
  const [factorId, setFactorId] = useState("")
  const [error, setError] = useState<string | null>(null)
  
  const [state, formAction, isPending] = useActionState(verifyMfaChallengeAction, { status: "idle", message: "" })

  useEffect(() => {
    if (showMfa) {
      setOpen(true)
      setLoading(true)
      setError(null)
      
      getMfaChallengeAction().then(res => {
        setFactors(res.factors)
        if (res.factors.length > 0) {
          setFactorId(res.factors[0].id)
        }
        setLoading(false)
      }).catch(err => {
        setError(err.message || "Failed to load authenticator settings.")
        setLoading(false)
      })
    }
  }, [showMfa])

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen && showMfa) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("mfa")
      params.delete("returnTo")
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px] p-0 rounded-[24px] border-0 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.15)] overflow-hidden bg-white">
        <div className="p-8 pb-8">
          <div className="flex justify-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-slate-900 text-white shadow-md shadow-slate-900/10">
              <ShieldCheck className="h-7 w-7" />
            </div>
          </div>
          
          <DialogHeader className="text-center pb-2">
            <DialogTitle className="text-[24px] font-extrabold text-slate-900 tracking-tight text-center">
              Verify your identity
            </DialogTitle>
            <DialogDescription className="text-[15px] text-slate-500 mt-2 text-center font-medium px-4">
              Your account has multi-factor authentication enabled. Enter a code to continue to the PEII portal.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : factors.length === 0 ? (
            <div className="mt-4">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex items-start gap-2 p-3 bg-red-50 text-red-600 rounded-xl border border-red-100">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-[13px] font-medium leading-relaxed text-left">
                    {error || "No supported authenticator app is available in this session. Contact an administrator for account recovery."}
                  </p>
                </div>
                <form action={logoutAction} className="w-full">
                  <Button type="submit" variant="outline" className="w-full h-12 rounded-xl text-[15px] font-semibold">
                    Sign out
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <form action={formAction} className="grid gap-5 mt-4">
              <input name="returnTo" type="hidden" value={returnTo} />
              
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-[13px] font-bold text-slate-700" htmlFor="mfa-factor">
                    Authenticator app
                  </label>
                  <div className="relative">
                    <select
                      className="w-full h-12 rounded-xl bg-slate-50/50 border border-slate-200 focus-visible:ring-4 focus-visible:ring-slate-900/10 focus-visible:border-slate-900 transition-all text-[15px] shadow-sm px-4 appearance-none outline-none"
                      id="mfa-factor"
                      name="factor_id"
                      onChange={(event) => setFactorId(event.target.value)}
                      required
                      value={factorId}
                    >
                      {factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.friendlyName}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="grid gap-2">
                  <label className="text-[13px] font-bold text-slate-700" htmlFor="mfa-code">
                    Six-digit verification code
                  </label>
                  <Input
                    aria-describedby="mfa-code-hint"
                    autoComplete="one-time-code"
                    autoFocus
                    id="mfa-code"
                    inputMode="numeric"
                    maxLength={6}
                    minLength={6}
                    name="code"
                    pattern="[0-9]{6}"
                    required
                    placeholder="••••••"
                    className="h-12 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:ring-4 focus-visible:ring-slate-900/10 focus-visible:border-slate-900 transition-all text-[15px] shadow-sm px-4 tracking-[0.2em] font-medium text-center"
                  />
                  <p className="text-[12px] text-slate-500 mt-1" id="mfa-code-hint">
                    Open the selected authenticator app and enter its current code.
                  </p>
                </div>
              </div>

              {state.status !== "idle" && (
                <div className={`flex items-start gap-2 p-3 rounded-xl border mt-1 ${state.status === "error" ? "bg-red-50 text-red-600 border-red-100" : "bg-green-50 text-green-700 border-green-100"}`}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[13px] font-medium leading-relaxed">
                    {state.message}
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-3 mt-1">
                <Button
                  type="submit"
                  disabled={isPending || factors.length === 0}
                  className="w-full h-12 rounded-xl text-[15px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/10 active:scale-[0.98] transition-all"
                >
                  {isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  Verify and continue
                </Button>
                
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full h-12 rounded-xl text-[15px] font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={(e) => {
                    const form = e.currentTarget.closest("form")
                    if (form) {
                      form.action = logoutAction.toString() // this might not work for server actions on button click, better wrap in another form or call a handler
                    }
                  }}
                  formAction={logoutAction} // Native support in React/Next.js!
                >
                  Sign out
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
