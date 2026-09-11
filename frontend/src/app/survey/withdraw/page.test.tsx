import { expect, it, vi } from "vitest"
import WithdrawalPage from "./page"

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND") } }))

it("returns not found for the removed withdrawal page", () => {
  expect(() => WithdrawalPage()).toThrow("NEXT_NOT_FOUND")
})
