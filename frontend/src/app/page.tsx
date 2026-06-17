"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  GraduationCap,
  ClipboardCheck,
  TrendingUp,
  Shield,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

function AnimatedCounter({
  end,
  suffix = "",
  duration = 2000,
}: {
  end: number;
  suffix?: string;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setHasStarted(true), 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hasStarted) return;
    let start = 0;
    const increment = end / (duration / 16);
    const counter = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(counter);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(counter);
  }, [hasStarted, end, duration]);

  return (
    <span>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative min-h-screen bg-white text-slate-900 font-sans selection:bg-indigo-600 selection:text-white overflow-hidden">
      {/* Subtle background texture */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-bl from-indigo-50/80 via-blue-50/40 to-transparent rounded-full translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-slate-100/60 via-indigo-50/30 to-transparent rounded-full -translate-x-1/4 translate-y-1/4" />
        {/* Grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="relative z-20 flex items-center justify-between px-6 lg:px-16 h-[72px]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 shadow-lg shadow-indigo-600/15">
            <GraduationCap className="h-[18px] w-[18px] text-white" />
          </div>
          <span className="text-[16px] font-bold tracking-tight text-slate-900">
            PEII
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="text-[13px] text-slate-500 hover:text-slate-800 hover:bg-slate-50 hidden sm:flex font-medium h-9 px-4 rounded-lg"
          >
            Documentation
          </Button>
          <Link href="/researcher/dashboard">
            <Button className="h-9 px-5 text-[13px] font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-lg shadow-sm transition-all">
              Login
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 w-full">
        <section className="relative flex flex-col justify-between min-h-[calc(100vh-72px)] px-6 lg:px-16 py-6 md:py-10 max-w-6xl mx-auto w-full">
          {/* Spacer to push content down or help vertical centering */}
          <div className="hidden md:block flex-1" />

          <div className="flex flex-col items-center w-full text-center my-auto">
            {/* Oversized Headline */}
            <h1
              className={`text-center leading-[0.95] tracking-[-0.04em] font-extrabold transition-all duration-700 delay-100 ${
                mounted
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-6"
              }`}
            >
              <span className="block text-[clamp(2.5rem,7vw,4.8rem)] text-slate-900">
                Measure
              </span>
              <span className="block text-[clamp(2.5rem,7vw,4.8rem)] text-slate-900">
                Educational
              </span>
              <span className="block text-[clamp(2.5rem,7vw,4.8rem)] text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-500">
                Impact.
              </span>
            </h1>

            {/* Subtitle */}
            <p
              className={`max-w-md mt-5 text-[13px] sm:text-[14px] text-slate-400 text-center leading-relaxed font-normal transition-all duration-700 delay-200 ${
                mounted
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-6"
              }`}
            >
              The unified platform for tracking alumni outcomes, analyzing
              institutional effectiveness, and driving data-informed
              educational policy.
            </p>

            {/* CTA Buttons */}
            <div
              className={`flex flex-col sm:flex-row gap-3 mt-8 w-full sm:w-auto transition-all duration-700 delay-300 ${
                mounted
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-6"
              }`}
            >
              <Link href="/researcher/dashboard" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-11 px-6 text-[13px] bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/20 transition-all hover:shadow-indigo-600/30 rounded-xl font-semibold group"
                >
                  <BarChart3 className="mr-2 h-4 w-4" />
                  Researcher Portal
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>

              <Link href="/survey/demo-token" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-11 px-6 text-[13px] border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 rounded-xl font-semibold transition-all"
                >
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Take Alumni Survey
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex-1 hidden md:block" />

          {/* Stats Row (pinned to bottom of viewport) */}
          <div
            className={`flex flex-wrap items-center justify-center gap-6 sm:gap-12 mt-8 md:mt-0 pt-4 border-t border-slate-100/50 transition-all duration-700 delay-[400ms] ${
              mounted
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-6"
            }`}
          >
            <div className="text-center">
              <div className="text-[26px] sm:text-[30px] font-bold tracking-tight text-slate-900 leading-none">
                <AnimatedCounter end={12450} suffix="+" />
              </div>
              <div className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-wider">
                Alumni Tracked
              </div>
            </div>
            <div className="w-px h-8 bg-slate-200 hidden sm:block" />
            <div className="text-center">
              <div className="text-[26px] sm:text-[30px] font-bold tracking-tight text-slate-900 leading-none">
                <AnimatedCounter end={91} suffix="%" />
              </div>
              <div className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-wider">
                Employment Rate
              </div>
            </div>
            <div className="w-px h-8 bg-slate-200 hidden sm:block" />
            <div className="text-center">
              <div className="text-[26px] sm:text-[30px] font-bold tracking-tight text-slate-900 leading-none">
                <AnimatedCounter end={45} suffix="" />
              </div>
              <div className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-wider">
                Institutions
              </div>
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="w-full max-w-6xl mx-auto px-6 lg:px-16">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        </div>


        {/* Features Section */}
        <div className="w-full max-w-6xl mx-auto py-20 lg:py-28">
          <div
            className={`text-center mb-14 transition-all duration-700 delay-500 ${
              mounted
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-6"
            }`}
          >
            <h2 className="text-[28px] sm:text-[32px] font-bold tracking-tight text-slate-900">
              Built for Evidence-Based Education
            </h2>
            <p className="text-[15px] text-slate-400 mt-3 max-w-lg mx-auto leading-relaxed">
              Purpose-built tools to measure, track, and improve educational
              outcomes across the entire alumni lifecycle.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                icon: BarChart3,
                title: "Actionable Analytics",
                description:
                  "Deep dive into the factors driving alumni success with comprehensive dashboards and real-time data visualization.",
                iconBg: "bg-blue-50",
                iconColor: "text-blue-600",
              },
              {
                icon: TrendingUp,
                title: "Cohort Tracking",
                description:
                  "Monitor multi-year trends and accurately assess educational impact with longitudinal cohort analysis.",
                iconBg: "bg-indigo-50",
                iconColor: "text-indigo-600",
              },
              {
                icon: Zap,
                title: "Seamless Surveys",
                description:
                  "Mobile-first, high-conversion survey interfaces designed for gathering essential alumni data efficiently.",
                iconBg: "bg-violet-50",
                iconColor: "text-violet-600",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="group relative p-7 rounded-2xl border border-slate-200/80 bg-white hover:border-slate-300/80 transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50"
              >
                <div
                  className={`w-11 h-11 rounded-xl ${feature.iconBg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}
                >
                  <feature.icon
                    className={`h-5 w-5 ${feature.iconColor}`}
                  />
                </div>
                <h3 className="text-[16px] font-bold text-slate-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-[14px] text-slate-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust Bar */}
        <div className="w-full max-w-6xl mx-auto pb-16">
          <div className="flex items-center justify-center gap-6 text-[12px] font-medium text-slate-400">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>Data Privacy Compliant</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <div className="flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Endorsed by DepEd Pasig</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-slate-300 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>Real-time Processing</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
