import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { NavBar } from "@/components/nav-bar"
import { requirePortalUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function ResearcherLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requirePortalUser()
  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <main className="flex-1 overflow-auto bg-[#fafafa] min-h-screen flex flex-col">
        <NavBar
          breadcrumbs={[
            { label: "Researcher" },
            { label: "Portal", active: true },
          ]}
          showNotification
        />

        {/* Page Content */}
        <div className="flex-1 p-5 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}
