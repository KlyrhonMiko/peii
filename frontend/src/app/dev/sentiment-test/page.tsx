import { notFound } from "next/navigation"

import { SentimentTest } from "@/components/SentimentTest"

export const metadata = {
  robots: { index: false, follow: false },
}

// Development-only utility: the page 404s in production builds (NODE_ENV is baked
// at build time) and is marked noindex. The client chunk still ships the dev model
// ID constants and the direct NEXT_PUBLIC_API_URL probe; the 404 gate is what keeps
// that surface from being reachable in production.
export default function SentimentTestPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <SentimentTest />
}
