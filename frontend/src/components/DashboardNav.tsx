"use client"

import { useEffect, useState, useCallback } from "react"

const SECTIONS = [
  { id: "section-overview", label: "Overview" },
  { id: "section-performance", label: "Performance" },
  { id: "section-employment", label: "Employment" },
  { id: "section-feedback", label: "Feedback" },
]

export function DashboardNav() {
  const [activeId, setActiveId] = useState<string>("section-overview")

  const updateActiveSection = useCallback(() => {
    // If user scrolled near the bottom, highlight the last section
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 60) {
      setActiveId(SECTIONS[SECTIONS.length - 1]!.id)
      return
    }

    // Target threshold: 140px from top (navbar 60px + margin)
    const threshold = window.scrollY + 140
    for (let i = SECTIONS.length - 1; i >= 0; i--) {
      const el = document.getElementById(SECTIONS[i]!.id)
      if (el && el.offsetTop <= threshold) {
        setActiveId(SECTIONS[i]!.id)
        return
      }
    }
    setActiveId(SECTIONS[0]!.id)
  }, [])

  useEffect(() => {
    window.addEventListener("scroll", updateActiveSection, { passive: true })
    const rafId = window.requestAnimationFrame(updateActiveSection)
    return () => {
      window.removeEventListener("scroll", updateActiveSection)
      window.cancelAnimationFrame(rafId)
    }
  }, [updateActiveSection])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <div className="w-full flex items-center">
      <nav aria-label="Dashboard sections" className="flex items-center gap-1 overflow-x-auto scrollbar-none p-1 bg-slate-100/80 rounded-lg border border-slate-200/60">
        {SECTIONS.map((s) => {
          const isActive = activeId === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              className={`shrink-0 whitespace-nowrap px-4 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm border border-slate-200/50"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50 border border-transparent"
              }`}
            >
              {s.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
