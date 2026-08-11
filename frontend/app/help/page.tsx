import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageCircle, Mail, FileText, CreditCard, BookOpen, HelpCircle, LifeBuoy, ShieldCheck } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Help Center | CareerAmp",
  description: "Get answers about CareerAmp — analyzing resumes, ATS scores, job matching, tailoring, the job tracker, subscriptions, and more.",
};

const TOPICS = [
  { icon: FileText, title: "Resume analysis", desc: "Uploading, scores, checks, and reading your report.", href: "/resume-tips" },
  { icon: BookOpen, title: "Tailoring & cover letters", desc: "JD tailoring, cover letters, and referral messages.", href: "/how-it-works" },
  { icon: CreditCard, title: "Billing & plans", desc: "Free limits, Pro upgrades, invoices, and refunds.", href: "/pricing" },
  { icon: LifeBuoy, title: "Account & privacy", desc: "Signing in, deleting data, GDPR, and cookies.", href: "/gdpr" },
];

const FAQS = [
  {
    q: "Is CareerAmp really free to start?",
    a: "Yes. The free tier includes resume analysis with a full ATS score, job matching, and one resume. You can upgrade to Pro for unlimited analyses, AI rewrites, cover letters, and full access to the Job Tracker and AI Referrals. No credit card required to start.",
  },
  {
    q: "How accurate is the ATS score?",
    a: "The score reflects 40+ checks modeled on how popular Indian ATS platforms parse and rank resumes — formatting, keyword density, action verbs, quantification, and length. It's a strong predictor of ATS pass rates, not a guarantee, since every ATS differs slightly.",
  },
  {
    q: "Will a recruiter know I used AI?",
    a: "No. CareerAmp produces clean, human-sounding resumes and cover letters. You always review and edit the output before downloading — nothing is auto-submitted anywhere.",
  },
  {
    q: "How does the Job Tracker work?",
    a: "Save any job (from Job Search or manually), then drag it through Saved → Applied → Interview → Offer → Rejected. CareerAmp also nudges you to follow up when an application has been sitting too long.",
  },
  {
    q: "How do I delete my data?",
    a: "You can delete your resume from the dashboard at any time, and request full account deletion via support@careeramp.ai. We never train on your documents, and deletion removes your files from our systems. See the GDPR page for details.",
  },
  {
    q: "Can I cancel my Pro subscription anytime?",
    a: "Yes. You can cancel from your account settings at any time, and your plan stays active until the end of the billing period. Refunds follow our published refund policy.",
  },
];

export default function HelpPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Help center"
        title="How can we"
        highlight="help you today?"
        subtitle="Quick answers to the questions we hear most. Can't find what you need? Our team replies to every message within one business day."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TOPICS.map((t, i) => (
              <Reveal key={t.title} delay={i * 0.08}>
                <Link
                  href={t.href}
                  className="group block h-full rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-6 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-lg transition-transform duration-300 group-hover:scale-110">
                    <t.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-[16px] font-bold tracking-tight text-[var(--text-primary)]">{t.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{t.desc}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-base)] py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <Reveal>
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-brand-600" />
              <h2 className="text-h2 font-bold tracking-tight">Frequently asked questions</h2>
            </div>
          </Reveal>
          <div className="mt-8 space-y-3">
            {FAQS.map((f, i) => (
              <Reveal key={f.q} delay={i * 0.06}>
                <details className="group rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] transition-all duration-200 open:border-brand-300">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-bold text-[var(--text-primary)]">
                    {f.q}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-base)] text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 text-[14px] leading-relaxed text-[var(--text-muted)]">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-8 shadow-[var(--shadow-card)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-lg">
                  <Mail className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-[var(--text-primary)]">Email support</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  For account, billing, or data questions, write to us and we'll get back within one business day.
                </p>
                <a
                  href="mailto:support@careeramp.ai"
                  className="mt-5 inline-flex items-center gap-2 text-[14px] font-bold text-brand-600 transition-colors hover:text-brand-800"
                >
                  support@careeramp.ai <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              <div className="rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-8 shadow-[var(--shadow-card)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg">
                  <MessageCircle className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-bold tracking-tight text-[var(--text-primary)]">In-app AI chat</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">
                  Signed in? Use the AI Chat copilot for resume questions, job search, and interview prep — instantly.
                </p>
                <Link
                  href="/chat"
                  className="mt-5 inline-flex items-center gap-2 text-[14px] font-bold text-brand-600 transition-colors hover:text-brand-800"
                >
                  Open AI Chat <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
