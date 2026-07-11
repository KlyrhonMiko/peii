const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"

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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResponseEnvelope<T>> {
  const headers: Record<string, string> = {}
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

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string, body?: unknown) =>
    request<T>("DELETE", path, body),
}
