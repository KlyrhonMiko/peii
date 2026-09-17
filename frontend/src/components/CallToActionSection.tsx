"use client";

import { useEffect, useState } from "react";
import { fetchCtaSurvey, Survey } from "@/lib/surveys";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

export function CallToActionSection() {
  const [ctaSurvey, setCtaSurvey] = useState<{ survey_id: string; title: string; description?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const reduce = useReducedMotion();

  useEffect(() => {
    const loadCta = async () => {
      try {
        const survey = await fetchCtaSurvey();
        setCtaSurvey(survey);
      } catch (error) {
        // Silently fail if no CTA exists or error occurs
        console.error("Failed to load CTA survey:", error);
      } finally {
        setLoading(false);
      }
    };
    void loadCta();
  }, []);

  if (loading || !ctaSurvey) {
    return null;
  }

  return (
    <section className="w-full bg-indigo-900 border-t border-indigo-800 text-white relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="cta-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M0 40L40 0H20L0 20M40 40V20L20 40" stroke="currentColor" strokeWidth="1" fill="none" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cta-pattern)" />
        </svg>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-20 lg:py-28 relative z-10 flex flex-col md:flex-row items-center justify-between gap-12">
        <div className="max-w-2xl">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-800/50 border border-indigo-700/50 text-indigo-200 text-sm font-semibold mb-6">
              <FileText className="size-4" />
              <span>Active Questionnaire</span>
            </div>
            <h2 className="text-[clamp(2rem,3vw,3rem)] font-extrabold tracking-tight text-white leading-tight mb-4">
              {ctaSurvey.title}
            </h2>
            <p className="text-[18px] text-indigo-200 leading-relaxed font-medium">
              {ctaSurvey.description || "Help shape the future of Pasig's educational policies by participating in our latest survey. Your feedback is crucial."}
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          className="shrink-0"
        >
          <Link href={`/s/${ctaSurvey.survey_id}`}>
            <Button
              size="lg"
              className="h-16 px-10 text-[16px] bg-white text-indigo-900 hover:bg-slate-50 shadow-xl transition-all rounded-xl font-bold group"
            >
              Participate Now
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
