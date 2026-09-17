"use client"

import { useActionState } from "react"

import {
  changePasswordAction,
  requestPasswordReauthenticationAction,
  signOutEverywhereAction,
  updateProfileAction,
  type SettingsActionState,
} from "@/app/settings/actions"
import { MfaSettings } from "@/components/MfaSettings"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { PortalMfaFactor, PortalUser } from "@/lib/auth"

const INITIAL_STATE: SettingsActionState = { status: "idle", message: "" }

function ActionStatus({ state }: { state: SettingsActionState }) {
  if (state.status === "idle") return null
  return (
    <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-foreground"} role="status">
      {state.message}
    </p>
  )
}

export function SettingsAccountForms({ user, mfaFactors }: { user: PortalUser; mfaFactors: PortalMfaFactor[] }) {
  const [profileState, profileAction, savingProfile] = useActionState(updateProfileAction, INITIAL_STATE)
  const [verificationState, verificationAction, sendingVerification] = useActionState(requestPasswordReauthenticationAction, INITIAL_STATE)
  const [passwordState, passwordAction, savingPassword] = useActionState(changePasswordAction, INITIAL_STATE)
  const [signOutState, signOutAction, signingOut] = useActionState(signOutEverywhereAction, INITIAL_STATE)
  // Saved server values require fresh uncontrolled Base UI fields after revalidation.
  const profileVersion = JSON.stringify([user.first_name, user.last_name, user.middle_name, user.username, user.contact])

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Keep your contact details up to date. Your email is managed by your account administrator.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={profileAction} className="flex flex-col gap-4" id="profile-settings-form" key={profileVersion}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="settings-first-name">First name</label>
                <Input autoComplete="given-name" defaultValue={user.first_name} id="settings-first-name" maxLength={100} name="first_name" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="settings-last-name">Last name</label>
                <Input autoComplete="family-name" defaultValue={user.last_name} id="settings-last-name" maxLength={100} name="last_name" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="settings-middle-name">Middle name <span className="text-muted-foreground">(optional)</span></label>
                <Input autoComplete="additional-name" defaultValue={user.middle_name ?? ""} id="settings-middle-name" maxLength={100} name="middle_name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="settings-username">Username</label>
                <Input autoComplete="username" defaultValue={user.username} id="settings-username" maxLength={100} name="username" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="settings-contact">Contact <span className="text-muted-foreground">(optional)</span></label>
                <Input autoComplete="tel" defaultValue={user.contact ?? ""} id="settings-contact" maxLength={50} name="contact" type="tel" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="settings-email">Email</label>
                <Input autoComplete="email" disabled id="settings-email" type="email" value={user.email} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={savingProfile} type="submit">{savingProfile ? "Saving…" : "Save profile"}</Button>
              <ActionStatus state={profileState} />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Request a verification code by email, then use it to set a new password.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={verificationAction} className="flex flex-wrap items-center gap-3">
            <Button disabled={sendingVerification} type="submit" variant="outline">
              {sendingVerification ? "Sending…" : "Email verification code"}
            </Button>
            <ActionStatus state={verificationState} />
          </form>
          <form action={passwordAction} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor="settings-nonce">Verification code</label>
                <Input autoComplete="one-time-code" id="settings-nonce" maxLength={512} name="nonce" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="settings-password">New password</label>
                <Input autoComplete="new-password" id="settings-password" maxLength={256} minLength={12} name="password" required type="password" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" htmlFor="settings-confirmation">Confirm new password</label>
                <Input autoComplete="new-password" id="settings-confirmation" maxLength={256} minLength={12} name="confirmation" required type="password" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={savingPassword} type="submit">{savingPassword ? "Updating…" : "Change password"}</Button>
              <ActionStatus state={passwordState} />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Revoke sign-in sessions across devices. Already-issued access tokens can remain valid until they expire. A session list and individual device controls are not available yet.</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-wrap items-center gap-3">
          <form action={signOutAction}>
            <Button disabled={signingOut} type="submit" variant="outline">{signingOut ? "Signing out…" : "Sign out everywhere"}</Button>
          </form>
          <ActionStatus state={signOutState} />
        </CardFooter>
      </Card>

      <MfaSettings factors={mfaFactors} />
    </div>
  )
}
