import { describe, expect, it } from "vitest"

import nextConfig from "./next.config"

describe("survey security headers", () => {
  it("configures no-store caching and browser security headers", async () => {
    const configuredHeaders = await nextConfig.headers?.() ?? []
    const surveyRule = configuredHeaders.find((rule) => rule.source === "/survey/:path*")

    expect(surveyRule).toBeDefined()
    expect(surveyRule?.headers).toEqual(expect.arrayContaining([
      { key: "Cache-Control", value: "no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    ]))
  })
})
