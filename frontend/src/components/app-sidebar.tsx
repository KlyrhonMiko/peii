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
import { LayoutDashboard, BarChart3, Settings, FlaskConical, LogOut, ClipboardList, Cpu } from "lucide-react"

const mainItems = [
  { title: "Dashboard", url: "/researcher/dashboard", icon: LayoutDashboard },
  { title: "Analytics", url: "/researcher/analytics", icon: BarChart3 },
  { title: "Surveys", url: "/researcher/survey", icon: ClipboardList },
  { title: "Models", url: "/researcher/models", icon: Cpu },
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
              group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-[13px] font-medium
              ${isActive
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50"
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/50"
              }
            `}
          >
            <item.icon className={`w-[16px] h-[16px] shrink-0 transition-colors ${isActive ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    })

  return (
    <Sidebar className="border-r border-slate-200/60 bg-[#fafafa]">
      {/* Branding */}
      <SidebarHeader className="px-5 h-[60px] flex flex-row items-center gap-3 border-b border-slate-200/60 bg-[#fafafa]">
        <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center shadow-sm ring-1 ring-slate-950/10">
          <FlaskConical className="w-[16px] h-[16px] text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold text-slate-900 leading-none tracking-tight">PEII</span>
          <span className="text-[10px] text-slate-400 font-medium leading-none mt-[3px]">Research Portal</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-[#fafafa] px-3 pt-6">
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

      <SidebarFooter className="px-4 py-4 border-t border-slate-200/60 bg-[#fafafa]">
        <div className="flex items-center gap-3 px-3 py-2 -mx-3 rounded-xl hover:bg-slate-200/40 transition-colors cursor-pointer group">
          <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center text-slate-700 text-[11px] font-bold shrink-0 ring-1 ring-slate-200 shadow-sm">
            RC
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-slate-900 truncate leading-none">Researcher</div>
            <div className="text-[11px] text-slate-500 truncate leading-none mt-1">researcher@peii.gov.ph</div>
          </div>
          <LogOut className="w-[15px] h-[15px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 group-hover:text-slate-600" />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
