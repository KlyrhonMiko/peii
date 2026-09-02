import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

export const SURVEY_OAUTH_STATE_COOKIE = "peii-survey-oauth-state"
export const SURVEY_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60

export const surveyOAuthStateCookieOptions = {
  httpOnly: true,
  path: "/auth/survey/google",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: SURVEY_OAUTH_STATE_MAX_AGE_SECONDS,
}

export const surveyOAuthStateClearOptions = {
  ...surveyOAuthStateCookieOptions,
  maxAge: 0,
  expires: new Date(0),
}

interface SurveyOAuthStatePayload {
  returnTo: string
  flowId: string
  expiresAt: number
}

const PKCE_FLOW_ID_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/u

export function validateSurveyFlowId(value: unknown): string | null {
  return typeof value === "string" && PKCE_FLOW_ID_PATTERN.test(value) ? value : null
}

function stateKey(): string {
  const key = process.env.SURVEY_OAUTH_STATE_KEY
  if (!key) throw new Error("SURVEY_OAUTH_STATE_KEY is not configured")
  return key
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url")
}

function decode(value: string): string | null {
  try {
    return Buffer.from(value, "base64url").toString("utf8")
  } catch {
    return null
  }
}

function signature(value: string): string {
  return createHmac("sha256", stateKey()).update(value).digest("base64url")
}

export function validateSurveyReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/survey/")) return null

  let destination: URL
  try {
    destination = new URL(value, "http://survey.local")
  } catch {
    return null
  }
  if (
    destination.origin !== "http://survey.local" ||
    destination.search ||
    destination.hash ||
    destination.pathname !== value
  ) {
    return null
  }

  const token = destination.pathname.slice("/survey/".length)
  if (!token || /[\\/\u0000-\u001f\u007f]/u.test(token)) return null
  try {
    const decodedToken = decodeURIComponent(token)
    if (!decodedToken || /[\\/\u0000-\u001f\u007f]/u.test(decodedToken)) return null
  } catch {
    return null
  }
  return destination.pathname
}

export function createSurveyOAuthState(returnTo: string, flowId: string, now = Date.now()): string {
  const validatedReturnTo = validateSurveyReturnPath(returnTo)
  const validatedFlowId = validateSurveyFlowId(flowId)
  if (!validatedReturnTo || !validatedFlowId) throw new Error("Invalid survey OAuth state")

  const payload: SurveyOAuthStatePayload = {
    returnTo: validatedReturnTo,
    flowId: validatedFlowId,
    expiresAt: now + SURVEY_OAUTH_STATE_MAX_AGE_SECONDS * 1000,
  }
  const encodedPayload = encode(JSON.stringify(payload))
  return `${encodedPayload}.${signature(encodedPayload)}`
}

export function verifySurveyOAuthState(
  value: string | undefined,
  now = Date.now(),
): SurveyOAuthStatePayload | null {
  if (!value) return null
  const parts = value.split(".")
  if (parts.length !== 2) return null
  const [encodedPayload, encodedSignature] = parts
  if (!encodedPayload || !encodedSignature) return null

  let expectedSignature: string
  try {
    expectedSignature = signature(encodedPayload)
  } catch {
    return null
  }
  const expected = Buffer.from(expectedSignature, "base64url")
  const received = Buffer.from(encodedSignature, "base64url")
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null

  const decodedPayload = decode(encodedPayload)
  if (!decodedPayload) return null
  try {
    const payload: unknown = JSON.parse(decodedPayload)
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("returnTo" in payload) ||
      !("flowId" in payload) ||
      !("expiresAt" in payload) ||
      typeof payload.returnTo !== "string" ||
      typeof payload.flowId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= now
    ) return null
    const flowId = validateSurveyFlowId(payload.flowId)
    const returnTo = validateSurveyReturnPath(payload.returnTo)
    return returnTo && flowId ? { returnTo, flowId, expiresAt: payload.expiresAt } : null
  } catch {
    return null
  }
}
