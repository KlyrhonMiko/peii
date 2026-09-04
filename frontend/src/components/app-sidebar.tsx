"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
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
import { LayoutDashboard, BarChart3, Settings, FlaskConical, LogOut, ClipboardList, Cpu, ShieldCheck, UsersRound, History } from "lucide-react"
import { logoutAction } from "@/app/login/actions"
import type { PortalUser } from "@/lib/auth"

const mainItems = [
  { title: "Dashboard", url: "/researcher/dashboard", icon: LayoutDashboard },
  { title: "Analytics", url: "/researcher/analytics", icon: BarChart3 },
  { title: "Surveys", url: "/researcher/survey", icon: ClipboardList, permission: "surveys.read" },
  { title: "Models", url: "/researcher/models", icon: Cpu },
]

const managementItems = [
  { title: "Users", url: "/admin/users", icon: UsersRound, permission: "users.read" },
  { title: "Roles & permissions", url: "/admin/roles", icon: ShieldCheck, permission: "roles.read" },
  { title: "Audit logs", url: "/admin/audit-logs", icon: History, permission: "audit_logs.read" },
  { title: "Settings", url: "#", icon: Settings },
]

export function AppSidebar({ user }: { user: PortalUser }) {
  const pathname = usePathname()
  const [showLogoutModal, setShowLogoutModal] = useState(false)

  const renderMenuItems = (items: Array<(typeof mainItems)[number] | (typeof managementItems)[number]>) =>
    items.filter((item) => !("permission" in item) || user.permissions.includes(item.permission)).map((item) => {
      const isActive = pathname === item.url || pathname.startsWith(`${item.url}/`)
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton
            render={<Link href={item.url} />}
            isActive={isActive}
            className={`
              h-9 gap-3 px-3 transition-colors text-[13px]
              ${isActive ? "font-medium" : "font-normal text-sidebar-foreground/70"}
            `}
          >
            <item.icon className="w-[16px] h-[16px] shrink-0" />
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    })

  return (
    <Sidebar className="border-r border-sidebar-border">
      {/* Branding */}
      <SidebarHeader className="px-5 h-[60px] flex flex-row items-center gap-3 border-b border-sidebar-border">
        <div className="w-8 h-8 bg-zinc-900 dark:bg-white rounded-lg flex items-center justify-center shadow-sm">
          <FlaskConical className="w-[16px] h-[16px] text-white dark:text-zinc-900" />
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-semibold text-foreground leading-none tracking-tight">PEII</span>
          <span className="text-[10px] text-muted-foreground font-medium leading-none mt-1">Research Portal</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 pt-6 gap-6">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/40 mb-1 px-3 uppercase tracking-wider">
            Research
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {renderMenuItems(mainItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/40 mb-1 px-3 uppercase tracking-wider">
            Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {renderMenuItems(managementItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-sidebar-accent transition-colors group">
          <div className="w-8 h-8 rounded-full bg-background border border-sidebar-border flex items-center justify-center text-sidebar-foreground text-[11px] font-bold shrink-0 shadow-sm">
            {`${user.first_name[0] ?? ""}${user.last_name[0] ?? ""}`}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-sidebar-foreground truncate leading-none">
              {user.first_name} {user.last_name}
            </div>
            <div className="text-[11px] text-sidebar-foreground/60 truncate leading-none mt-1.5">{user.email}</div>
          </div>
          <button
            aria-label="Log out"
            className="rounded-md p-1.5 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            onClick={() => setShowLogoutModal(true)}
            type="button"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </SidebarFooter>

      <Dialog open={showLogoutModal} onOpenChange={setShowLogoutModal}>
        <DialogContent className="max-w-md border-0 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.1)] p-6" showCloseButton={true}>
          <div className="flex flex-col items-center gap-4 text-center pb-2">
            <div className="flex size-12 items-center justify-center rounded-full bg-slate-100 ring-[6px] ring-slate-50 text-slate-600 mb-1 dark:bg-zinc-800 dark:ring-zinc-900/50 dark:text-zinc-300">
              <LogOut className="size-5" />
            </div>
            <DialogHeader className="flex flex-col items-center">
              <DialogTitle className="text-xl font-semibold text-foreground tracking-tight">Log out</DialogTitle>
              <DialogDescription className="text-[15px] text-muted-foreground mt-2 leading-relaxed max-w-[95%] text-center">
                Are you sure you want to log out of your account? You will need to sign in again to access the portal.
              </DialogDescription>
            </DialogHeader>
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-center gap-3 sm:space-x-0 w-full mt-4">
            <Button
              variant="outline"
              onClick={() => setShowLogoutModal(false)}
              className="font-medium w-full sm:w-auto h-11 px-8 rounded-xl active:scale-[0.97] transition-all duration-200 ease-out"
            >
              Cancel
            </Button>
            <form action={logoutAction} className="w-full sm:w-auto">
              <Button
                variant="default"
                type="submit"
                className="font-medium w-full h-11 px-8 rounded-xl active:scale-[0.97] transition-all duration-200 ease-out"
              >
                Log out
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}
