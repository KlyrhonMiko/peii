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
        variant="default"
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
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              <path d="M1 1h22v22H1z" fill="none" />
            </svg>
            Continue with Google
          </>
        )}
      </Button>
      {pending && (
        <p className="sr-only" role="status" aria-live="polite">
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
