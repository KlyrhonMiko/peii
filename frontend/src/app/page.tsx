"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  GraduationCap,
  ClipboardCheck,
  TrendingUp,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, useReducedMotion } from "motion/react";

export default function Home() {
  const reduce = useReducedMotion();

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-600 selection:text-white overflow-hidden">
      {/* Navigation */}
      <nav className="relative z-20 flex items-center justify-between px-6 lg:px-12 h-[72px] max-w-[1400px] mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 shadow-sm">
            <GraduationCap className="h-[18px] w-[18px] text-white" />
          </div>
          <span className="text-[17px] font-bold tracking-tight text-slate-900">
            PEII
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="text-[14px] text-slate-600 hover:text-slate-900 hidden sm:flex font-medium h-9 px-4 rounded-lg"
          >
            Documentation
          </Button>
          <Link href="/login?returnTo=/researcher/dashboard">
            <Button className="h-9 px-5 text-[14px] font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-lg shadow-sm transition-all">
              Login
            </Button>
          </Link>
        </div>
      </nav>

      <main className="relative z-10 w-full">
        {/* Typography Hero Section */}
        <section className="relative px-6 lg:px-12 pt-24 md:pt-36 pb-24 md:pb-40 max-w-[1400px] mx-auto w-full flex flex-col items-center text-center">
          <div className="flex flex-col items-center max-w-4xl">
            <motion.h1 
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="text-[clamp(3rem,8vw,5.5rem)] leading-[1.05] tracking-tight font-extrabold text-slate-900"
            >
              Measure Educational Impact with Clarity.
            </motion.h1>
            
            <motion.p 
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
              className="mt-8 text-[18px] sm:text-[20px] text-slate-600 leading-relaxed font-normal max-w-2xl"
            >
              The unified platform for tracking alumni outcomes, analyzing institutional effectiveness, and driving data-informed educational policy.
            </motion.p>
            
            <motion.div 
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              className="flex flex-col sm:flex-row gap-4 mt-12 w-full sm:w-auto"
            >
              <Link href="/login?returnTo=/researcher/dashboard" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-14 px-8 text-[15px] bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all rounded-xl font-semibold group"
                >
                  Researcher Portal
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>

              <Link href="/survey/demo-token" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto h-14 px-8 text-[15px] border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 rounded-xl font-semibold transition-all"
                >
                  <ClipboardCheck className="mr-2 h-5 w-5" />
                  Take Alumni Survey
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Bento Features Section */}
        <section className="w-full bg-slate-50/50 border-t border-slate-200">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-24 lg:py-32">
            
            <div className="max-w-3xl mb-20 flex flex-col items-start">
              <h2 className="text-[clamp(2.5rem,4vw,3.5rem)] font-extrabold tracking-tighter text-slate-900 leading-[1.05]">
                Actionable intelligence for educational policy.
              </h2>
              <p className="text-[18px] sm:text-[20px] text-slate-600 mt-6 leading-relaxed font-medium max-w-2xl">
                Purpose-built tools to measure, track, and improve outcomes across the entire alumni lifecycle. Stop guessing and start knowing.
              </p>
            </div>

            {/* Gapless Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-[1px] bg-slate-200 border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
              
              {/* Analytics - Large Cell */}
              <motion.div 
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="md:col-span-8 bg-white p-8 lg:p-14 relative group flex flex-col justify-between overflow-hidden min-h-[400px]"
              >
                <div className="relative z-10 max-w-lg mb-24 lg:mb-32">
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mb-8 shadow-md">
                    <BarChart3 className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-[28px] lg:text-[36px] font-extrabold text-slate-900 mb-4 tracking-tight leading-tight">
                    Comprehensive Analytics
                  </h3>
                  <p className="text-[16px] lg:text-[18px] text-slate-500 leading-relaxed font-medium">
                    Deep dive into the factors driving alumni success with comprehensive dashboards and real-time visualization of cohort trajectories.
                  </p>
                </div>
                
                {/* Abstract UI element */}
                <div className="absolute right-0 bottom-0 w-[85%] sm:w-2/3 h-[55%] bg-slate-50 rounded-tl-3xl border-t border-l border-slate-200 transform translate-x-12 translate-y-12 group-hover:translate-x-6 group-hover:translate-y-6 transition-transform duration-700 ease-out flex items-start p-6 sm:p-8 shadow-2xl">
                   <div className="w-full flex items-end gap-2 sm:gap-4 h-full pb-2">
                      {[40, 70, 45, 90, 60, 85].map((h, i) => (
                        <div key={i} className="w-full bg-slate-200 rounded-t-md relative overflow-hidden" style={{ height: `${h}%` }}>
                          <div 
                            className="absolute bottom-0 w-full bg-slate-800 rounded-t-md transition-all duration-700 ease-out group-hover:bg-indigo-600" 
                            style={{ height: `${(i % 3 + 1) * 20 + 20}%` }}
                          />
                        </div>
                      ))}
                   </div>
                </div>
              </motion.div>

              {/* Cohort Tracking - Tall Cell */}
              <motion.div 
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
                className="md:col-span-4 bg-indigo-600 p-8 lg:p-14 relative group flex flex-col justify-between overflow-hidden min-h-[400px]"
              >
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-8 backdrop-blur-md border border-white/20">
                    <TrendingUp className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-[28px] lg:text-[32px] font-extrabold text-white mb-4 tracking-tight leading-tight">
                    Cohort Tracking
                  </h3>
                  <p className="text-[16px] lg:text-[18px] text-indigo-100/90 leading-relaxed font-medium">
                    Monitor multi-year trends and accurately assess educational impact with rigorous longitudinal analysis.
                  </p>
                </div>

                {/* Abstract decorative element */}
                <div className="mt-16 w-full h-40 relative transform group-hover:scale-105 transition-transform duration-700 ease-out origin-bottom">
                   <div className="absolute inset-0 bg-gradient-to-t from-indigo-600 to-transparent z-10" />
                   <svg className="w-full h-full text-indigo-400/50" viewBox="0 0 100 40" preserveAspectRatio="none">
                     <path d="M0,40 L0,20 Q10,10 20,20 T40,15 T60,25 T80,10 T100,20 L100,40 Z" fill="currentColor" />
                   </svg>
                </div>
              </motion.div>

              {/* Surveys - Wide Cell */}
              <motion.div 
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
                className="md:col-span-5 bg-white p-8 lg:p-14 relative group flex flex-col justify-between overflow-hidden min-h-[350px]"
              >
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-8 group-hover:-translate-y-1 transition-transform duration-500 shadow-sm">
                    <ClipboardCheck className="h-7 w-7 text-slate-900" />
                  </div>
                  <h3 className="text-[28px] lg:text-[32px] font-extrabold text-slate-900 mb-4 tracking-tight leading-tight">
                    Seamless Surveys
                  </h3>
                  <p className="text-[16px] lg:text-[18px] text-slate-500 leading-relaxed font-medium">
                    Mobile-first, high-conversion interfaces designed for gathering essential alumni data efficiently and securely.
                  </p>
                </div>
              </motion.div>
              
              {/* Privacy - Wide Cell */}
              <motion.div 
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
                className="md:col-span-7 bg-slate-900 p-8 lg:p-14 relative group flex flex-col justify-between overflow-hidden min-h-[350px]"
              >
                <div className="relative z-10 max-w-md">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-8 backdrop-blur-md border border-white/10 group-hover:rotate-[15deg] transition-transform duration-500">
                    <Shield className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-[28px] lg:text-[32px] font-extrabold text-white mb-4 tracking-tight leading-tight">
                    Data Privacy Compliant
                  </h3>
                  <p className="text-[16px] lg:text-[18px] text-slate-400 leading-relaxed font-medium">
                    Endorsed by DepEd Pasig. Built from the ground up to handle sensitive educational and employment records securely.
                  </p>
                </div>

                {/* Abstract Shield */}
                <div className="absolute right-0 bottom-0 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity duration-700 transform translate-x-8 translate-y-8">
                   <Shield className="w-72 h-72 text-white" />
                </div>
              </motion.div>

            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
