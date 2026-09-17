"use client"

import { useActionState, useState } from "react"

import { logoutAction } from "@/app/login/actions"
import { verifyMfaChallengeAction, type MfaActionState } from "@/app/mfa/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PortalMfaFactor } from "@/lib/auth"

const INITIAL_STATE: MfaActionState = { status: "idle", message: "" }

export function MfaVerifyForm({ factors, returnTo }: { factors: PortalMfaFactor[]; returnTo: string }) {
  const [state, formAction, isPending] = useActionState(verifyMfaChallengeAction, INITIAL_STATE)
  const firstFactor = factors[0]?.id ?? ""
  const [factorId, setFactorId] = useState(firstFactor)

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-4">
        <input name="returnTo" type="hidden" value={returnTo} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="mfa-factor">Authenticator app</label>
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            id="mfa-factor"
            name="factor_id"
            onChange={(event) => setFactorId(event.target.value)}
            required
            value={factorId}
          >
            {factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.friendlyName}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="mfa-code">Six-digit verification code</label>
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
          />
          <p className="text-xs text-muted-foreground" id="mfa-code-hint">Open the selected authenticator app and enter its current code.</p>
        </div>
        {state.status !== "idle" ? (
          <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-foreground"} role="alert">
            {state.message}
          </p>
        ) : null}
        <Button disabled={isPending || factors.length === 0} type="submit">{isPending ? "Verifying…" : "Verify and continue"}</Button>
      </form>
      <form action={logoutAction}>
        <Button className="w-full" type="submit" variant="outline">Sign out</Button>
      </form>
    </div>
  )
}
