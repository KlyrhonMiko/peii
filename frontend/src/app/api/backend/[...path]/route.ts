import { NextResponse, type NextRequest } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isAllowedBackendRequest } from "@/lib/backend-proxy-policy"
import { applicationOrigin } from "@/lib/safe-redirect"

const FORWARDED_HEADERS = ["content-type", "idempotency-key", "x-request-id"]
const RESPONSE_HEADERS = ["content-type", "x-request-id"]
const UNSAFE_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"])

function requiresTrailingSlash(path: string[]): boolean {
  if (path.length === 1) return path[0] === "surveys" || path[0] === "users"
  return (
    path.length === 3 &&
    path[0] === "surveys" &&
    ["sections", "questions", "distributions", "responses"].includes(path[2] ?? "")
  )
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) return NextResponse.json({ message: "Backend is not configured." }, { status: 503 })
  const { path } = await context.params
  if (!isAllowedBackendRequest(request.method, path)) {
    return NextResponse.json({ message: "Not found." }, { status: 404 })
  }
  if (UNSAFE_METHODS.has(request.method) && request.headers.get("origin") !== applicationOrigin()) {
    return NextResponse.json({ message: "Invalid request origin." }, { status: 403 })
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
  const upstreamPath = `${path.join("/")}${
    request.nextUrl.pathname.endsWith("/") || requiresTrailingSlash(path) ? "/" : ""
  }`
  const response = await fetch(
    `${backendUrl.replace(/\/$/, "")}/${upstreamPath}${request.nextUrl.search}`,
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
