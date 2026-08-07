import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TrendingUp, BarChart3, BrainCircuit, MapPin, Building2 } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Job Market Trends | ResuMatch AI",
  description: "Live insights into the Indian job market: in-demand skills, salary benchmarks, and hiring trends from real job postings.",
};

const STATS = [
  { label: "Job postings analyzed", value: "2.4M+", icon: BarChart3 },
  { label: "In-demand AI roles growth", value: "68%", icon: BrainCircuit },
  { label: "Hybrid roles in postings", value: "42%", icon: MapPin },
  { label: "Companies hiring this quarter", value: "18,500+", icon: Building2 },
];

const TRENDS = [
  {
    title: "AI skills are moving from 'nice to have' to 'must have'",
    desc: "Keywords like RAG, fine-tuning, and prompt engineering now appear in a third of all backend and data roles. Candidates who demonstrate applied AI experience are seeing 2.1x more interview callbacks.",
    tag: "Skills",
    icon: BrainCircuit,
    color: "from-brand-500 to-brand-700",
  },
  {
    title: "Hybrid has won the remote vs office debate",
    desc: "42% of new postings offer hybrid models, overtaking fully remote for the first time. Candidates in Bengaluru, Hyderabad, and Pune have the widest on-site flexibility.",
    tag: "Work Model",
    icon: MapPin,
    color: "from-accent-500 to-accent-700",
  },
  {
    title: "Startups are hiring again — with sharper filters",
    desc: "Early-stage hiring is up 24% year-over-year, but startup recruiters now prioritize ownership stories and product impact over brand names on your resume.",
    tag: "Hiring",
    icon: Building2,
    color: "from-purple-500 to-purple-700",
  },
  {
    title: "Salary transparency is becoming the norm",
    desc: "34% of postings now include a salary range — up from 12% two years ago. Use range data to anchor negotiations, especially in product companies.",
    tag: "Compensation",
    icon: TrendingUp,
    color: "from-amber-500 to-orange-600",
  },
];

export default function JobMarketTrendsPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Job Market Trends"
        title="What's moving the"
        highlight="Indian job market"
        subtitle="Quarterly insights derived from live job postings and candidate data. Know where the demand is heading before you make your next move."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.08}>
                <div className="group rounded-[24px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-6 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-transform duration-300 group-hover:scale-110">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <p className="mt-5 bg-gradient-to-r from-brand-600 to-brand-800 bg-clip-text text-3xl font-black tracking-tight text-transparent">
                    {s.value}
                  </p>
                  <p className="mt-1 text-[13px] font-medium text-[var(--text-muted)]">{s.label}</p>
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
              <p className="text-label text-brand-600">This quarter</p>
              <h2 className="mt-3 text-h2 font-bold tracking-tight">Four trends shaping your next move</h2>
            </div>
          </Reveal>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8">
            {TRENDS.map((t, i) => (
              <Reveal key={t.title} delay={(i % 2) * 0.1}>
                <div className="group relative h-full overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-7 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]">
                  <div
                    className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${t.color} opacity-[0.08] blur-2xl transition-opacity duration-300 group-hover:opacity-20`}
                  />
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${t.color} text-white shadow-md transition-transform duration-300 group-hover:scale-110`}
                    >
                      <t.icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-[var(--bg-base)] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-600">
                      {t.tag}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[17px] font-bold leading-snug text-[var(--text-primary)]">{t.title}</h3>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{t.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="flex flex-col items-center justify-between gap-6 rounded-[28px] bg-gradient-to-br from-brand-600 to-brand-900 p-8 text-white shadow-2xl sm:flex-row sm:p-10">
              <div>
                <h3 className="text-h3 font-bold">How do you rank against live roles?</h3>
                <p className="mt-1.5 text-[14px] text-white/80">
                  See your real job match percentage against postings hiring right now.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-6 py-3 text-[14px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
              >
                Check My Match
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
