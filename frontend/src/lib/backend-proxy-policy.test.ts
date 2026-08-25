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
    expect(isAllowedBackendRequest("POST", ["surveys", "survey-id", "restore"])).toBe(true)
    expect(isAllowedBackendRequest("POST", ["surveys", "survey-id", "distributions", "distribution-id", "rotate"])).toBe(true)
  })

  it("allows user-management and role-management routes", () => {
    expect(isAllowedBackendRequest("GET", ["users"])).toBe(true)
    expect(isAllowedBackendRequest("POST", ["users"])).toBe(true)
    expect(isAllowedBackendRequest("POST", ["users", "batch"])).toBe(true)
    expect(isAllowedBackendRequest("PATCH", ["users", "USER-123"])).toBe(true)
    expect(isAllowedBackendRequest("DELETE", ["users", "USER-123"])).toBe(true)
    expect(isAllowedBackendRequest("POST", ["users", "USER-123", "restore"])).toBe(true)
    expect(isAllowedBackendRequest("POST", ["users", "USER-123", "invitation", "resend"])).toBe(true)
    expect(isAllowedBackendRequest("POST", ["users", "USER-123", "sessions", "revoke"])).toBe(true)
    expect(isAllowedBackendRequest("GET", ["rbac", "roles"])).toBe(true)
    expect(isAllowedBackendRequest("GET", ["rbac", "permissions"])).toBe(true)
    expect(isAllowedBackendRequest("POST", ["rbac", "roles"])).toBe(true)
    expect(isAllowedBackendRequest("PATCH", ["rbac", "roles", "role-id"])).toBe(true)
    expect(isAllowedBackendRequest("PUT", ["rbac", "users", "USER-123", "roles"])).toBe(true)
  })

  it("denies authentication and unknown backend routes", () => {
    expect(isAllowedBackendRequest("POST", ["auth", "login"])).toBe(false)
    expect(isAllowedBackendRequest("DELETE", ["rbac", "roles", "role-id"])).toBe(false)
    expect(isAllowedBackendRequest("POST", ["users", "USER-123", "sessions"])).toBe(false)
    expect(isAllowedBackendRequest("GET", ["docs"])).toBe(false)
    expect(isAllowedBackendRequest("GET", ["surveys", "survey-id", "unsupported"])).toBe(false)
    expect(isAllowedBackendRequest("POST", ["surveys", "survey-id", "unsupported", "action", "id"])).toBe(false)
  })

  it("denies unsupported methods and malformed survey paths", () => {
    expect(isAllowedBackendRequest("PUT", ["surveys", "survey-id"])).toBe(false)
    expect(isAllowedBackendRequest("POST", ["surveys", "survey-id", "responses"])).toBe(false)
    expect(isAllowedBackendRequest("GET", ["surveys", ""])).toBe(false)
  })

  it("allows only the exact response aggregate, export, and erase actions", () => {
    expect(isAllowedBackendRequest("GET", ["surveys", "survey-id", "responses", "aggregates"])).toBe(true)
    expect(isAllowedBackendRequest("GET", ["surveys", "survey-id", "responses", "export"])).toBe(true)
    expect(isAllowedBackendRequest("POST", ["surveys", "survey-id", "responses", "erase"])).toBe(true)

    expect(isAllowedBackendRequest("GET", ["surveys", "survey-id", "responses", "aggregate"])).toBe(false)
    expect(isAllowedBackendRequest("GET", ["surveys", "survey-id", "responses", "exports"])).toBe(false)
    expect(isAllowedBackendRequest("POST", ["surveys", "survey-id", "responses", "erase", "again"])).toBe(false)
  })

  it("rejects unsupported survey subroutes for every method", () => {
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
      expect(isAllowedBackendRequest(method, ["surveys", "survey-id", "unsupported"])).toBe(false)
      expect(isAllowedBackendRequest(method, ["surveys", "survey-id", "unsupported", "action"])).toBe(false)
    }
  })
})
