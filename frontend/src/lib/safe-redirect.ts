const DEFAULT_DESTINATION = "/researcher/dashboard"

export function applicationOrigin(): string {
  const value = process.env.APP_ORIGIN
  if (!value) throw new Error("APP_ORIGIN is not configured")
  return new URL(value).origin
}

export function safeInternalPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return DEFAULT_DESTINATION

  const destination = new URL(value, applicationOrigin())
  if (destination.origin !== applicationOrigin()) return DEFAULT_DESTINATION

  return `${destination.pathname}${destination.search}`
}
