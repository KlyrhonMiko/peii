"use server"


export type ForgotPasswordState = {
  sent?: boolean;
  error?: "invalid" | "retry-later";
  retryAfter?: number | null;
} | null

export async function requestPasswordRecoveryAction(state: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = formData.get("email")
  if (typeof email !== "string") return { error: "invalid" }
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) throw new Error("BACKEND_INTERNAL_URL is not configured")
  const response = await fetch(`${backendUrl}/auth/password/recover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  })
  if (!response.ok) {
    const retryAfter = parseRetryAfter(response.headers.get("Retry-After"))
    return { error: "retry-later", retryAfter }
  }
  return { sent: true }
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const seconds = Number(value)
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null
}
