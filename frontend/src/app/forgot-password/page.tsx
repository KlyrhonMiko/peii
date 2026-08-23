import Link from "next/link"

import { requestPasswordRecoveryAction } from "./actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface ForgotPasswordPageProps {
  searchParams: Promise<{ sent?: string }>
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
        </CardHeader>
        <CardContent>
          {params.sent === "1" ? (
            <p className="text-sm text-muted-foreground" role="status">
              If the account exists, a recovery link has been sent to its email address.
            </p>
          ) : (
            <form action={requestPasswordRecoveryAction} className="grid gap-4">
              <label className="grid gap-1.5 text-sm font-medium" htmlFor="email">
                Email address
                <Input autoComplete="email" id="email" name="email" required type="email" />
              </label>
              <Button type="submit">Send recovery link</Button>
            </form>
          )}
          <Link className="mt-4 block text-center text-sm text-muted-foreground underline" href="/login">
            Return to sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
