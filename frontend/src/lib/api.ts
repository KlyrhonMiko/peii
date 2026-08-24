const API_BASE = "/api/backend"

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

interface ApiResponseEnvelope<T> {
  data: T | null
  message: string
  errors: unknown | null
  meta: Record<string, unknown>
}

export interface ApiRequestOptions {
  headers?: Record<string, string>
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: ApiRequestOptions,
): Promise<ApiResponseEnvelope<T>> {
  const headers: Record<string, string> = { ...options?.headers }
  if (body) {
    headers["Content-Type"] = "application/json"
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  })
  const json: ApiResponseEnvelope<T> = await res.json()
  if (!res.ok) {
    throw new ApiError(json.message ?? "Request failed", res.status, json)
  }
  return json
}

async function requestRaw(
  method: string,
  path: string,
  body?: unknown,
  options?: ApiRequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = { ...options?.headers }
  if (body !== undefined) headers["Content-Type"] = "application/json"
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  })
  if (!response.ok) {
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      // Preserve the status when an upstream error is not JSON.
    }
    const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
      ? payload.message
      : "Request failed"
    throw new ApiError(message, response.status, payload)
  }
  return response
}

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) => request<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) => request<T>("PUT", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) => request<T>("PATCH", path, body, options),
  delete: <T>(path: string, body?: unknown) =>
    request<T>("DELETE", path, body),
  raw: {
    get: (path: string, options?: ApiRequestOptions) => requestRaw("GET", path, undefined, options),
    post: (path: string, body?: unknown, options?: ApiRequestOptions) => requestRaw("POST", path, body, options),
  },
}
