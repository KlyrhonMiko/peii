import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { NavBar } from "@/components/nav-bar"

export default function UsersPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto bg-gray-50 min-h-screen">
        <NavBar title="Admin Portal" />
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
            <p className="text-muted-foreground">
              Manage roles and access for the PEII system.
            </p>
          </div>
          
          <div className="rounded-md border bg-white">
            <div className="p-4 text-sm text-gray-500">
              User table placeholder (e.g., list of researchers, admins, staff).
            </div>
          </div>
        </div>
      </main>
    </SidebarProvider>
  )
}
