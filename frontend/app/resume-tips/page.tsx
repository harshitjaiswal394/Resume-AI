import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Layout, Zap, Sparkles, Lightbulb, MessageSquare } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Resume Tips | ResuMatch AI",
  description: "Practical, India-specific resume tips from ATS formatting to writing impact-driven bullet points that recruiters love.",
};

const TIPS = [
  {
    title: "Keep it to one page (or two max)",
    desc: "Freshers should target one page. Experienced professionals can use two, but never more. Recruiters skim — make the first half of page one count.",
    icon: Layout,
    tag: "Formatting",
  },
  {
    title: "Use an ATS-friendly layout",
    desc: "Avoid tables, text boxes, graphics, and images. Use standard headings like 'Work Experience' and 'Skills' so parsing engines recognize your sections.",
    icon: FileText,
    tag: "ATS",
  },
  {
    title: "Quantify every bullet point",
    desc: "Replace 'Improved performance' with 'Improved page load time by 40%, reducing bounce rate by 12%'. Numbers make your impact measurable.",
    icon: Zap,
    tag: "Content",
  },
  {
    title: "Mirror keywords from the job description",
    desc: "If the JD asks for 'Kubernetes', write 'Kubernetes', not 'container orchestration'. ATS systems and recruiters match exact keywords.",
    icon: Sparkles,
    tag: "ATS",
  },
  {
    title: "Lead with an impact statement",
    desc: "Start each bullet with a strong action verb and the result: 'Led', 'Built', 'Launched', 'Reduced', 'Scaled' — not 'Responsible for'.",
    icon: Lightbulb,
    tag: "Content",
  },
  {
    title: "Tailor the resume per application",
    desc: "The same resume for every job loses matches. Adjust your summary and top skills to align with each target role — AI makes this fast.",
    icon: MessageSquare,
    tag: "Strategy",
  },
];

const QUICK_WINS = [
  "Save your resume as PDF and name it Rahul_Sharma_SDE.pdf — never 'Resume (2).docx'.",
  "Put your most relevant section first — skills or experience, based on the role.",
  "Drop objective statements; replace with a 2-3 line professional summary.",
  "Spell out acronyms at first use, then use the short form everywhere else.",
  "Check for typos twice — a single error reads as carelessness to recruiters.",
  "Keep margins at 0.5-0.75 inches and font size 10-12pt for readability.",
];

export default function ResumeTipsPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Resume Tips"
        title="Resume tips that actually"
        highlight="get you shortlisted"
        subtitle="Skip the generic advice. These India-specific, ATS-tested tips help freshers and experienced professionals write resumes recruiters finish reading."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 sm:gap-8">
            {TIPS.map((t, i) => (
              <Reveal key={t.title} delay={(i % 3) * 0.1}>
                <div className="group relative h-full overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-transform duration-300 group-hover:scale-110">
                      <t.icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-600">
                      {t.tag}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[16px] font-bold leading-snug text-[var(--text-primary)]">{t.title}</h3>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{t.desc}</p>
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
              <p className="text-label text-brand-600">Quick wins</p>
              <h2 className="mt-3 text-h2 font-bold tracking-tight">Fix these today, land interviews sooner</h2>
            </div>
          </Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {QUICK_WINS.map((tip, i) => (
              <Reveal key={tip} delay={(i % 2) * 0.08}>
                <div className="flex items-start gap-3.5 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 transition-all duration-300 hover:border-brand-200 hover:bg-white">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-[12px] font-bold text-white">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">{tip}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1}>
            <div className="mt-16 flex flex-col items-center justify-between gap-6 rounded-[28px] bg-gradient-to-br from-brand-600 to-brand-900 p-8 text-white shadow-2xl sm:flex-row sm:p-10">
              <div>
                <h3 className="text-h3 font-bold">Not sure where to start?</h3>
                <p className="mt-1.5 text-[14px] text-white/80">
                  Run a free AI analysis and get a prioritized list of exactly what to fix.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-6 py-3 text-[14px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
              >
                Analyze My Resume
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
