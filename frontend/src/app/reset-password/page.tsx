import { resetPasswordAction } from "./actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface ResetPasswordPageProps {
  searchParams: Promise<{ error?: string }>
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={resetPasswordAction} className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="password">
              New password
              <Input autoComplete="new-password" id="password" name="password" minLength={12} required type="password" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium" htmlFor="confirmation">
              Confirm new password
              <Input autoComplete="new-password" id="confirmation" name="confirmation" minLength={12} required type="password" />
            </label>
            {params.error ? (
              <p className="text-sm text-destructive" role="alert">
                The password could not be updated. Use a matching password with at least 12 characters.
              </p>
            ) : null}
            <Button type="submit">Update password</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
