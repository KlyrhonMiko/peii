"use client";

import { Suspense } from "react";
import {
  ArrowRight,
  BarChart3,
  GraduationCap,
  TrendingUp,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoginModal } from "@/components/LoginModal";
import { MfaModal } from "@/components/MfaModal";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { CallToActionSection } from "@/components/CallToActionSection";
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
          <Suspense fallback={<Button className="h-9 px-5 text-[14px] font-semibold bg-slate-900 text-white hover:bg-slate-800 rounded-lg shadow-sm transition-all">Login</Button>}>
            <LoginModal />
          </Suspense>
        </div>
      </nav>

      <main className="relative z-10 w-full">
        {/* Typography Hero Section */}
        <section className="relative px-6 lg:px-12 pt-24 md:pt-36 pb-24 md:pb-32 max-w-[1400px] mx-auto w-full flex flex-col items-center text-center">
          <div className="flex flex-col items-center max-w-4xl">
            <motion.h1 
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
              className="text-[clamp(3rem,7vw,5.5rem)] leading-[1.05] tracking-tight font-extrabold text-slate-900"
            >
              Pasig Education<br />Impact Index.
            </motion.h1>
            
            <motion.p 
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
              className="mt-8 text-[18px] sm:text-[20px] text-slate-600 leading-relaxed font-medium max-w-2xl"
            >
              The authoritative research platform for tracking alumni employability, gathering qualitative feedback, and measuring outcomes across five core educational impact domains.
            </motion.p>
            
            <motion.div 
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
              className="flex flex-col sm:flex-row gap-4 mt-12 w-full sm:w-auto"
            >
              <Suspense fallback={
                <Button
                  size="lg"
                  className="w-full sm:w-auto h-14 px-8 text-[15px] bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all rounded-xl font-semibold group"
                >
                  Researcher Portal
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              }>
                <LoginModal>
                  <Button
                    size="lg"
                    className="w-full sm:w-auto h-14 px-8 text-[15px] bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition-all rounded-xl font-semibold group"
                  >
                    Researcher Portal
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                </LoginModal>
              </Suspense>
            </motion.div>
          </div>
        </section>

        <CallToActionSection />

        {/* Bento Features Section */}
        <section className="w-full bg-slate-50 border-t border-slate-200">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-24 lg:py-32">
            
            <div className="max-w-3xl mb-16 flex flex-col items-start">
              <h2 className="text-[clamp(2.5rem,4vw,3.5rem)] font-extrabold tracking-tight text-slate-900 leading-[1.05]">
                System capabilities
              </h2>
              <p className="text-[18px] sm:text-[20px] text-slate-600 mt-5 leading-relaxed font-medium max-w-2xl">
                Purpose-built tools to administer surveys, ensure data privacy, and generate actionable intelligence for educational policy.
              </p>
            </div>

            {/* Gapless Bento Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-[1px] bg-slate-200 border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
              
              {/* 5 Impact Domains - Large Cell */}
              <motion.div 
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="md:col-span-8 bg-white p-8 lg:p-14 relative group flex flex-col justify-between overflow-hidden min-h-[400px]"
              >
                <div className="relative z-10 max-w-lg mb-24 lg:mb-32">
                  <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mb-8 shadow-sm">
                    <BarChart3 className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-[28px] lg:text-[32px] font-extrabold text-slate-900 mb-4 tracking-tight leading-tight">
                    The 5 Impact Domains
                  </h3>
                  <p className="text-[16px] lg:text-[18px] text-slate-500 leading-relaxed font-medium">
                    Measure pre- and post-graduation indices across Employability, Family Upliftment, Personal Development, Civic Engagement, and Governance Trust.
                  </p>
                </div>
                
                {/* Abstract UI element (5 bars) */}
                <div className="absolute right-0 bottom-0 w-[85%] sm:w-2/3 h-[55%] bg-slate-50 rounded-tl-3xl border-t border-l border-slate-200 transform translate-x-12 translate-y-12 group-hover:translate-x-6 group-hover:translate-y-6 transition-transform duration-700 ease-out flex items-end p-6 sm:p-8 shadow-xl gap-3">
                    {[
                      {h: 40, c: "bg-slate-200"}, 
                      {h: 65, c: "bg-slate-300"}, 
                      {h: 45, c: "bg-slate-200"}, 
                      {h: 85, c: "bg-indigo-600"}, 
                      {h: 55, c: "bg-slate-300"}
                    ].map((bar, i) => (
                      <div key={i} className={`w-full rounded-t-md relative overflow-hidden transition-all duration-500 hover:opacity-80 ${bar.c}`} style={{ height: `${bar.h}%` }} />
                    ))}
                </div>
              </motion.div>

              {/* Policy & Feedback - Tall Cell */}
              <motion.div 
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
                className="md:col-span-4 bg-slate-900 p-8 lg:p-14 relative group flex flex-col justify-between overflow-hidden min-h-[400px]"
              >
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-8 backdrop-blur-sm border border-white/10 group-hover:scale-105 transition-transform">
                    <TrendingUp className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-[28px] lg:text-[32px] font-extrabold text-white mb-4 tracking-tight leading-tight">
                    Policy & Feedback
                  </h3>
                  <p className="text-[16px] lg:text-[18px] text-slate-400 leading-relaxed font-medium">
                    Automated sentiment classification and dimension detection for qualitative alumni feedback, enabling data-informed interventions.
                  </p>
                </div>

                {/* Abstract decorative element */}
                <div className="mt-16 w-full h-32 relative transform group-hover:-translate-y-2 transition-transform duration-700 ease-out origin-bottom flex flex-col gap-3">
                   <div className="h-3 w-3/4 bg-white/10 rounded-full" />
                   <div className="h-3 w-full bg-white/10 rounded-full" />
                   <div className="h-3 w-5/6 bg-white/10 rounded-full" />
                   <div className="h-3 w-2/3 bg-white/20 rounded-full mt-2" />
                </div>
              </motion.div>

              {/* Employability - Wide Cell */}
              <motion.div 
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
                className="md:col-span-5 bg-white p-8 lg:p-14 relative group flex flex-col justify-between overflow-hidden min-h-[350px]"
              >
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-8 group-hover:-translate-y-1 transition-transform duration-500 shadow-sm">
                    <GraduationCap className="h-7 w-7 text-indigo-600" />
                  </div>
                  <h3 className="text-[28px] lg:text-[32px] font-extrabold text-slate-900 mb-4 tracking-tight leading-tight">
                    Alumni Employability
                  </h3>
                  <p className="text-[16px] lg:text-[18px] text-slate-500 leading-relaxed font-medium">
                    Track hiring velocity, income distribution, degree alignment, and employment stability across graduating batches.
                  </p>
                </div>
              </motion.div>
              
              {/* Privacy - Wide Cell */}
              <motion.div 
                initial={reduce ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
                className="md:col-span-7 bg-indigo-600 p-8 lg:p-14 relative group flex flex-col justify-between overflow-hidden min-h-[350px]"
              >
                <div className="relative z-10 max-w-md">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-8 backdrop-blur-md border border-white/20 group-hover:rotate-[15deg] transition-transform duration-500">
                    <Shield className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-[28px] lg:text-[32px] font-extrabold text-white mb-4 tracking-tight leading-tight">
                    Secure Survey Management
                  </h3>
                  <p className="text-[16px] lg:text-[18px] text-indigo-100/90 leading-relaxed font-medium">
                    Distribute authenticated questionnaires, manage response retention, and maintain strict data privacy for educational records.
                  </p>
                </div>

                {/* Abstract Shield */}
                <div className="absolute right-0 bottom-0 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity duration-700 transform translate-x-8 translate-y-8">
                   <Shield className="w-72 h-72 text-white" />
                </div>
              </motion.div>

            </div>
          </div>
        </section>
      </main>
      <Suspense fallback={null}>
        <ForgotPasswordModal />
        <MfaModal />
      </Suspense>
    </div>
  );
}
