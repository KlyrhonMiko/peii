import { NextResponse, type NextRequest } from "next/server"

import { createSurveySupabaseServerClient } from "@/lib/supabase/survey-server"
import { applicationOrigin } from "@/lib/safe-redirect"

const MAX_SURVEY_BODY_BYTES = 65536
const SURVEY_BODY_TIMEOUT_MS = 15000
const SURVEY_HEADERS_TIMEOUT_MS = 15000
const FORWARDED_HEADERS = ["content-type", "idempotency-key"]
const RESPONSE_HEADERS = ["content-type", "retry-after", "pragma", "x-content-type-options"]

class BodyOverflowError extends Error {}
class BodyTimeoutError extends Error {}

function jsonError(message: string, status: number, code?: string): NextResponse {
  return NextResponse.json(
    {
      data: null,
      message,
      errors: code ? { code } : null,
      meta: {},
    },
    { status, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
  )
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The request was aborted.", "AbortError")
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
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
  const deadline = Date.now() + SURVEY_BODY_TIMEOUT_MS
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new BodyTimeoutError()), Math.max(0, deadline - Date.now()))
  })
  const abortPromise = new Promise<never>((_, reject) => {
    abortHandler = () => reject(abortReason(request.signal))
    if (request.signal.aborted) abortHandler()
    else request.signal.addEventListener("abort", abortHandler, { once: true })
  })

  try {
    while (true) {
      const result = await Promise.race([reader.read(), timeoutPromise, abortPromise])
      if (result.done) break
      bytes += result.value.byteLength
      if (bytes > MAX_SURVEY_BODY_BYTES) throw new BodyOverflowError()
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
  const view = new Uint8Array(body)
  let offset = 0
  for (const chunk of chunks) {
    view.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function contentLengthError(request: NextRequest): NextResponse | undefined {
  const value = request.headers.get("content-length")
  if (value === null) return undefined
  if (!/^\d+$/u.test(value)) return jsonError("Invalid request.", 400)
  const length = Number(value)
  if (!Number.isSafeInteger(length)) return jsonError("Invalid request.", 400)
  return length > MAX_SURVEY_BODY_BYTES
    ? jsonError("Request body too large.", 413)
    : undefined
}

function validSurveyToken(token: string): boolean {
  return token.length > 0 && !/[\\/?#\u0000-\u001f\u007f]/u.test(token)
}

async function surveyAccessToken(request: NextRequest): Promise<string | null> {
  const supabase = await createSurveySupabaseServerClient()
  const [claimsResult, sessionResult] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.auth.getSession(),
  ])
  if (request.signal.aborted) throw abortReason(request.signal)
  const claims = claimsResult?.data?.claims
  const accessToken = sessionResult?.data?.session?.access_token
  return claims && accessToken ? accessToken : null
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const backendUrl = process.env.BACKEND_INTERNAL_URL
  if (!backendUrl) return jsonError("Survey service is not configured.", 503)

  const { token } = await context.params
  if (!validSurveyToken(token)) return jsonError("Not found.", 404)
  const isSubmission = request.method === "POST" || request.method === "PATCH"
  if (isSubmission) {
    let origin: string | null
    try {
      origin = applicationOrigin()
    } catch {
      return jsonError("Survey service is not configured.", 503)
    }
    if (request.headers.get("origin") !== origin) {
      return jsonError("Invalid request origin.", 403)
    }
    const invalidContentLength = contentLengthError(request)
    if (invalidContentLength) return invalidContentLength
  }

  let accessToken: string | null
  try {
    accessToken = await surveyAccessToken(request)
  } catch (error) {
    if (request.signal.aborted) throw error
    return jsonError("Survey authentication is unavailable.", 503)
  }
  if (!accessToken) return jsonError("Google sign-in is required.", 401, "google_login_required")

  const headers = new Headers()
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  headers.set("Authorization", `Bearer ${accessToken}`)

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  }
  if (isSubmission) {
    try {
      const body = await readBoundedBody(request)
      if (body !== undefined) init.body = body
    } catch (error) {
      if (error instanceof BodyTimeoutError) return jsonError("Request body timed out.", 408)
      if (error instanceof BodyOverflowError) return jsonError("Request body too large.", 413)
      throw error
    }
  }
  if (request.signal.aborted) throw abortReason(request.signal)

  const headerTimeoutController = new AbortController()
  const headerTimeoutId = setTimeout(
    () => headerTimeoutController.abort(new DOMException("Survey headers timed out.", "TimeoutError")),
    SURVEY_HEADERS_TIMEOUT_MS,
  )
  const upstreamSignal = AbortSignal.any([request.signal, headerTimeoutController.signal])
  const suffix = isSubmission ? "/respond" : ""
  let response: Response
  try {
    response = await fetch(
      `${backendUrl.replace(/\/$/u, "")}/survey/${encodeURIComponent(token)}${suffix}`,
      { ...init, signal: upstreamSignal },
    )
    if (request.signal.aborted) throw abortReason(request.signal)
  } catch (error) {
    if (request.signal.aborted) throw error
    if (headerTimeoutController.signal.aborted) return jsonError("Survey request timed out.", 504)
    return jsonError("Survey request failed.", 502)
  } finally {
    clearTimeout(headerTimeoutId)
  }

  const responseHeaders = new Headers()
  for (const name of RESPONSE_HEADERS) {
    const value = response.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  responseHeaders.set("Cache-Control", "no-store")
  responseHeaders.set("Pragma", "no-cache")
  return new NextResponse(response.body, { status: response.status, headers: responseHeaders })
}

export { proxy as GET, proxy as POST, proxy as PATCH }
