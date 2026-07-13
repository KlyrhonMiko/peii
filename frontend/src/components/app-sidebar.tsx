"use client"

import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { LayoutDashboard, BarChart3, Settings, FlaskConical, LogOut, ClipboardList } from "lucide-react"

const mainItems = [
  { title: "Dashboard", url: "/researcher/dashboard", icon: LayoutDashboard },
  { title: "Analytics", url: "/researcher/analytics", icon: BarChart3 },
  { title: "Surveys", url: "/researcher/survey", icon: ClipboardList },
]

const managementItems = [
  { title: "Settings", url: "#", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()

  const renderMenuItems = (items: typeof mainItems) =>
    items.map((item) => {
      const isActive = pathname === item.url
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            render={<a href={item.url} />}
            className={`
              flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg transition-all duration-150 text-[13px] font-medium
              ${isActive
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }
            `}
          >
            <item.icon className={`w-[16px] h-[16px] shrink-0 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    })

  return (
    <Sidebar className="border-r border-slate-200/70 bg-white">
      {/* Branding */}
      <SidebarHeader className="px-4 h-[52px] flex flex-row items-center gap-2.5 border-b border-slate-100 bg-white">
        <div className="w-7 h-7 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
          <FlaskConical className="w-[14px] h-[14px] text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold text-slate-900 leading-none tracking-tight">PEII</span>
          <span className="text-[10px] text-slate-400 font-medium leading-none mt-[3px]">Research Portal</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-white px-3 pt-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 px-2.5">
            Research
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-px">
              {renderMenuItems(mainItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 px-2.5">
            Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-px">
              {renderMenuItems(managementItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-slate-100 bg-white">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer group">
          <div className="w-7 h-7 rounded-md bg-slate-800 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            RC
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-slate-700 truncate leading-none">Researcher</div>
            <div className="text-[10px] text-slate-400 truncate leading-none mt-[3px]">researcher@peii.gov.ph</div>
          </div>
          <LogOut className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
