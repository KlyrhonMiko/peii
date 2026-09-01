import type { Metadata } from "next"

import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = {
  title: "Survey sign-in unavailable | PEII",
  robots: { index: false, follow: false },
}

export default function SurveyAuthErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Survey sign-in unavailable</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground">
          <p>We could not verify your Google sign-in. Please return to the survey link and try again.</p>
          <Link href="/" className={buttonVariants()}>
            Return to PEII
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
