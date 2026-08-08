import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Upload, Sparkles, CheckCircle2, FileText, Wand2, Send } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "How it Works | ResuMatch AI",
  description: "Upload your resume, let AI scan it against live jobs, and get an optimized, interview-ready resume in minutes.",
};

const STEPS = [
  {
    step: "01",
    title: "Upload",
    desc: "Drop your current PDF or Word resume. No formatting needed — our parser handles messy layouts, tables, and multi-column designs.",
    icon: Upload,
    color: "from-brand-500 to-brand-700",
  },
  {
    step: "02",
    title: "AI Scan",
    desc: "Our models analyze your profile and identify matches across 500+ live job descriptions. Get an ATS score, skill gaps, and keyword analysis.",
    icon: Sparkles,
    color: "from-purple-500 to-purple-700",
  },
  {
    step: "03",
    title: "Optimize",
    desc: "Rewrite weak bullets, fill missing skills, and apply to jobs where you're a Top 10% match. Export an ATS-ready resume in one click.",
    icon: Wand2,
    color: "from-accent-500 to-accent-700",
  },
];

const DETAILS = [
  {
    title: "Instant ATS Score",
    desc: "Know exactly how your resume performs against applicant tracking systems used by Indian employers.",
    icon: CheckCircle2,
  },
  {
    title: "Keyword Density Analysis",
    desc: "See which keywords from live job descriptions your resume is missing, ranked by importance.",
    icon: FileText,
  },
  {
    title: "Role-Specific Rewrites",
    desc: "Tailored bullet points that match the exact tone, tools, and metrics recruiters look for.",
    icon: Wand2,
  },
  {
    title: "One-Click Apply",
    desc: "Export a polished, ATS-safe resume and cover letter ready for any application portal.",
    icon: Send,
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="How it Works"
        title="Three steps to"
        highlight="career success"
        subtitle="Faster than cooking Maggi. From raw resume to interview-ready profile in under five minutes."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="relative grid gap-8 sm:grid-cols-3 sm:gap-6 lg:gap-10">
            <div className="absolute left-0 right-0 top-10 hidden h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent sm:block" />
            {STEPS.map((s, i) => (
              <Reveal key={s.step} delay={i * 0.12}>
                <div className="group relative flex flex-col items-center rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-8 text-center shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]">
                  <div className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-brand-600 to-brand-800 px-3 py-1 text-[11px] font-black text-white shadow-md">
                    STEP {s.step}
                  </div>
                  <div
                    className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${s.color} text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
                  >
                    <s.icon className="h-8 w-8" />
                  </div>
                  <h3 className="mt-6 text-xl font-bold tracking-tight text-[var(--text-primary)]">{s.title}</h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-base)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-label text-brand-600">Under the hood</p>
              <h2 className="mt-3 text-h2 font-bold tracking-tight">What you get at every step</h2>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {DETAILS.map((d, i) => (
              <Reveal key={d.title} delay={(i % 2) * 0.1}>
                <div className="flex gap-4 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-6 transition-all duration-300 hover:border-brand-200 hover:bg-white">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <d.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[var(--text-primary)]">{d.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{d.desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-600 to-brand-900 p-8 text-center text-white shadow-2xl sm:p-14">
              <h2 className="relative text-h2 font-bold">Start with a free analysis</h2>
              <p className="relative mx-auto mt-3 max-w-lg text-[15px] text-white/80">
                No credit card. No commitment. Just a smarter resume.
              </p>
              <div className="relative mt-8 flex justify-center">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-[15px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
                >
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
