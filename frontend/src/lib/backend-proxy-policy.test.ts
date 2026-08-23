import { describe, expect, it } from "vitest"

import { isAllowedBackendRequest } from "./backend-proxy-policy"

describe("isAllowedBackendRequest", () => {
  it("allows the survey editor routes", () => {
    expect(isAllowedBackendRequest("GET", ["surveys"])).toBe(true)
    expect(isAllowedBackendRequest("POST", ["surveys", "with-structure"])).toBe(true)
    expect(isAllowedBackendRequest("PATCH", ["surveys", "survey-id", "questions", "question-id"])).toBe(
      true,
    )
    expect(isAllowedBackendRequest("GET", ["surveys", "survey-id", "responses"])).toBe(true)
  })

  it("denies authentication and unknown backend routes", () => {
    expect(isAllowedBackendRequest("POST", ["auth", "login"])).toBe(false)
    expect(isAllowedBackendRequest("GET", ["users"])).toBe(false)
    expect(isAllowedBackendRequest("GET", ["docs"])).toBe(false)
    expect(isAllowedBackendRequest("GET", ["surveys", "survey-id", "members"])).toBe(false)
  })

  it("denies unsupported methods and malformed survey paths", () => {
    expect(isAllowedBackendRequest("PUT", ["surveys", "survey-id"])).toBe(false)
    expect(isAllowedBackendRequest("POST", ["surveys", "survey-id", "responses"])).toBe(false)
    expect(isAllowedBackendRequest("GET", ["surveys", ""])).toBe(false)
  })
})
