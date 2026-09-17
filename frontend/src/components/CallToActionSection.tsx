"use client";

import { useEffect, useState } from "react";
import { fetchCtaSurvey } from "@/lib/surveys";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
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

  // Format ALL CAPS titles to Title Case to match the editorial vibe of the rest of the site
  const formatTitle = (text: string) => {
    return text.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  return (
    <section className="w-full border-t border-b border-slate-200 bg-white">
      <div className="max-w-[1200px] mx-auto px-6 py-12 md:py-16">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8"
        >
          <div className="max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-2">
              {formatTitle(ctaSurvey.title)}
            </h2>
            <p className="text-base text-slate-500 font-medium leading-relaxed">
              {ctaSurvey.description || "Help shape the future of Pasig's educational policies by participating in our latest survey."}
            </p>
          </div>

          <div className="shrink-0 w-full md:w-auto">
            <Link href={`/s/${ctaSurvey.survey_id}`} className="w-full md:w-auto block">
              <Button
                className="w-full md:w-auto h-12 px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition-colors shadow-none"
              >
                Participate Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
