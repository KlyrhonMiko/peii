import type { CookieOptions } from "@supabase/ssr"

export const supabaseCookieOptions: CookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
}
