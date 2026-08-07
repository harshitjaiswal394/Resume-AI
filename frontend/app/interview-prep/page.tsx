import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mic, Star, Users, CalendarDays, FileText, Target, Repeat } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Interview Prep | ResuMatch AI",
  description: "Prepare for Indian tech interviews with structured frameworks, mock interview tips, and company-specific guidance.",
};

const GUIDES = [
  {
    title: "Master the STAR method",
    desc: "Structure every answer as Situation, Task, Action, Result. It keeps answers crisp and gives interviewers the evidence they want.",
    icon: Target,
    tag: "Behavioral",
  },
  {
    title: "Prepare your 'Tell me about yourself'",
    desc: "Craft a 60-90 second pitch: who you are, your top 2-3 achievements, and why this role. Practice it until it sounds natural.",
    icon: Mic,
    tag: "Warm-up",
  },
  {
    title: "Know the company's stack and product",
    desc: "For product companies, understand their architecture and latest releases. For services firms, know your domain and common client scenarios.",
    icon: Users,
    tag: "Research",
  },
  {
    title: "Mock interviews beat reading",
    desc: "Do at least two timed mock interviews with peers or platforms before the real one. Feedback on pacing and clarity is gold.",
    icon: Repeat,
    tag: "Practice",
  },
  {
    title: "Use the 30-second recap",
    desc: "When a question goes long, wrap up with 'In short, I delivered X, which improved Y.' Interviewers remember clear conclusions.",
    icon: Star,
    tag: "Delivery",
  },
  {
    title: "Have 3 questions ready to ask",
    desc: "Ask about team challenges, growth paths, or the product roadmap. It signals genuine interest and gives you leverage.",
    icon: CalendarDays,
    tag: "Closing",
  },
];

const CHECKLIST = [
  "Re-read your own resume — you'll be asked about every line on it.",
  "Prepare 2-3 projects/stories you can dive deep into on request.",
  "Practice the problem-solving intro: approach, trade-offs, testing.",
  "Prepare salary expectations with a researched range for your city.",
  "Have your leave/notice period and joining availability ready.",
  "Test your mic, camera, and internet before a virtual interview.",
];

export default function InterviewPrepPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Interview Prep"
        title="Walk into your next interview"
        highlight="fully prepared"
        subtitle="Structured frameworks, delivery tips, and company-specific guidance to help you convert interviews into offers — at product companies and services firms alike."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 sm:gap-8">
            {GUIDES.map((g, i) => (
              <Reveal key={g.title} delay={(i % 3) * 0.1}>
                <div className="group relative h-full overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]">
                  <div
                    className={`pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${
                      i % 2 === 0 ? "from-brand-500 to-brand-700" : "from-accent-500 to-accent-700"
                    } opacity-[0.08] blur-2xl transition-opacity duration-300 group-hover:opacity-20`}
                  />
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md transition-transform duration-300 group-hover:scale-110 ${
                        i % 2 === 0
                          ? "bg-gradient-to-br from-brand-500 to-brand-700"
                          : "bg-gradient-to-br from-accent-500 to-accent-700"
                      }`}
                    >
                      <g.icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-600">
                      {g.tag}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[16px] font-bold leading-snug text-[var(--text-primary)]">{g.title}</h3>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{g.desc}</p>
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
              <p className="text-label text-brand-600">Pre-interview checklist</p>
              <h2 className="mt-3 text-h2 font-bold tracking-tight">The night before</h2>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {CHECKLIST.map((item, i) => (
              <Reveal key={item} delay={(i % 2) * 0.08}>
                <div className="flex items-start gap-3.5 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 transition-all duration-300 hover:border-brand-200 hover:bg-white">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-50">
                    <FileText className="h-3.5 w-3.5 text-accent-700" />
                  </div>
                  <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">{item}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1}>
            <div className="mt-16 flex flex-col items-center justify-between gap-6 rounded-[28px] bg-gradient-to-br from-brand-600 to-brand-900 p-8 text-white shadow-2xl sm:flex-row sm:p-10">
              <div>
                <h3 className="text-h3 font-bold">Land more interview calls first</h3>
                <p className="mt-1.5 text-[14px] text-white/80">
                  Your resume gets you the interview. Make sure it's scoring top marks.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-6 py-3 text-[14px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
              >
                Check My Resume Score
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
