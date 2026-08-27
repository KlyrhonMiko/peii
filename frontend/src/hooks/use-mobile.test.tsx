import { act, renderHook } from "@testing-library/react"
import { hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useIsMobile } from "./use-mobile"

const MOBILE_QUERY = "(max-width: 767px)"

type MediaQueryListener = (event: MediaQueryListEvent) => void

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  })
}

function createMediaQueryList() {
  const listeners = new Set<MediaQueryListener>()
  const addEventListener = vi.fn((type: string, listener: MediaQueryListener) => {
    if (type === "change") {
      listeners.add(listener)
    }
  })
  const removeEventListener = vi.fn((type: string, listener: MediaQueryListener) => {
    if (type === "change") {
      listeners.delete(listener)
    }
  })
  const mediaQueryList = {
    matches: false,
    media: MOBILE_QUERY,
    onchange: null,
    addEventListener,
    removeEventListener,
  } as unknown as MediaQueryList

  return {
    addEventListener,
    mediaQueryList,
    notify() {
      const event = { matches: mediaQueryList.matches, media: MOBILE_QUERY } as MediaQueryListEvent
      listeners.forEach((listener) => listener(event))
    },
    removeEventListener,
  }
}

function MobileSnapshot() {
  const isMobile = useIsMobile()
  return <output>{isMobile ? "mobile" : "desktop"}</output>
}

afterEach(() => {
  setViewport(1024)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("useIsMobile", () => {
  it("keeps the server and first client snapshot desktop, then reports mobile after hydration", async () => {
    setViewport(375)
    const mediaQueryList = createMediaQueryList()
    vi.stubGlobal("matchMedia", vi.fn(() => mediaQueryList.mediaQueryList))

    const browserWindow = window
    vi.stubGlobal("window", undefined)
    let serverMarkup: string
    try {
      serverMarkup = renderToString(<MobileSnapshot />)
    } finally {
      vi.stubGlobal("window", browserWindow)
    }

    const container = document.createElement("div")
    container.innerHTML = serverMarkup
    document.body.append(container)
    expect(container).toHaveTextContent("desktop")

    const recoverableErrors: unknown[] = []
    let root: Root | undefined
    try {
      root = hydrateRoot(container, <MobileSnapshot />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      })
      await act(async () => undefined)

      expect(recoverableErrors).toHaveLength(0)
      expect(container).toHaveTextContent("mobile")
    } finally {
      root?.unmount()
    }
  })

  it("updates at both sides of the 768px breakpoint and removes its change listener", () => {
    setViewport(768)
    const mediaQueryList = createMediaQueryList()
    vi.stubGlobal("matchMedia", vi.fn(() => mediaQueryList.mediaQueryList))

    const { result, unmount } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    expect(mediaQueryList.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    )

    setViewport(767)
    act(() => mediaQueryList.notify())
    expect(result.current).toBe(true)

    setViewport(768)
    act(() => mediaQueryList.notify())
    expect(result.current).toBe(false)

    const listener = mediaQueryList.addEventListener.mock.calls[0]?.[1]
    unmount()
    expect(mediaQueryList.removeEventListener).toHaveBeenCalledWith("change", listener)
  })
})
