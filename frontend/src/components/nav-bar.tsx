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
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
      <div className="flex items-center h-[60px] px-5 lg:px-8 max-w-[1440px] mx-auto w-full">
        <SidebarTrigger className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md p-1.5 transition-colors -ml-1" />
        <div className="w-px h-4 bg-slate-200 mx-3" />

        {breadcrumbs ? (
          <div className="flex items-center text-[13px] font-medium tracking-tight">
            {breadcrumbs.map((item, idx) => (
              <span key={item.label} className="flex items-center">
                {idx > 0 && <span className="text-slate-300 mx-2">/</span>}
                <span className={item.active ? "text-slate-900 font-semibold" : "text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"}>
                  {item.label}
                </span>
              </span>
            ))}
          </div>
        ) : title ? (
          <h1 className="font-semibold text-[14px] text-slate-900 tracking-tight">{title}</h1>
        ) : null}

        {children}

        <div className="flex-1" />

        {showNotification && (
          <button className="relative w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all duration-200">
            <Bell className="w-[16px] h-[16px]" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-rose-500 rounded-full ring-[2px] ring-white" />
          </button>
        )}
      </div>
    </header>
  )
}
