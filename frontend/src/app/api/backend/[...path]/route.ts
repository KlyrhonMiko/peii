import { NextResponse, type NextRequest } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isAllowedBackendRequest } from "@/lib/backend-proxy-policy"

const FORWARDED_HEADERS = ["content-type", "idempotency-key", "x-request-id"]
const RESPONSE_HEADERS = ["content-type", "x-request-id"]

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) return NextResponse.json({ message: "Backend is not configured." }, { status: 503 })
  const { path } = await context.params
  if (!isAllowedBackendRequest(request.method, path)) {
    return NextResponse.json({ message: "Not found." }, { status: 404 })
  }
  const supabase = await createSupabaseServerClient()
  const { data: claims } = await supabase.auth.getClaims()
  const { data } = await supabase.auth.getSession()
  const headers = new Headers()
  FORWARDED_HEADERS.forEach((name) => {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  })
  if (claims?.claims && data.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`)
  }
  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer()
  }
  const response = await fetch(
    `${backendUrl}/${path.join("/")}${request.nextUrl.search}`,
    init,
  )
  const responseHeaders = new Headers()
  RESPONSE_HEADERS.forEach((name) => {
    const value = response.headers.get(name)
    if (value) responseHeaders.set(name, value)
  })
  return new NextResponse(response.body, { status: response.status, headers: responseHeaders })
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT }
