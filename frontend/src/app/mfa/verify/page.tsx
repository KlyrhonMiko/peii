import { redirect } from "next/navigation"

import { logoutAction } from "@/app/login/actions"
import { MfaVerifyForm } from "@/components/MfaVerifyForm"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getPortalMfaChallenge } from "@/lib/auth"
import { safeMfaReturnTo } from "@/lib/safe-redirect"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Verify authenticator | PEII",
}

interface MfaVerifyPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>
}

export default async function MfaVerifyPage({ searchParams }: MfaVerifyPageProps) {
  const params = await searchParams
  const returnTo = safeMfaReturnTo(typeof params.returnTo === "string" ? params.returnTo : undefined)
  const mfa = await getPortalMfaChallenge()

  if (mfa.currentLevel === "aal2" || mfa.nextLevel !== "aal2") redirect(returnTo)

  if (mfa.factors.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/20 p-5">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Additional verification unavailable</CardTitle>
            <CardDescription>Your account requires multi-factor authentication, but no supported authenticator app is available in this session. Contact an administrator for account recovery.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={logoutAction}>
              <Button type="submit" variant="outline">Sign out</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/20 p-5">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verify your identity</CardTitle>
          <CardDescription>Your account has multi-factor authentication enabled. Enter a code to continue to the PEII portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <MfaVerifyForm factors={mfa.factors} returnTo={returnTo} />
        </CardContent>
      </Card>
    </main>
  )
}
