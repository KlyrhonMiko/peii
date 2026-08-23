import { AppSidebar } from "@/components/app-sidebar"
import { NavBar } from "@/components/nav-bar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { requirePortalUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser("users.read")
  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <main className="flex min-h-screen flex-1 flex-col overflow-auto bg-[#fafafa]">
        <NavBar breadcrumbs={[{ label: "Admin" }, { label: "User management", active: true }]} />
        <div className="mx-auto w-full max-w-[1440px] flex-1 p-5 lg:p-8">{children}</div>
      </main>
    </SidebarProvider>
  )
}
