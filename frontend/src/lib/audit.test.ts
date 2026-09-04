import { beforeEach, describe, expect, it, vi } from "vitest"

const mockApi = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock("@/lib/api", () => ({ api: mockApi }))

import { getAuditLog, listAuditLogs } from "./audit"

describe("audit API client", () => {
  beforeEach(() => {
    mockApi.get.mockReset()
  })

  it("lists audit logs with query filters and returns pagination metadata", async () => {
    const log = {
      id: "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c1",
      action: "update",
      resource_type: "user",
      resource_id: "USER-123456",
      performed_by: "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
      request_id: null,
      changes: null,
      ip_address: null,
      created_at: "2026-06-21T12:00:00",
    }
    mockApi.get.mockResolvedValueOnce({
      data: [log],
      meta: {
        pagination: { total: 1, count: 1, limit: 20, offset: 0, has_next: false, has_prev: false },
      },
    })

    const result = await listAuditLogs({
      limit: 20,
      offset: 0,
      resource_type: "user",
      action: "update",
    })

    expect(result.logs).toEqual([log])
    expect(result.pagination.total).toBe(1)
    expect(mockApi.get).toHaveBeenCalledWith(
      "/audit-logs?limit=20&offset=0&resource_type=user&action=update",
    )
  })

  it("omits unset optional filters from the query string", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [], meta: { pagination: undefined } })

    const result = await listAuditLogs({ limit: 20, offset: 0 })

    expect(result.logs).toEqual([])
    expect(result.pagination.total).toBe(0)
    expect(mockApi.get).toHaveBeenCalledWith("/audit-logs?limit=20&offset=0")
  })

  it("fetches a single audit log by id", async () => {
    const log = {
      id: "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c1",
      action: "create",
      resource_type: "survey",
      resource_id: "SURV-ABC123456789",
      performed_by: "018f4a1a-7b3b-7d0e-913a-c5f1c5c1c5c2",
      request_id: null,
      changes: null,
      ip_address: null,
      created_at: "2026-06-21T12:00:00",
    }
    mockApi.get.mockResolvedValueOnce({ data: log })

    await expect(getAuditLog(log.id)).resolves.toEqual(log)
    expect(mockApi.get).toHaveBeenCalledWith(`/audit-logs/${log.id}`)
  })
})
