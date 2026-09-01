import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="text-muted-foreground">Your account does not have access to this area.</p>
      <Link href="/" className={buttonVariants()}>
        Return home
      </Link>
    </main>
  )
}
