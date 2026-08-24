import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import { applicationOrigin, safeInternalPath } from "@/lib/safe-redirect"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function callbackType(value: string | null): Extract<EmailOtpType, "invite" | "recovery"> | null {
  return value === "invite" || value === "recovery" ? value : null
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = callbackType(request.nextUrl.searchParams.get("type"))
  const destination = new URL(safeInternalPath(request.nextUrl.searchParams.get("next")), applicationOrigin())
  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=confirmation", applicationOrigin()))
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) {
    return NextResponse.redirect(new URL("/login?error=confirmation", applicationOrigin()))
  }
  return NextResponse.redirect(destination)
}
