import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Rocket, HeartHandshake, ShieldCheck, Target, Users, Award } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "About Us | CareerAmp",
  description: "CareerAmp helps Indian job seekers land more interviews with AI-powered resume analysis, job matching, and a full job-hunt workspace.",
};

const VALUES = [
  {
    icon: Target,
    color: "from-brand-500 to-brand-800",
    title: "Merit over queues",
    desc: "Recruiters see thousands of resumes. We exist to make sure the strongest candidates — not just the loudest — surface and get seen.",
  },
  {
    icon: HeartHandshake,
    color: "from-rose-500 to-pink-700",
    title: "Candidates first",
    desc: "No dark patterns, no fabricated metrics, no fake urgency. Every feature is built to genuinely move the needle on your callbacks.",
  },
  {
    icon: ShieldCheck,
    color: "from-amber-500 to-orange-600",
    title: "Your data, yours",
    desc: "Resumes are deeply personal. We never train on your documents, sell them, or share them without your explicit consent.",
  },
  {
    icon: Users,
    color: "from-indigo-500 to-indigo-700",
    title: "Built for India",
    desc: "ATS checkers, salary bands, and recruiter expectations differ by market. Ours is tuned for how hiring actually works in India.",
  },
];

const METRICS = [
  { value: "2,500+", label: "live jobs indexed" },
  { value: "40+", label: "ATS checks per resume" },
  { value: "10,000+", label: "resumes analyzed" },
  { value: "3.4x", label: "average callback lift" },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="About us"
        title="We're on a mission to make"
        highlight="job hunting fair"
        subtitle="Every great career starts with someone noticing your resume. CareerAmp gives candidates the tools recruiters and ATS bots use — so the best candidate wins, not the best formatter."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div>
                <p className="text-label text-brand-600">Our story</p>
                <h2 className="mt-3 text-h2 font-bold tracking-tight">
                  Born from a stack of rejected resumes
                </h2>
                <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-[var(--text-muted)]">
                  <p>
                    CareerAmp started in 2025 when our founders watched a batch of genuinely talented engineers get
                    silently rejected — not for lack of skill, but because their resumes never made it past an ATS.
                  </p>
                  <p>
                    Recruiters spend under 8 seconds on a resume. We spent months reverse-engineering how Indian ATS
                    platforms score, parse, and filter resumes, then built tools that give every candidate the same
                    unfair advantage the top 1% always had.
                  </p>
                  <p>
                    Today CareerAmp is a full job-hunt workspace: analyze your resume, match against live roles, tailor
                    for each JD, track every application, and send referrals that actually get replies.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {METRICS.map((m, i) => (
                  <Reveal key={m.label} delay={i * 0.08}>
                    <div className="rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-base)] p-6 text-center shadow-[var(--shadow-card)]">
                      <p className="text-3xl font-black tracking-tight text-brand-600">{m.value}</p>
                      <p className="mt-1.5 text-[13px] font-medium text-[var(--text-muted)]">{m.label}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[var(--bg-base)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-center text-label text-brand-600">What we believe</p>
            <h2 className="mt-3 text-center text-h2 font-bold tracking-tight">Four values, zero compromises</h2>
          </Reveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 sm:gap-8">
            {VALUES.map((v, i) => (
              <Reveal key={v.title} delay={(i % 4) * 0.1}>
                <div className="group h-full rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${v.color} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}
                  >
                    <v.icon className="h-6 w-6" />
                  </div>
                  <h3 className="relative mt-6 text-lg font-bold tracking-tight text-[var(--text-primary)]">{v.title}</h3>
                  <p className="relative mt-2.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{v.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-8 text-center text-white shadow-2xl sm:p-14">
              <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-accent-500/30 blur-3xl" />
              <h2 className="relative text-h2 font-bold">Want to join the mission?</h2>
              <p className="relative mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/80">
                We're always looking for engineers, designers, and career coaches who believe hiring should be a meritocracy.
              </p>
              <div className="relative mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/careers"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-[15px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
                >
                  See open roles <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/30 px-7 py-3.5 text-[15px] font-bold text-white transition-all hover:bg-white/10"
                >
                  <Rocket className="h-4 w-4" /> Try CareerAmp free
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[var(--bg-base)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="grid items-center gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <p className="text-label text-brand-600">The team</p>
                <h2 className="mt-3 text-h2 font-bold tracking-tight">Small team, big leverage</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-muted)]">
                  A lean, senior team across Mumbai and Bengaluru — ex-recruiters, ex-engineering-leads, and a healthy
                  obsession with ATS internals.
                </p>
              </div>
              <div className="flex items-center justify-center gap-6 lg:col-span-2">
                <Award className="h-16 w-16 text-accent-500" />
                <div>
                  <p className="text-[15px] font-bold text-[var(--text-primary)]">10,000+ careers boosted</p>
                  <p className="mt-1 max-w-sm text-[14px] leading-relaxed text-[var(--text-muted)]">
                    From fresh graduates at IITs and NITs to senior engineers at India's largest unicorns — every score
                    improvement is a callback earned.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
