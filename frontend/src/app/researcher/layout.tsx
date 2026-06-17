import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Bell, Search } from "lucide-react"

export default function ResearcherLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-auto bg-[#f7f8fb] min-h-screen flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200/60">
          <div className="flex items-center h-[52px] px-4">
            <SidebarTrigger className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md p-1.5 transition-colors -ml-1" />
            <div className="w-px h-4 bg-slate-200 mx-3" />
            <span className="text-[13px] text-slate-400 font-medium">Researcher</span>
            <span className="text-[13px] text-slate-300 mx-1.5">/</span>
            <span className="text-[13px] text-slate-700 font-semibold">Portal</span>

            <div className="flex-1" />

            {/* Search */}
            <div className="hidden md:flex items-center gap-2 h-8 px-3 rounded-md bg-slate-50 border border-slate-200/80 hover:border-slate-300 transition-colors cursor-pointer group mr-2" style={{ width: "220px" }}>
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[12px] text-slate-400 font-medium">Search...</span>
              <kbd className="ml-auto text-[10px] font-mono font-medium text-slate-400 bg-white rounded px-1 py-px border border-slate-200">⌘K</kbd>
            </div>

            {/* Notification */}
            <button className="relative w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors mr-1">
              <Bell className="w-[15px] h-[15px]" />
              <span className="absolute top-1.5 right-1.5 w-[6px] h-[6px] bg-indigo-500 rounded-full ring-[1.5px] ring-white" />
            </button>

            {/* Avatar */}
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold ring-1 ring-black/5">
              RC
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-5 lg:p-6 max-w-[1360px] w-full mx-auto">
          {children}
        </div>
      </main>
    </SidebarProvider>
  )
}
