"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams, useRouter, usePathname } from "next/navigation"

import { loginAction } from "@/app/login/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Loader2, GraduationCap, AlertCircle } from "lucide-react"

export function LoginModal({ children }: { children?: React.ReactNode }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  
  const returnTo = searchParams.get("returnTo") ?? "/researcher/dashboard"
  const showLogin = searchParams.get("login") === "true"

  const [open, setOpen] = useState(false)
  const [state, formAction, isPending] = useActionState(loginAction, null)

  useEffect(() => {
    if (showLogin) {
      const timer = setTimeout(() => setOpen(true), 0)
      return () => clearTimeout(timer)
    }
  }, [showLogin])

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen && showLogin) {
      // Remove login=true from the URL when closing the modal manually
      const params = new URLSearchParams(searchParams.toString())
      params.delete("login")
      params.delete("returnTo")
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
  }

  return (
    <>
      {children ? (
        <div onClick={() => setOpen(true)} className="inline-block w-full sm:w-auto">
          {children}
        </div>
      ) : (
        <Button
          className="h-9 px-5 text-[14px] font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-lg shadow-sm transition-all"
          onClick={() => setOpen(true)}
        >
          Login
        </Button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[400px] p-0 rounded-[24px] border-0 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.15)] overflow-hidden bg-white">
          <div className="p-8 pb-8">
            <div className="flex justify-center mb-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-slate-900 text-white shadow-md shadow-slate-900/10">
                <GraduationCap className="h-7 w-7" />
              </div>
            </div>
            
            <DialogHeader className="text-center pb-2">
              <DialogTitle className="text-[24px] font-extrabold text-slate-900 tracking-tight text-center">
                Welcome back
              </DialogTitle>
              <DialogDescription className="text-[15px] text-slate-500 mt-2 text-center font-medium px-4">
                Enter your credentials to access the researcher portal.
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="grid gap-5 mt-4">
              <input name="returnTo" type="hidden" value={returnTo} />
              
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-[13px] font-bold text-slate-700" htmlFor="identifier">
                    Username or email
                  </label>
                  <Input
                    autoComplete="username"
                    id="identifier"
                    name="identifier"
                    required
                    placeholder="name@example.com"
                    className="h-12 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:ring-4 focus-visible:ring-slate-900/10 focus-visible:border-slate-900 transition-all text-[15px] shadow-sm px-4"
                  />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-bold text-slate-700" htmlFor="password">
                      Password
                    </label>
                    <Link
                      className="text-[13px] font-semibold text-slate-500 hover:text-slate-900 transition-colors"
                      href="/?forgot-password=true"
                      onClick={() => handleOpenChange(false)}
                    >
                      Forgot?
                    </Link>
                  </div>
                  <Input
                    autoComplete="current-password"
                    id="password"
                    name="password"
                    required
                    type="password"
                    placeholder="••••••••"
                    className="h-12 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:ring-4 focus-visible:ring-slate-900/10 focus-visible:border-slate-900 transition-all text-[15px] shadow-sm px-4"
                  />
                </div>
              </div>

              {state?.error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 mt-1">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-[13px] font-medium leading-relaxed">
                    {state.error === "invalid" 
                      ? "Invalid username, email, or password." 
                      : state.error === "rate-limited"
                        ? `Too many sign-in attempts. Please try again${state.retryAfter === null ? " later" : ` in ${state.retryAfter} seconds`}.`
                        : "Sign-in is temporarily unavailable. Please try again later."}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isPending}
                className="w-full h-12 rounded-xl text-[15px] font-semibold mt-1 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-900/10 active:scale-[0.98] transition-all"
              >
                {isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                Sign in
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
