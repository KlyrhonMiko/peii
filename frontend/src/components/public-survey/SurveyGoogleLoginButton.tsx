"use client"

import { useState } from "react"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

interface SurveyGoogleLoginButtonProps {
  returnTo: string
}

type LoginState = "idle" | "pending" | "error"

function validatedProviderUrl(payload: unknown, returnTo: string): string | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("url" in payload) ||
    typeof payload.url !== "string"
  ) return null

  let providerUrl: URL
  try {
    providerUrl = new URL(payload.url)
  } catch {
    return null
  }

  const token = returnTo.slice("/survey/".length)
  let decodedToken = token
  try {
    decodedToken = decodeURIComponent(token)
  } catch {
    return null
  }

  if (
    (providerUrl.protocol !== "https:" && providerUrl.protocol !== "http:") ||
    providerUrl.username ||
    providerUrl.password ||
    providerUrl.hash ||
    payload.url.includes(token) ||
    payload.url.includes(decodedToken)
  ) return null

  return providerUrl.toString()
}

export function SurveyGoogleLoginButton({ returnTo }: SurveyGoogleLoginButtonProps) {
  const [state, setState] = useState<LoginState>("idle")
  const [error, setError] = useState<string | null>(null)
  const pending = state === "pending"

  const handleClick = async () => {
    if (pending) return

    setState("pending")
    setError(null)
    try {
      const response = await fetch("/auth/survey/google/start", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ returnTo }).toString(),
        credentials: "same-origin",
        cache: "no-store",
      })
      if (!response.ok) throw new Error("OAuth start failed")

      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        throw new Error("OAuth start response was invalid")
      }
      const providerUrl = validatedProviderUrl(payload, returnTo)
      if (!providerUrl) throw new Error("OAuth provider URL was invalid")

      window.location.assign(providerUrl)
    } catch {
      setState("error")
      setError("We could not start Google sign-in. Please try again.")
      window.location.assign(new URL("/survey/auth-error", window.location.origin).toString())
    }
  }

  return (
    <div className="grid gap-3">
      <Button
        className="min-h-11 w-full"
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-describedby={error ? "survey-google-login-error" : undefined}
        onClick={() => void handleClick()}
      >
        {pending ? (
          <>
            <Loader2 aria-hidden="true" className="animate-spin" />
            Starting Google sign-in…
          </>
        ) : (
          "Continue with Google"
        )}
      </Button>
      {pending && (
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          Starting Google sign-in…
        </p>
      )}
      {error && (
        <p id="survey-google-login-error" className="text-sm text-destructive" role="alert" aria-live="assertive">
          {error}
        </p>
      )}
    </div>
  )
}
