import { SidebarTrigger } from "@/components/ui/sidebar"
import { Bell } from "lucide-react"
import type { ReactNode } from "react"

export interface BreadcrumbItem {
  label: string
  active?: boolean
}

interface NavBarProps {
  breadcrumbs?: BreadcrumbItem[]
  title?: string
  showNotification?: boolean
  children?: ReactNode
}

export function NavBar({
  breadcrumbs,
  title,
  showNotification = false,
  children,
}: NavBarProps) {
  return (
    <header className="sticky top-0 z-20 bg-white border-b border-slate-200/60">
      <div className="flex items-center h-[52px] px-4">
        <SidebarTrigger className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md p-1.5 transition-colors -ml-1" />
        <div className="w-px h-4 bg-slate-200 mx-3" />

        {breadcrumbs ? (
          <div className="flex items-center text-[13px] font-medium">
            {breadcrumbs.map((item, idx) => (
              <span key={item.label} className="flex items-center">
                {idx > 0 && <span className="text-slate-300 mx-1.5">/</span>}
                <span className={item.active ? "text-slate-700 font-semibold" : "text-slate-400"}>
                  {item.label}
                </span>
              </span>
            ))}
          </div>
        ) : title ? (
          <h1 className="font-semibold text-[13px] text-slate-700">{title}</h1>
        ) : null}

        {children}

        <div className="flex-1" />

        {showNotification && (
          <button className="relative w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
            <Bell className="w-[15px] h-[15px]" />
            <span className="absolute top-1.5 right-1.5 w-[6px] h-[6px] bg-indigo-500 rounded-full ring-[1.5px] ring-white" />
          </button>
        )}
      </div>
    </header>
  )
}
