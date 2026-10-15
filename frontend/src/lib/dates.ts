const TIME_ZONE_SUFFIX = /(?:Z|[+-]\d{2}:\d{2})$/

export function parseBackendUtcTimestamp(value: string): Date {
  const normalized = TIME_ZONE_SUFFIX.test(value) ? value : `${value}Z`
  return new Date(normalized)
}

export function formatBackendUtcTimestamp(
  value: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseBackendUtcTimestamp(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-US", options)
}

/** Local calendar date as YYYY-MM-DD, for file names (toISOString would give the UTC date). */
export function localDateStamp(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
