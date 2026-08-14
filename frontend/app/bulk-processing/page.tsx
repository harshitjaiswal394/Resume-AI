import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileStack, ScanLine, FileDown, Lock, Gauge, Database } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Bulk Processing | CareerAmp",
  description: "Process thousands of resumes at once for placement cells, coaching institutes, and bulk hiring teams. CareerAmp bulk resume analysis.",
};

const FEATURES = [
  { icon: FileStack, color: "from-brand-500 to-brand-800", title: "Upload 10,000+ at once", desc: "CSV, ZIP, or Google Drive sync. We parse, analyze, and score every resume in the batch automatically." },
  { icon: Gauge, color: "from-amber-500 to-orange-600", title: "Uniform ATS scoring", desc: "Every candidate scored against the same 40+ checks — a consistent, defensible baseline across your whole pipeline." },
  { icon: ScanLine, color: "from-indigo-500 to-indigo-700", title: "Skill & gap analytics", desc: "See skill distribution, missing keywords, and score percentiles across your entire batch in one dashboard." },
  { icon: FileDown, color: "from-purple-500 to-violet-700", title: "Export-ready reports", desc: "CSV, Excel, and PDF cohort reports with score breakdowns you can share with stakeholders immediately." },
  { icon: Lock, color: "from-rose-500 to-pink-700", title: "Enterprise security", desc: "Resumes never train any model. Encryption at rest and in transit, with role-based access for your team." },
  { icon: Database, color: "from-cyan-500 to-teal-700", title: "API & webhook access", desc: "Push batches programmatically and get results delivered straight to your ATS or CRM via webhooks." },
];

export default function BulkProcessingPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="For institutions"
        title="Score 10,000 resumes"
        highlight="in hours, not weeks"
        subtitle="CareerAmp Bulk Processing is built for placement cells, coaching institutes, and bulk-hiring teams that need consistent, ATS-grade analysis at scale."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 sm:gap-8">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.1}>
                <div className="group h-full rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${f.color} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-lg font-bold tracking-tight text-[var(--text-primary)]">{f.title}</h3>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-base)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <p className="text-label text-brand-600">How it works</p>
                <h2 className="mt-3 text-h2 font-bold tracking-tight">From raw resumes to cohort report</h2>
                <ol className="mt-6 space-y-5">
                  {[
                    "Upload your batch — individual files or a folder, we handle mixed formats.",
                    "CareerAmp parses and runs the full 40+ point audit on every resume.",
                    "Track progress live with per-file status and error reports.",
                    "Download cohort analytics and share score reports with your team.",
                  ].map((step, i) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[13px] font-black text-white">
                        {i + 1}
                      </span>
                      <p className="text-[14px] leading-relaxed text-[var(--text-muted)]">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <Reveal>
                <div className="rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-8 shadow-[var(--shadow-card)]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">Sample cohort report</p>
                  <div className="mt-5 space-y-4">
                    {[
                      { label: "Avg. resume score", value: "71/100", pct: 71 },
                      { label: "Top missing skill", value: "System Design", pct: 58 },
                      { label: "Keyword-density gap", value: "-12 pts avg", pct: 42 },
                      { label: "Score >80 (recruiter-ready)", value: "18%", pct: 18 },
                    ].map((row) => (
                      <div key={row.label}>
                        <div className="flex items-center justify-between text-[13px] font-semibold">
                          <span className="text-[var(--text-muted)]">{row.label}</span>
                          <span className="text-[var(--text-primary)]">{row.value}</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--bg-base)]">
                          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600" style={{ width: `${row.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-8 text-center text-white shadow-2xl sm:p-14">
              <h2 className="relative text-h2 font-bold">Run your next placement drive on CareerAmp</h2>
              <p className="relative mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/80">
                Custom volume pricing and white-glove onboarding for placement cells and institutes.
              </p>
              <div className="relative mt-8 flex justify-center">
                <a
                  href="mailto:support@careeramp.ai?subject=Bulk%20Processing%20Enquiry"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-[15px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
                >
                  Talk to sales <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
