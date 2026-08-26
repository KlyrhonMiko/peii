"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams, useRouter, usePathname } from "next/navigation"

import { requestPasswordRecoveryAction } from "@/app/forgot-password/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Loader2, KeyRound, AlertCircle, CheckCircle2 } from "lucide-react"

export function ForgotPasswordModal() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const showForgot = searchParams.get("forgot-password") === "true"

  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState(requestPasswordRecoveryAction, null)

  useEffect(() => {
    if (showForgot) {
      const timer = setTimeout(() => setOpen(true), 0)
      return () => clearTimeout(timer)
    }
  }, [showForgot])

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen && showForgot) {
      const params = new URLSearchParams(searchParams.toString())
      params.delete("forgot-password")
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px] p-0 rounded-[24px] border-0 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.15)] overflow-hidden bg-white">
        <div className="p-8 pb-8">
          <div className="flex justify-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-slate-900 text-white shadow-md shadow-slate-900/10">
              <KeyRound className="h-7 w-7" />
            </div>
          </div>
          
          <DialogHeader className="text-center pb-2">
            <DialogTitle className="text-[24px] font-extrabold text-slate-900 tracking-tight text-center">
              Reset password
            </DialogTitle>
            <DialogDescription className="text-[15px] text-slate-500 mt-2 text-center font-medium px-4">
              Enter your email and we&apos;ll send you a recovery link.
            </DialogDescription>
          </DialogHeader>

          {state?.sent ? (
            <div className="mt-4">
              <div className="flex flex-col items-center justify-center gap-3 p-6 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                <p className="text-[14px] font-medium text-center leading-relaxed">
                  If an account exists, a recovery link has been sent to your email.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl text-[15px] font-semibold mt-4 shadow-sm"
                onClick={() => handleOpenChange(false)}
              >
                Close
              </Button>
            </div>
          ) : (
            <form action={formAction} className="grid gap-5 mt-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-[13px] font-bold text-slate-700" htmlFor="email">
                    Email address
                  </label>
                  <Input
                    autoComplete="email"
                    id="email"
                    name="email"
                    required
                    type="email"
                    placeholder="name@example.com"
                    className="h-12 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:ring-4 focus-visible:ring-slate-900/10 focus-visible:border-slate-900 transition-all text-[15px] shadow-sm px-4"
                  />
                </div>
              </div>

              {state?.error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 mt-1">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[13px] font-medium leading-relaxed">
                    {state.error === "invalid" 
                      ? "Please enter a valid email address." 
                      : `We could not process that request right now. Please try again${state.retryAfter === null ? " later" : ` in ${state.retryAfter} seconds`}.`}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isPending}
                className="w-full h-12 rounded-xl text-[15px] font-semibold mt-1 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/10 active:scale-[0.98] transition-all"
              >
                {isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                Send recovery link
              </Button>
              
              <Link
                className="text-center text-[13px] font-semibold text-slate-500 hover:text-slate-900 transition-colors underline-offset-4 mt-2 block"
                href="/?login=true"
                onClick={() => handleOpenChange(false)}
              >
                Return to sign in
              </Link>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
