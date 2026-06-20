import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { NavBar } from "@/components/nav-bar"

export default function ResearcherLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto bg-[#f7f8fb] min-h-screen flex flex-col">
        <NavBar
          breadcrumbs={[
            { label: "Researcher" },
            { label: "Portal", active: true },
          ]}
          showNotification
        />

        {/* Page Content */}
        <div className="flex-1 p-5 lg:p-6 max-w-[1360px] w-full mx-auto">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}
