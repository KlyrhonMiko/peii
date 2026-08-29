// Next 16.3 exposes the proxy matcher utility under its historical middleware name.
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from "next/experimental/testing/server"
import { describe, expect, it } from "vitest"

import { config } from "./proxy"

describe("global proxy matcher", () => {
  it("does not run for API routes", () => {
    expect(unstable_doesProxyMatch({ config, url: "/api/backend/users" })).toBe(false)
    expect(unstable_doesProxyMatch({ config, url: "/api/health" })).toBe(false)
  })

  it("continues to run for application routes", () => {
    expect(unstable_doesProxyMatch({ config, url: "/researcher/dashboard" })).toBe(true)
  })
})
