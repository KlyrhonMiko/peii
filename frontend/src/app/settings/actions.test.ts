import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const redirect = vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`)
  })
  const requirePortalUser = vi.fn()
  const getSession = vi.fn()
  const signOut = vi.fn()
  const revalidatePath = vi.fn()
  const createSupabaseServerClient = vi.fn(async () => ({ auth: { getSession, signOut } }))
  return { createSupabaseServerClient, getSession, redirect, requirePortalUser, revalidatePath, signOut }
})

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/auth", () => ({ requirePortalUser: mocks.requirePortalUser }))
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createSupabaseServerClient }))

import {
  changePasswordAction,
  requestPasswordReauthenticationAction,
  signOutEverywhereAction,
  updateProfileAction,
  type SettingsActionState,
} from "./actions"

const initial: SettingsActionState = { status: "idle", message: "" }

function profileForm() {
  const formData = new FormData()
  formData.set("username", "  researcher  ")
  formData.set("first_name", " Alex ")
  formData.set("last_name", " Cruz ")
  formData.set("middle_name", "")
  formData.set("contact", "")
  formData.set("roles", "admin")
  formData.set("is_active", "false")
  return formData
}

describe("settings actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubEnv("BACKEND_INTERNAL_URL", "http://backend.test")
    mocks.requirePortalUser.mockReset()
    mocks.requirePortalUser.mockResolvedValue({ id: "self" })
    mocks.getSession.mockReset()
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "access" } } })
    mocks.signOut.mockReset()
    mocks.signOut.mockResolvedValue({ error: null })
    mocks.redirect.mockClear()
    mocks.revalidatePath.mockClear()
  })

  it("sends only self-service profile fields with authenticated server access", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(updateProfileAction(initial, profileForm())).resolves.toEqual({ status: "success", message: "Profile updated." })
    expect(mocks.requirePortalUser).toHaveBeenCalledWith("portal.access")
    expect(fetchMock).toHaveBeenCalledWith("http://backend.test/auth/me", expect.objectContaining({
      method: "PATCH",
      headers: { Authorization: "Bearer access", "Content-Type": "application/json" },
      body: JSON.stringify({ username: "researcher", first_name: "Alex", last_name: "Cruz", middle_name: null, contact: null }),
    }))
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings")
  })

  it("rejects invalid profile input before sending a request", async () => {
    const formData = profileForm()
    formData.set("first_name", "   ")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(updateProfileAction(initial, formData)).resolves.toMatchObject({ status: "error" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not call the backend when the portal guard rejects the user", async () => {
    mocks.requirePortalUser.mockRejectedValue(new Error("denied"))
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(updateProfileAction(initial, profileForm())).rejects.toThrow("denied")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("requests password reauthentication and never sends the new password until valid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    await expect(requestPasswordReauthenticationAction(initial, new FormData())).resolves.toMatchObject({ status: "success" })
    expect(fetchMock).toHaveBeenCalledWith("http://backend.test/auth/password/reauthenticate", expect.objectContaining({ method: "POST" }))

    const invalid = new FormData()
    invalid.set("nonce", "code")
    invalid.set("password", "long-enough-password")
    invalid.set("confirmation", "different-password")
    await expect(changePasswordAction(initial, invalid)).resolves.toMatchObject({ status: "error" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("reports a failed global logout without claiming other sessions ended", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })))

    await expect(signOutEverywhereAction(initial, new FormData())).resolves.toMatchObject({ status: "error" })
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it("ends the local session only after backend global logout succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    await expect(signOutEverywhereAction(initial, new FormData())).rejects.toThrow("REDIRECT:/")
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" })
  })
})
