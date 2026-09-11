import "server-only"

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export const PASSWORD_RESET_GRANT_COOKIE = "peii_password_reset_grant"
export const PASSWORD_RESET_GRANT_MAX_AGE_SECONDS = 600
const DOCUMENTED_SECRET_PLACEHOLDERS = new Set([
  "replace_with_a_dedicated_random_32_byte_value",
  "local-only-password-reset-grant-secret",
])

export type PasswordResetPurpose = "invite" | "recovery"

export interface PasswordResetGrant {
  exp: number
  jti: string
  purpose: PasswordResetPurpose
  sid: string
  sub: string
  v: 1
}

function secret(): string {
  const value = process.env.PASSWORD_RESET_GRANT_SECRET
  if (
    !value ||
    Buffer.byteLength(value, "utf8") < 32 ||
    DOCUMENTED_SECRET_PLACEHOLDERS.has(value.trim())
  ) {
    throw new Error("PASSWORD_RESET_GRANT_SECRET is not configured")
  }
  return value
}

function canonicalPayload(payload: PasswordResetGrant): string {
  return JSON.stringify({
    exp: payload.exp,
    jti: payload.jti,
    purpose: payload.purpose,
    sid: payload.sid,
    sub: payload.sub,
    v: payload.v,
  })
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url")
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
}

function isGrant(value: unknown, now: number): value is PasswordResetGrant {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const payload = value as Record<string, unknown>
  if (Object.keys(payload).length !== 6 || !["exp", "jti", "purpose", "sid", "sub", "v"].every((key) => key in payload)) return false
  return (
    payload.v === 1 &&
    typeof payload.exp === "number" &&
    Number.isSafeInteger(payload.exp) &&
    payload.exp > now &&
    payload.exp <= now + PASSWORD_RESET_GRANT_MAX_AGE_SECONDS &&
    typeof payload.jti === "string" &&
    /^[A-Za-z0-9_-]{22,86}$/u.test(payload.jti) &&
    (payload.purpose === "invite" || payload.purpose === "recovery") &&
    typeof payload.sid === "string" &&
    validUuid(payload.sid) &&
    typeof payload.sub === "string" &&
    validUuid(payload.sub)
  )
}

export function issuePasswordResetGrant(
  subject: string,
  sessionId: string,
  purpose: PasswordResetPurpose,
  now = Math.floor(Date.now() / 1000),
): string {
  if (!validUuid(subject) || !validUuid(sessionId)) throw new Error("Invalid reset session")
  const payload: PasswordResetGrant = {
    exp: now + PASSWORD_RESET_GRANT_MAX_AGE_SECONDS,
    jti: randomBytes(32).toString("base64url"),
    purpose,
    sid: sessionId,
    sub: subject,
    v: 1,
  }
  const encodedPayload = Buffer.from(canonicalPayload(payload), "utf8").toString("base64url")
  return `${encodedPayload}.${sign(encodedPayload, secret())}`
}

export function verifyPasswordResetGrant(token: string, now = Math.floor(Date.now() / 1000)): PasswordResetGrant | null {
  const parts = token.split(".")
  if (parts.length !== 2 || !parts[0] || !parts[1] || !/^[A-Za-z0-9_-]+$/u.test(parts[0]) || !/^[A-Za-z0-9_-]+$/u.test(parts[1])) return null
  const [encodedPayload, encodedSignature] = parts
  const expected = Buffer.from(sign(encodedPayload, secret()), "base64url")
  const actual = Buffer.from(encodedSignature, "base64url")
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
  try {
    const decoded: unknown = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"))
    if (!isGrant(decoded, now)) return null
    const payload = decoded
    if (Buffer.from(canonicalPayload(payload), "utf8").toString("base64url") !== encodedPayload) return null
    return payload
  } catch {
    return null
  }
}

export const passwordResetGrantCookieOptions = {
  httpOnly: true,
  maxAge: PASSWORD_RESET_GRANT_MAX_AGE_SECONDS,
  path: "/reset-password",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
}
