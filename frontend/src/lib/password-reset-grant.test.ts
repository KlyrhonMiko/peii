import { afterEach, describe, expect, it, vi } from "vitest"

import {
  issuePasswordResetGrant,
  verifyPasswordResetGrant,
} from "./password-reset-grant"

const VECTOR_SECRET = "0123456789abcdef0123456789abcdef"
const PYTHON_COMPATIBLE_VECTOR = "eyJleHAiOjE4OTM0NTY2MDAsImp0aSI6IkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFycyIsInB1cnBvc2UiOiJyZWNvdmVyeSIsInNpZCI6IjEyM2U0NTY3LWU4OWItNDJkMy1hNDU2LTQyNjYxNDE3NDAwMCIsInN1YiI6IjEyM2U0NTY3LWU4OWItNDJkMy1hNDU2LTQyNjYxNDE3NDAwMSIsInYiOjF9.N_faBG5hodYSarIZp9QZ32HVr_dWaFk19871e4uctoM"

describe("password reset grants", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("validates the Python-compatible canonical HMAC vector", () => {
    vi.stubEnv("PASSWORD_RESET_GRANT_SECRET", VECTOR_SECRET)

    expect(verifyPasswordResetGrant(PYTHON_COMPATIBLE_VECTOR, 1_893_456_000)).toMatchObject({
      purpose: "recovery",
      sid: "123e4567-e89b-42d3-a456-426614174000",
      sub: "123e4567-e89b-42d3-a456-426614174001",
    })
  })

  it("issues a bounded signed grant and rejects a changed signature", () => {
    vi.stubEnv("PASSWORD_RESET_GRANT_SECRET", VECTOR_SECRET)
    const token = issuePasswordResetGrant(
      "123e4567-e89b-42d3-a456-426614174001",
      "123e4567-e89b-42d3-a456-426614174000",
      "invite",
      1_893_456_000,
    )

    expect(verifyPasswordResetGrant(token, 1_893_456_000)).toMatchObject({ purpose: "invite" })
    expect(verifyPasswordResetGrant(`${token}a`, 1_893_456_000)).toBeNull()
  })

  it("rejects the documented deployment placeholder as a signing secret", () => {
    vi.stubEnv(
      "PASSWORD_RESET_GRANT_SECRET",
      "replace_with_a_dedicated_random_32_byte_value",
    )

    expect(() => issuePasswordResetGrant(
      "123e4567-e89b-42d3-a456-426614174001",
      "123e4567-e89b-42d3-a456-426614174000",
      "recovery",
      1_893_456_000,
    )).toThrow("PASSWORD_RESET_GRANT_SECRET is not configured")
  })
})
