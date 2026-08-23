import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="text-muted-foreground">Your account does not have access to this area.</p>
      <Button render={<Link href="/" />}>Return home</Button>
    </main>
  )
}
