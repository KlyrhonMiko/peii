import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAuditLog: vi.fn(),
  listAuditLogs: vi.fn(),
}))

vi.mock("@/lib/audit", () => ({
  getAuditLog: mocks.getAuditLog,
  listAuditLogs: mocks.listAuditLogs,
}))

import { AdminAuditLogs } from "./AdminAuditLogs"
import type { AuditLog, AuditLogListResult } from "@/lib/audit"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

function result(action: string): AuditLogListResult {
  const log: AuditLog = {
    id: `${action}-id`,
    action,
    resource_type: "survey",
    resource_id: "SURV-1",
    performed_by: "system-actor",
    request_id: null,
    changes: null,
    ip_address: null,
    created_at: "2026-09-01T00:00:00",
  }
  return {
    logs: [log],
    pagination: {
      total: 1,
      count: 1,
      limit: 20,
      offset: 0,
      has_next: false,
      has_prev: false,
    },
  }
}

describe("AdminAuditLogs requests", () => {
  beforeEach(() => mocks.listAuditLogs.mockReset())

  it("does not let an older filter response replace newer results", async () => {
    const older = deferred<AuditLogListResult>()
    const newer = deferred<AuditLogListResult>()
    mocks.listAuditLogs.mockImplementationOnce(() => older.promise)
    mocks.listAuditLogs.mockImplementationOnce(() => newer.promise)

    render(<AdminAuditLogs />)
    await waitFor(() => expect(mocks.listAuditLogs).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText("Filter by action"), {
      target: { value: "newer-action" },
    })
    await waitFor(() => expect(mocks.listAuditLogs).toHaveBeenCalledTimes(2))

    await act(async () => newer.resolve(result("newer-action")))
    expect(await screen.findByText("newer-action")).toBeInTheDocument()
    await act(async () => older.resolve(result("older-action")))

    expect(screen.getByText("newer-action")).toBeInTheDocument()
    expect(screen.queryByText("older-action")).not.toBeInTheDocument()
  })
})
