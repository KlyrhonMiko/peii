"use client"

import type { PublicSurveyConsent } from "@/lib/public-survey"

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
      className="mt-4 rounded-xl border border-slate-200 bg-white px-7 py-5 shadow-sm ring-1 ring-black/[0.04]"
    >
      <h2 id="consent-heading" className="text-base font-semibold text-slate-900">
        Consent and data notice
      </h2>
      <dl className="mt-3 grid gap-3 text-sm text-slate-600">
        <div>
          <dt className="font-semibold text-slate-800">Notice</dt>
          <dd>{consent.notice}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800">Purpose</dt>
          <dd>{consent.purpose}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800">Retention</dt>
          <dd>{consent.retention}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-800">Contact</dt>
          <dd>{consent.contact}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <label
          htmlFor="survey-consent"
          className="flex cursor-pointer items-start gap-3 text-sm font-medium text-slate-800"
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
            className="mt-0.5 size-4 accent-indigo-600"
            disabled={staleConsent}
          />
          <span>Consent: I have read and agree to this data notice.</span>
        </label>
        {consentTouched && !consentAccepted && (
          <p id="consent-error" role="alert" className="mt-2 text-sm font-medium text-red-600">
            Consent is required before submitting.
          </p>
        )}
        {staleConsent && (
          <p className="mt-2 text-sm font-medium text-amber-700">
            This consent notice is out of date. Please reload the page.
          </p>
        )}
      </div>
    </section>
  )
}
