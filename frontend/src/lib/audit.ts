import { api } from "@/lib/api"

export interface AuditLog {
  id: string
  action: string
  resource_type: string
  resource_id: string
  performed_by: string
  request_id: string | null
  changes: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

export interface AuditLogListParams {
  limit: number
  offset: number
  sort_order?: "asc" | "desc"
  resource_type?: string
  resource_id?: string
  action?: string
  performed_by?: string
  request_id?: string
  created_from?: string
  created_to?: string
}

export interface AuditLogPagination {
  total: number
  count: number
  limit: number
  offset: number
  has_next: boolean
  has_prev: boolean
}

export interface AuditLogListResult {
  logs: AuditLog[]
  pagination: AuditLogPagination
}

function buildQuery(params: AuditLogListParams): string {
  const search = new URLSearchParams()
  search.set("limit", String(params.limit))
  search.set("offset", String(params.offset))
  if (params.sort_order) search.set("sort_order", params.sort_order)
  if (params.resource_type) search.set("resource_type", params.resource_type)
  if (params.resource_id) search.set("resource_id", params.resource_id)
  if (params.action) search.set("action", params.action)
  if (params.performed_by) search.set("performed_by", params.performed_by)
  if (params.request_id) search.set("request_id", params.request_id)
  if (params.created_from) search.set("created_from", params.created_from)
  if (params.created_to) search.set("created_to", params.created_to)
  return search.toString()
}

export async function listAuditLogs(params: AuditLogListParams): Promise<AuditLogListResult> {
  const response = await api.get<AuditLog[]>(`/audit-logs?${buildQuery(params)}`)
  const meta = response.meta as { pagination?: AuditLogPagination } | undefined
  return {
    logs: response.data ?? [],
    pagination: meta?.pagination ?? {
      total: 0,
      count: 0,
      limit: params.limit,
      offset: params.offset,
      has_next: false,
      has_prev: false,
    },
  }
}

export async function getAuditLog(logId: string): Promise<AuditLog> {
  const response = await api.get<AuditLog>(`/audit-logs/${logId}`)
  if (!response.data) throw new Error("Backend did not return the audit log")
  return response.data
}
