import type { Metadata } from "next"

import { WithdrawalForm } from "@/components/public-survey/WithdrawalForm"

export const metadata: Metadata = {
  title: "Withdraw a response | PEII",
  robots: {
    index: false,
    follow: false,
  },
}

export default function WithdrawalPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 md:py-24">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm sm:p-10">
        <WithdrawalForm />
      </div>
    </main>
  )
}
