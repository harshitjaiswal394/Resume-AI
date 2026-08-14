import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Code2, Palette, PenTool, Megaphone, LineChart, Globe, MapPin, Clock } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Careers | CareerAmp",
  description: "Join CareerAmp — a small team fixing job hunting for Indian professionals. Open roles in engineering, design, and growth.",
};

const PERKS = [
  "Remote-first across India",
  "Competitive salary + equity",
  "Health cover for you & family",
  "Learning budget, yearly",
  "Annual team offsite",
  "4-day work week (most weeks)",
];

const ROLES = [
  { icon: Code2, color: "from-brand-500 to-brand-800", title: "Senior Full-Stack Engineer", dept: "Engineering", loc: "Remote · India", type: "Full-time" },
  { icon: LineChart, color: "from-indigo-500 to-indigo-700", title: "Machine Learning Engineer", dept: "Engineering", loc: "Remote · India", type: "Full-time" },
  { icon: Palette, color: "from-rose-500 to-pink-700", title: "Product Designer", dept: "Design", loc: "Mumbai / Remote", type: "Full-time" },
  { icon: Megaphone, color: "from-amber-500 to-orange-600", title: "Growth Marketer", dept: "Growth", loc: "Remote · India", type: "Full-time" },
  { icon: PenTool, color: "from-purple-500 to-violet-700", title: "Career Content Writer", dept: "Content", loc: "Remote · India", type: "Contract" },
  { icon: Globe, color: "from-cyan-500 to-teal-700", title: "Affiliate Partnerships Lead", dept: "Growth", loc: "Remote · India", type: "Full-time" },
];

export default function CareersPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Careers"
        title="Build the fair job-hunt platform"
        highlight="India deserves"
        subtitle="We're a small, senior team shipping daily. If you're tired of building dashboards nobody uses and want to move a real career metric — callbacks — join us."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PERKS.map((p, i) => (
                <div
                  key={p}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-base)] p-4 shadow-[var(--shadow-card)]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <ArrowRight className="h-4 w-4 -rotate-45" />
                  </span>
                  <p className="text-[14px] font-semibold text-[var(--text-primary)]">{p}</p>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-label text-brand-600">Open roles</p>
                <h2 className="mt-3 text-h2 font-bold tracking-tight">We're hiring across teams</h2>
              </div>
              <span className="rounded-full bg-brand-50 px-4 py-1.5 text-[12px] font-bold text-brand-700">6 roles</span>
            </div>
          </Reveal>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ROLES.map((r, i) => (
              <Reveal key={r.title} delay={(i % 3) * 0.1}>
                <Link
                  href="mailto:support@careeramp.ai?subject=Application: "
                  className="group block h-full rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]"
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${r.color} text-white shadow-lg transition-transform duration-300 group-hover:scale-110`}
                    >
                      <r.icon className="h-6 w-6" />
                    </div>
                    <span className="rounded-full bg-accent-50 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-accent-700">
                      {r.type}
                    </span>
                  </div>
                  <h3 className="mt-5 text-[16px] font-bold leading-snug text-[var(--text-primary)]">{r.title}</h3>
                  <p className="mt-1 text-[13px] font-semibold text-brand-600">{r.dept}</p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] font-medium text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {r.loc}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Apply via email
                    </span>
                  </div>
                </Link>
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
              <h2 className="relative text-h2 font-bold">Don't see your role?</h2>
              <p className="relative mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/80">
                We hire for curiosity over credentials. Send your resume and a note on what you'd build here — we reply to every application.
              </p>
              <div className="relative mt-8 flex justify-center">
                <a
                  href="mailto:support@careeramp.ai"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-[15px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
                >
                  Open application <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
