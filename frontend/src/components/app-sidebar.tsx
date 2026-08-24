"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
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
import { LayoutDashboard, BarChart3, Settings, FlaskConical, LogOut, ClipboardList, Cpu, ShieldCheck, UsersRound } from "lucide-react"
import { logoutAction } from "@/app/login/actions"
import type { PortalUser } from "@/lib/auth"

const mainItems = [
  { title: "Dashboard", url: "/researcher/dashboard", icon: LayoutDashboard },
  { title: "Analytics", url: "/researcher/analytics", icon: BarChart3 },
  { title: "Surveys", url: "/researcher/survey", icon: ClipboardList },
  { title: "Models", url: "/researcher/models", icon: Cpu },
]

const managementItems = [
  { title: "Users", url: "/admin/users", icon: UsersRound, permission: "users.read" },
  { title: "Roles & permissions", url: "/admin/roles", icon: ShieldCheck, permission: "roles.read" },
  { title: "Settings", url: "#", icon: Settings },
]

export function AppSidebar({ user }: { user: PortalUser }) {
  const pathname = usePathname()

  const renderMenuItems = (items: Array<(typeof mainItems)[number] | (typeof managementItems)[number]>) =>
    items.filter((item) => !("permission" in item) || user.permissions.includes(item.permission)).map((item) => {
      const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`)
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            render={<Link href={item.url} />}
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
          <div className="flex items-center gap-3 px-3 py-2 -mx-3 rounded-xl hover:bg-slate-200/40 transition-colors group">
          <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center text-slate-700 text-[11px] font-bold shrink-0 ring-1 ring-slate-200 shadow-sm">
            {`${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-slate-900 truncate leading-none">
              {user.first_name} {user.last_name}
            </div>
            <div className="text-[11px] text-slate-500 truncate leading-none mt-1">{user.email}</div>
          </div>
          <form action={logoutAction}>
            <button aria-label="Log out" className="rounded-md p-1 text-slate-400 hover:text-slate-600" type="submit">
              <LogOut />
            </button>
          </form>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
