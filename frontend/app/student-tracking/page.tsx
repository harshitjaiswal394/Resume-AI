import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GraduationCap, ClipboardCheck, Users, LineChart, FileText, BellRing } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Student Tracking | CareerAmp",
  description: "Track every student's placement journey from resume score to offer letter. CareerAmp Student Tracking for colleges and placement cells.",
};

const FEATURES = [
  { icon: ClipboardCheck, color: "from-brand-500 to-brand-800", title: "Batch resume audits", desc: "Every student gets the full 40+ point ATS audit. See who's recruiter-ready and who needs help — at a glance." },
  { icon: LineChart, color: "from-indigo-500 to-indigo-700", title: "Placement pipeline", desc: "Live kanban of each student's journey — applied, interview, offer, joined — across every company drive." },
  { icon: Users, color: "from-amber-500 to-orange-600", title: "Cohort analytics", desc: "Score distributions, branch-wise readiness, and placement conversion rates in one dashboard." },
  { icon: BellRing, color: "from-rose-500 to-pink-700", title: "Auto nudges", desc: "Students get reminders to fix their resume or follow up — your placement team gets escalation alerts." },
  { icon: FileText, color: "from-purple-500 to-violet-700", title: "Drive-ready reports", desc: "Export placement-ready PDF/Excel reports for management, accreditation, and company visits." },
  { icon: GraduationCap, color: "from-cyan-500 to-teal-700", title: "Institution workspace", desc: "Staff roles, batch management, and one link to onboard your entire graduating class." },
];

export default function StudentTrackingPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="For institutions"
        title="Know every student's"
        highlight="placement readiness"
        subtitle="CareerAmp Student Tracking gives placement cells live visibility into each student's resume quality and job-hunt progress — from day one to offer letter."
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
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { value: "1-click", label: "batch onboarding" },
                { value: "Live", label: "student pipeline view" },
                { value: "0 seats", label: "per-student cost for batch plans" },
              ].map((m) => (
                <div key={m.label} className="rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-7 text-center shadow-[var(--shadow-card)]">
                  <p className="text-3xl font-black tracking-tight text-brand-600">{m.value}</p>
                  <p className="mt-1.5 text-[13px] font-medium text-[var(--text-muted)]">{m.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-8 text-center text-white shadow-2xl sm:p-14">
              <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
              <h2 className="relative text-h2 font-bold">Bring your placement cell to CareerAmp</h2>
              <p className="relative mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/80">
                Special pricing for colleges and universities. We'll migrate your existing data and onboard your team in under a week.
              </p>
              <div className="relative mt-8 flex justify-center">
                <a
                  href="mailto:support@careeramp.ai?subject=Student%20Tracking%20Enquiry"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-[15px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
                >
                  Request a demo <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
