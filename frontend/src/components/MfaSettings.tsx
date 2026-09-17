"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState, type FormEvent } from "react"

import {
  enrollTotpAction,
  unenrollTotpAction,
  verifyTotpEnrollmentAction,
  type MfaActionState,
  type MfaEnrollment,
} from "@/app/mfa/actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { PortalMfaFactor } from "@/lib/auth"
import { formatDate } from "@/lib/utils"

const INITIAL_STATE: MfaActionState = { status: "idle", message: "" }

function ActionStatus({ state }: { state: MfaActionState }) {
  if (state.status === "idle") return null
  return (
    <p
      aria-live="polite"
      className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-foreground"}
      role="status"
    >
      {state.message}
    </p>
  )
}

export function MfaSettings({ factors }: { factors: PortalMfaFactor[] }) {
  const router = useRouter()
  const [pendingEnrollment, setPendingEnrollment] = useState<MfaEnrollment | null>(null)
  const [enrollmentState, enrollmentAction, enrolling] = useActionState(
    async (state: MfaActionState, formData: FormData) => {
      const result = await enrollTotpAction(state, formData)
      if (result.enrollment) setPendingEnrollment(result.enrollment)
      if (formData.get("intent") === "cancel" && result.status === "idle") setPendingEnrollment(null)
      return { status: result.status, message: result.message }
    },
    INITIAL_STATE,
  )
  const [verificationState, verificationAction, verifying] = useActionState(
    async (state: MfaActionState, formData: FormData) => {
      const result = await verifyTotpEnrollmentAction(state, formData)
      if (result.status === "success") setPendingEnrollment(null)
      return { status: result.status, message: result.message }
    },
    INITIAL_STATE,
  )
  const [unenrollState, unenrollAction, unenrolling] = useActionState(unenrollTotpAction, INITIAL_STATE)

  useEffect(() => {
    if (verificationState.status !== "success") return
    router.refresh()
  }, [router, verificationState.status])

  useEffect(() => {
    if (unenrollState.status === "success") router.refresh()
  }, [router, unenrollState.status])

  function confirmEnrollment(event: FormEvent<HTMLFormElement>) {
    if (typeof window !== "undefined" && !window.confirm("Continue setting up an authenticator app? Verifying it will sign out your other active sessions.")) {
      event.preventDefault()
    }
  }

  function confirmUnenroll(event: FormEvent<HTMLFormElement>) {
    const message = factors.length === 1
      ? "Remove your only verified authenticator? Future sign-ins will not require MFA until you enroll another factor."
      : "Remove this authenticator? Keep at least one other verified factor available for MFA sign-in."
    if (typeof window !== "undefined" && !window.confirm(message)) {
      event.preventDefault()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle id="mfa-settings-title">Authenticator app</CardTitle>
        <CardDescription>
          Add a time-based one-time password (TOTP) factor to protect portal sign-in. You can keep a second authenticator as a backup.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Verification signs out other active sessions. Keep your authenticator app available and complete setup before closing this browser.
        </div>

        {factors.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Verified factors</h3>
            <ul aria-label="Verified authenticator factors" className="flex flex-col gap-2">
              {factors.map((factor) => (
                <li className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between" key={factor.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{factor.friendlyName}</p>
                    <p className="text-xs text-muted-foreground">Verified {formatDate(factor.createdAt)}</p>
                  </div>
                  <form action={unenrollAction} onSubmit={confirmUnenroll}>
                    <input name="factor_id" type="hidden" value={factor.id} />
                    <Button disabled={unenrolling} type="submit" variant="destructive">
                      {unenrolling ? "Removing…" : "Remove"}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
            <ActionStatus state={unenrollState} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No authenticator app is enrolled yet.</p>
        )}

        {pendingEnrollment ? (
          <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
            <div>
              <h3 className="text-sm font-medium">Finish setup for {pendingEnrollment.friendlyName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">Scan this QR code with your authenticator app. If scanning is unavailable, enter the setup key manually.</p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <Image
                alt="QR code for authenticator app setup"
                className="size-48 rounded-md border border-border bg-white p-2"
                height={192}
                src={pendingEnrollment.qrCode}
                unoptimized
                width={192}
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="mfa-setup-key">Setup key</label>
                <code className="break-all rounded-md bg-muted p-2 text-xs" id="mfa-setup-key">{pendingEnrollment.secret}</code>
                <p className="text-xs text-muted-foreground">This key is shown only while setup is in progress. Treat it like a password.</p>
              </div>
            </div>
            <form action={verificationAction} className="flex flex-col gap-3">
              <input name="factor_id" type="hidden" value={pendingEnrollment.factorId} />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="mfa-enrollment-code">Six-digit verification code</label>
                <Input
                  autoComplete="one-time-code"
                  id="mfa-enrollment-code"
                  inputMode="numeric"
                  maxLength={6}
                  minLength={6}
                  name="code"
                  pattern="[0-9]{6}"
                  required
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={verifying} type="submit">{verifying ? "Verifying…" : "Verify authenticator"}</Button>
                <ActionStatus state={verificationState} />
              </div>
            </form>
            <form action={enrollmentAction}>
              <input name="intent" type="hidden" value="cancel" />
              <input name="factor_id" type="hidden" value={pendingEnrollment.factorId} />
              <Button disabled={enrolling} type="submit" variant="outline">
                {enrolling ? "Cancelling…" : "Cancel setup"}
              </Button>
            </form>
          </div>
        ) : null}

        {!pendingEnrollment ? (
          <form action={enrollmentAction} className="flex flex-col gap-3" onSubmit={confirmEnrollment}>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="mfa-friendly-name">Authenticator name</label>
              <Input defaultValue="PEII Authenticator" id="mfa-friendly-name" maxLength={100} name="friendly_name" />
              <p className="text-xs text-muted-foreground">Use a name that helps you tell this factor apart from a backup authenticator.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={enrolling} type="submit">{enrolling ? "Starting setup…" : factors.length > 0 ? "Add backup authenticator" : "Set up authenticator"}</Button>
              <ActionStatus state={enrollmentState} />
            </div>
          </form>
        ) : null}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">PEII does not display recovery codes. If you keep MFA enabled, maintain at least one verified factor you can access.</p>
      </CardFooter>
    </Card>
  )
}
