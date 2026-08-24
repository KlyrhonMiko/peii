import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { supabaseCookieOptions } from "./cookie-options"

function settings() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error("Supabase Auth is not configured")
  }
  return { url, key }
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const { url, key } = settings()

  return createServerClient(url, key, {
    cookieOptions: supabaseCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, { ...options, ...supabaseCookieOptions })
          })
        } catch {
          // Server Components cannot persist refreshed cookies; proxy.ts does so.
        }
      },
    },
  })
}
