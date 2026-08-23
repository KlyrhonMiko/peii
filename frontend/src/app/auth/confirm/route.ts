import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import { createSupabaseServerClient } from "@/lib/supabase/server"

function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/researcher/dashboard"
  }
  return value
}

function callbackType(value: string | null): Extract<EmailOtpType, "invite" | "recovery"> | null {
  return value === "invite" || value === "recovery" ? value : null
}

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash")
  const type = callbackType(request.nextUrl.searchParams.get("type"))
  const destination = new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url)
  if (!tokenHash || !type) {
    destination.pathname = "/login"
    destination.searchParams.set("error", "confirmation")
    return NextResponse.redirect(destination)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) {
    destination.pathname = "/login"
    destination.searchParams.set("error", "confirmation")
  }
  return NextResponse.redirect(destination)
}
