import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Target, TrendingUp, Search, Zap, Sparkles, FileText, CheckCircle2 } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Features | ResuMatch AI",
  description: "Explore ResuMatch AI features: ATS scoring, job matching, missing skills detection, AI bullet rewrites, and more.",
};

const FEATURES = [
  {
    title: "Resume Score (0-100)",
    desc: "Get an instant score across ATS compatibility, keyword density, formatting, and readability. Know exactly where you stand before a recruiter does.",
    badge: "Free",
    icon: Target,
    color: "from-indigo-500 to-indigo-700",
  },
  {
    title: "Job Match %",
    desc: "AI compares your resume against live job descriptions and shows how well you match each role — with a percentage score.",
    badge: "Free",
    icon: TrendingUp,
    color: "from-purple-500 to-purple-700",
  },
  {
    title: "Missing Skills Detection",
    desc: "See exactly which skills employers are looking for that are absent from your resume — and how to add them effectively.",
    badge: "Free",
    icon: Search,
    color: "from-amber-500 to-orange-600",
  },
  {
    title: "ATS Optimization",
    desc: "Ensure your resume passes Applicant Tracking Systems used by top Indian companies like TCS, Infosys, Flipkart, and Swiggy.",
    badge: "Free",
    icon: Zap,
    color: "from-blue-500 to-brand-700",
  },
  {
    title: "AI Bullet Point Rewrites",
    desc: "Weak bullet points rewritten by AI to be impact-focused, quantified, and action-oriented. Copy with one click.",
    badge: "Pro",
    icon: Sparkles,
    color: "from-rose-500 to-pink-700",
  },
  {
    title: "Cover Letter Generator",
    desc: "Generate a tailored cover letter for any role in seconds. Customized for the Indian job market tone and format.",
    badge: "Pro",
    icon: FileText,
    color: "from-emerald-500 to-green-700",
  },
];

const HIGHLIGHTS = [
  "Scored against 500+ live job roles",
  "ATS-verified formatting checks",
  "Indian job market tuned analysis",
  "No credit card required to start",
];

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Features"
        title="Everything you need to"
        highlight="land your next role"
        subtitle="Built specifically for the Indian job market — from freshers to professionals targeting FAANG. Every tool is designed to get you past the ATS and in front of recruiters."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 grid grid-cols-2 gap-4 sm:mb-16 sm:grid-cols-4">
            {HIGHLIGHTS.map((h, i) => (
              <Reveal key={h} delay={i * 0.08}>
                <div className="flex items-start gap-2.5 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-base)] p-4 shadow-[var(--shadow-card)]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-500" />
                  <p className="text-[13px] font-semibold leading-snug text-[var(--text-muted)]">{h}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 sm:gap-8">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.1}>
                <div className="group relative h-full overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]">
                  <div
                    className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${f.color} opacity-[0.08] blur-2xl transition-opacity duration-300 group-hover:opacity-20`}
                  />
                  <div className="relative flex items-start justify-between">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${f.color} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}
                    >
                      <f.icon className="h-6 w-6" />
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                        f.badge === "Free"
                          ? "bg-accent-50 text-accent-700"
                          : "bg-brand-50 text-brand-700"
                      }`}
                    >
                      {f.badge}
                    </span>
                  </div>
                  <h3 className="relative mt-6 text-lg font-bold tracking-tight text-[var(--text-primary)]">
                    {f.title}
                  </h3>
                  <p className="relative mt-2.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-base)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-8 text-center text-white shadow-2xl sm:p-14">
              <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-accent-500/30 blur-3xl" />
              <h2 className="relative text-h2 font-bold">Ready to see your resume score?</h2>
              <p className="relative mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/80">
                Upload your resume and get a free ATS analysis with actionable suggestions in seconds.
              </p>
              <div className="relative mt-8 flex justify-center">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-[15px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
                >
                  Analyze My Resume Free
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
