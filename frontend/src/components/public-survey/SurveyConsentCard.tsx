"use client"

import type { PublicSurveyConsent } from "@/lib/public-survey"
import { ShieldCheck } from "lucide-react"
interface SurveyConsentCardProps {
  consent: PublicSurveyConsent
  consentAccepted: boolean
  consentTouched: boolean
  staleConsent: boolean
  onConsentChange: (accepted: boolean) => void
}

export function SurveyConsentCard({
  consent,
  consentAccepted,
  consentTouched,
  staleConsent,
  onConsentChange,
}: SurveyConsentCardProps) {
  return (
    <section
      aria-labelledby="consent-heading"
      className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm"
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
          <ShieldCheck className="size-4.5" />
        </div>
        <h2 id="consent-heading" className="text-[16px] font-medium text-zinc-900">
          Consent & Data Notice
        </h2>
      </div>
      <dl className="grid gap-x-8 gap-y-6 text-[14px] text-zinc-600 sm:grid-cols-2">
        <div>
          <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Notice</dt>
          <dd className="leading-relaxed text-zinc-800">{consent.notice}</dd>
        </div>
        <div>
          <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Purpose</dt>
          <dd className="leading-relaxed text-zinc-800">{consent.purpose}</dd>
        </div>
        <div>
          <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Retention</dt>
          <dd className="leading-relaxed text-zinc-800">{consent.retention}</dd>
        </div>
        <div>
          <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Contact</dt>
          <dd className="leading-relaxed text-zinc-800">{consent.contact}</dd>
        </div>
      </dl>
      <div className="mt-8 border-t border-zinc-100 pt-6">
        <label
          htmlFor="survey-consent"
          className="flex cursor-pointer items-center gap-3.5 text-[14px] font-medium text-zinc-900"
        >
          <input
            id="survey-consent"
            name="consent"
            type="checkbox"
            required
            checked={consentAccepted}
            onChange={(event) => onConsentChange(event.target.checked)}
            aria-invalid={consentTouched && !consentAccepted}
            aria-describedby={consentTouched && !consentAccepted ? "consent-error" : undefined}
            className="size-5 cursor-pointer rounded-sm accent-zinc-900 transition-all hover:ring-4 hover:ring-zinc-900/5"
            disabled={staleConsent}
          />
          <span>I have read and agree to this data notice.</span>
        </label>
        {consentTouched && !consentAccepted && (
          <p id="consent-error" role="alert" className="mt-3 text-[13.5px] font-medium text-red-500">
            Consent is required before submitting.
          </p>
        )}
        {staleConsent && (
          <p className="mt-3 text-[13.5px] font-medium text-amber-700">
            This consent notice is out of date. Please reload the page.
          </p>
        )}
      </div>
    </section>
  )
}
