import Link from "next/link"

import { loginAction } from "./actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface LoginPageProps {
  searchParams: Promise<{ error?: string; returnTo?: string; retryAfter?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const retryAfter = parseRetryAfter(params.retryAfter)
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to PEII</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="grid gap-4">
            <input name="returnTo" type="hidden" value={params.returnTo ?? ""} />
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="identifier">
              Username or email
              <Input autoComplete="username" id="identifier" name="identifier" required />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="password">
              Password
              <Input autoComplete="current-password" id="password" name="password" required type="password" />
            </label>
            {params.error === "invalid" ? (
              <p className="text-sm text-destructive" role="alert">
                Invalid username, email, or password.
              </p>
            ) : params.error === "rate-limited" ? (
              <p className="text-sm text-destructive" role="alert">
                Too many sign-in attempts. Please try again{retryAfter === null ? " later" : ` in ${retryAfter} seconds`}.
              </p>
            ) : params.error === "unavailable" ? (
              <p className="text-sm text-destructive" role="alert">
                Sign-in is temporarily unavailable. Please try again later.
              </p>
            ) : null}
            <Button type="submit">Sign in</Button>
            <Link className="text-center text-sm text-muted-foreground underline" href="/forgot-password">
              Forgot your password?
            </Link>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}

function parseRetryAfter(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null
  const seconds = Number(value)
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}
