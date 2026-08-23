import Link from "next/link"

import { loginAction } from "./actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface LoginPageProps {
  searchParams: Promise<{ error?: string; returnTo?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
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
