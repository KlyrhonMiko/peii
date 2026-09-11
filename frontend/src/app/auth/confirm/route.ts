import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import {
  issuePasswordResetGrant,
  PASSWORD_RESET_GRANT_COOKIE,
  passwordResetGrantCookieOptions,
} from "@/lib/password-reset-grant"
import { applicationOrigin } from "@/lib/safe-redirect"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function callbackType(value: string | null): Extract<EmailOtpType, "invite" | "recovery"> | null {
  return value === "invite" || value === "recovery" ? value : null
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = callbackType(request.nextUrl.searchParams.get("type"))
  const destination = new URL("/reset-password", applicationOrigin())
  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=confirmation", applicationOrigin()))
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error || !data.session?.access_token) {
    return NextResponse.redirect(new URL("/login?error=confirmation", applicationOrigin()))
  }

  const failedConfirmation = async () => {
    try {
      // A successful OTP exchange persists a session through the server client's cookie adapter.
      // Local sign-out removes those cookies even when the remote session is already unavailable.
      await supabase.auth.signOut({ scope: "local" })
    } catch {
      // Redirect remains safe if cookie/session cleanup encounters an unexpected transport error.
    }
    return NextResponse.redirect(new URL("/login?error=confirmation", applicationOrigin()))
  }

  try {
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(data.session.access_token)
    const claims = claimsData?.claims
    const subject = claims?.sub
    const sessionId = claims?.session_id
    if (claimsError || typeof subject !== "string" || typeof sessionId !== "string") {
      return failedConfirmation()
    }
    const response = NextResponse.redirect(destination)
    response.cookies.set(
      PASSWORD_RESET_GRANT_COOKIE,
      issuePasswordResetGrant(subject, sessionId, type),
      passwordResetGrantCookieOptions,
    )
    return response
  } catch {
    return failedConfirmation()
  }
}
