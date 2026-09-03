import { NextResponse, type NextRequest } from "next/server"

import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  canonicalizeBackendPath,
  isAllowedBackendRequest,
} from "@/lib/backend-proxy-policy"
import { applicationOrigin } from "@/lib/safe-redirect"

const FORWARDED_HEADERS = ["content-type", "idempotency-key", "x-request-id"]
const RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
  "pragma",
  "x-content-type-options",
  "referrer-policy",
  "x-request-id",
  "x-export-id",
  "expires",
  "content-security-policy",
  "cross-origin-resource-policy",
  "x-accel-buffering",
]
const UNSAFE_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"])
const MAX_PROXY_BODY_BYTES = 65536
const PROXY_BODY_TIMEOUT_MS = 15000
const BACKEND_HEADERS_TIMEOUT_MS = 15000

class BodyOverflowError extends Error {}
class BodyTimeoutError extends Error {}

function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { message },
    { status, headers: { "Cache-Control": "no-store" } },
  )
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The request was aborted.", "AbortError")
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    await reader.cancel()
  } catch {
    // The stream may already be closed or errored.
  }
}

async function readBoundedBody(request: NextRequest): Promise<ArrayBuffer | undefined> {
  if (!request.body) return undefined

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let abortHandler: (() => void) | undefined
  const deadline = Date.now() + PROXY_BODY_TIMEOUT_MS

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new BodyTimeoutError())
    }, Math.max(0, deadline - Date.now()))
  })
  const abortPromise = new Promise<never>((_, reject) => {
    abortHandler = () => {
      reject(abortReason(request.signal))
    }
    if (request.signal.aborted) {
      abortHandler()
    } else {
      request.signal.addEventListener("abort", abortHandler, { once: true })
    }
  })

  try {
    while (true) {
      const result = await Promise.race([reader.read(), timeoutPromise, abortPromise])
      if (result.done) break

      bytes += result.value.byteLength
      if (bytes > MAX_PROXY_BODY_BYTES) throw new BodyOverflowError()
      chunks.push(result.value)
    }
  } catch (error) {
    await cancelReader(reader)
    throw error
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    if (abortHandler) request.signal.removeEventListener("abort", abortHandler)
    try {
      reader.releaseLock()
    } catch {
      // Cancellation can settle a pending read after cleanup begins.
    }
  }

  const body = new ArrayBuffer(bytes)
  const bodyView = new Uint8Array(body)
  let offset = 0
  for (const chunk of chunks) {
    bodyView.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function contentLengthError(request: NextRequest): NextResponse | undefined {
  if (request.method === "GET" || request.method === "HEAD") return undefined

  const value = request.headers.get("content-length")
  if (value === null) return undefined
  if (!/^\d+$/.test(value)) return jsonError("Invalid request.", 400)

  const length = Number(value)
  if (!Number.isSafeInteger(length)) return jsonError("Invalid request.", 400)
  if (length > MAX_PROXY_BODY_BYTES) return jsonError("Request body too large.", 413)
  return undefined
}

function requiresTrailingSlash(path: string[]): boolean {
  if (path.length === 1) return path[0] === "surveys" || path[0] === "users"
  return (
    path.length === 3 &&
    path[0] === "surveys" &&
    ["sections", "questions", "responses"].includes(path[2] ?? "")
  )
}

function buildUpstreamUrl(
  backendUrl: string,
  path: string[],
  search: string,
  trailingSlash: boolean,
): string | undefined {
  let configuredUrl: URL
  try {
    configuredUrl = new URL(backendUrl)
  } catch {
    return undefined
  }

  if (
    !["http:", "https:"].includes(configuredUrl.protocol) ||
    configuredUrl.username ||
    configuredUrl.password ||
    configuredUrl.search ||
    configuredUrl.hash
  ) {
    return undefined
  }

  const apiPrefix = configuredUrl.pathname.replace(/\/+$/u, "") || "/"
  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/")
  const candidatePath = apiPrefix === "/"
    ? `/${encodedPath}`
    : `${apiPrefix}/${encodedPath}`
  const canonicalPathname = trailingSlash ? `${candidatePath}/` : candidatePath
  const upstreamUrl = new URL(configuredUrl)
  upstreamUrl.pathname = canonicalPathname
  upstreamUrl.search = search
  upstreamUrl.hash = ""

  const isUnderApiPrefix = apiPrefix === "/"
    ? upstreamUrl.pathname.startsWith("/")
    : upstreamUrl.pathname === apiPrefix || upstreamUrl.pathname.startsWith(`${apiPrefix}/`)
  return upstreamUrl.origin === configuredUrl.origin && isUnderApiPrefix
    ? upstreamUrl.toString()
    : undefined
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) return jsonError("Backend is not configured.", 503)
  const { path } = await context.params
  const canonicalPath = canonicalizeBackendPath(path)
  if (!canonicalPath || !isAllowedBackendRequest(request.method, canonicalPath)) {
    return jsonError("Not found.", 404)
  }
  if (UNSAFE_METHODS.has(request.method) && request.headers.get("origin") !== applicationOrigin()) {
    return jsonError("Invalid request origin.", 403)
  }
  const invalidContentLength = contentLengthError(request)
  if (invalidContentLength) return invalidContentLength

  const supabase = await createSupabaseServerClient()
  const claimsResult = await supabase.auth.getClaims()
  const sessionResult = await supabase.auth.getSession()
  if (request.signal.aborted) throw abortReason(request.signal)

  const headers = new Headers()
  FORWARDED_HEADERS.forEach((name) => {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  })
  const claims = claimsResult?.data?.claims
  const accessToken = sessionResult?.data?.session?.access_token
  if (claims && accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`)
  }
  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      const body = await readBoundedBody(request)
      if (body !== undefined) init.body = body
    } catch (error) {
      if (error instanceof BodyTimeoutError) return jsonError("Request body timed out.", 408)
      if (error instanceof BodyOverflowError) return jsonError("Request body too large.", 413)
      throw error
    }
  }
  const upstreamUrl = buildUpstreamUrl(
    backendUrl,
    canonicalPath,
    request.nextUrl.search,
    request.nextUrl.pathname.endsWith("/") || requiresTrailingSlash(canonicalPath),
  )
  if (!upstreamUrl) return jsonError("Backend is not configured.", 503)
  const headerTimeoutController = new AbortController()
  const headerTimeoutId = setTimeout(
    () => headerTimeoutController.abort(new DOMException("Backend headers timed out.", "TimeoutError")),
    BACKEND_HEADERS_TIMEOUT_MS,
  )
  const upstreamSignal = AbortSignal.any([request.signal, headerTimeoutController.signal])
  let response: Response
  try {
    response = await fetch(
      upstreamUrl,
      { ...init, signal: upstreamSignal },
    )
    if (request.signal.aborted) throw abortReason(request.signal)
  } catch (error) {
    if (request.signal.aborted) throw error
    if (headerTimeoutController.signal.aborted) {
      return jsonError("Backend request timed out.", 504)
    }
    return jsonError("Backend request failed.", 502)
  } finally {
    clearTimeout(headerTimeoutId)
  }
  const responseHeaders = new Headers()
  RESPONSE_HEADERS.forEach((name) => {
    const value = response.headers.get(name)
    if (value) responseHeaders.set(name, value)
  })
  if (!responseHeaders.has("cache-control")) responseHeaders.set("Cache-Control", "no-store")
  return new NextResponse(response.body, { status: response.status, headers: responseHeaders })
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT }
