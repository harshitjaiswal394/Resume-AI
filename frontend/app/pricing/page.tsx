import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Crown, Minus, Building2 } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Pricing | ResuMatch AI",
  description: "Simple, transparent pricing for Indian job seekers. Start free, upgrade to Pro for unlimited AI-powered resume optimization.",
};

const PLANS = [
  {
    name: "Free",
    price: "₹0",
    period: "/forever",
    desc: "Perfect for trying ResuMatch AI and getting your first resume score.",
    cta: "Start Free",
    href: "/",
    featured: false,
    icon: Minus,
    features: [
      "3 Resume Analysis / month",
      "Basic ATS Scoring",
      "Top 5 Job Matches",
      "Basic Profile Dashboard",
      "Email support",
    ],
  },
  {
    name: "Pro",
    price: "₹299",
    period: "/month",
    desc: "For serious job seekers who want every advantage in the Indian market.",
    cta: "Start Pro Now",
    href: "/",
    featured: true,
    icon: Crown,
    features: [
      "Unlimited Resume Analysis",
      "AI Bullet Point Rewriter",
      "Unlimited Job Matches",
      "Deep Skill Gap Detection",
      "Prioritized Real-time JDs",
      "Cover Letter Generator",
      "Priority support",
    ],
  },
  {
    name: "College",
    price: "Custom",
    period: "",
    desc: "Bulk pricing for campus placement cells and institutions.",
    cta: "Contact Sales",
    href: "mailto:support@resumatch.ai",
    featured: false,
    icon: Building2,
    features: [
      "Unlimited student seats",
      "Placement-cell dashboard",
      "Group training sessions",
      "Dedicated success manager",
      "Custom onboarding",
    ],
  },
];

const COMPARE_ROWS = [
  { feature: "Resume Analysis", free: "3 / month", pro: "Unlimited", college: "Unlimited" },
  { feature: "ATS Scoring", free: "Basic", pro: "Advanced", college: "Advanced" },
  { feature: "Job Matches", free: "Top 5", pro: "Unlimited", college: "Unlimited" },
  { feature: "AI Bullet Rewrites", free: "—", pro: true, college: true },
  { feature: "Skill Gap Detection", free: "—", pro: true, college: true },
  { feature: "Cover Letter Generator", free: "—", pro: true, college: true },
  { feature: "Priority Support", free: "—", pro: true, college: true },
];

const FAQS = [
  {
    q: "Can I switch plans later?",
    a: "Yes. You can upgrade from Free to Pro or downgrade at any time from your account. Upgrades apply instantly; downgrades take effect at the end of the billing period.",
  },
  {
    q: "Is there a refund policy?",
    a: "Unless required by applicable law, fees are non-refundable. You can cancel anytime and keep access until the end of the paid period.",
  },
  {
    q: "Do college placements get a discount?",
    a: "Yes — our College plan offers custom bulk pricing for placement cells. Email support@resumatch.ai and we'll tailor a package for your institution.",
  },
  {
    q: "Is my resume data safe on paid plans?",
    a: "Absolutely. Resume files and analyses are encrypted and only accessible to your account. See our Privacy Policy for details.",
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Pricing"
        title="Invest in your"
        highlight="career."
        subtitle="Simple, transparent pricing that fits your job search pace. Start free — upgrade only when you're ready to go all-in."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-3 sm:gap-8">
            {PLANS.map((p, i) => (
              <Reveal key={p.name} delay={i * 0.1}>
                <div
                  className={`relative flex h-full flex-col rounded-[28px] border p-8 transition-all duration-300 ${
                    p.featured
                      ? "border-transparent bg-white shadow-[var(--shadow-lift)] lg:-translate-y-3"
                      : "border-[var(--border-soft)] bg-[var(--bg-base)] shadow-[var(--shadow-card)] hover:-translate-y-1.5"
                  }`}
                >
                  {p.featured && (
                    <>
                      <div className="absolute inset-0 -z-10 rounded-[28px] bg-gradient-to-br from-brand-600 to-brand-900 opacity-5" />
                      <span className="absolute right-6 top-6 rounded-full bg-gradient-to-r from-brand-600 to-brand-800 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-md">
                        Best Value
                      </span>
                    </>
                  )}

                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        p.featured ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-600"
                      }`}
                    >
                      <p.icon className="h-4.5 w-4.5" />
                    </div>
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">{p.name}</h3>
                  </div>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-5xl font-black tracking-tight text-[var(--text-primary)]">{p.price}</span>
                    {p.period && <span className="text-sm font-medium text-[var(--text-subtle)]">{p.period}</span>}
                  </div>
                  <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-muted)]">{p.desc}</p>

                  <div className="my-7 h-px bg-[var(--border-soft)]" />

                  <ul className="flex-1 space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[14px] font-medium text-[var(--text-muted)]">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${p.featured ? "text-brand-600" : "text-accent-500"}`} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={p.href}
                    className={`mt-8 inline-flex h-13 items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[15px] font-bold transition-all ${
                      p.featured
                        ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25 hover:-translate-y-0.5 hover:bg-brand-800"
                        : "border border-[var(--border-base)] bg-[var(--bg-base)] text-[var(--text-primary)] hover:border-brand-300 hover:text-brand-600"
                    }`}
                  >
                    {p.cta}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-base)] py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-label text-brand-600">Compare</p>
              <h2 className="mt-3 text-h2 font-bold tracking-tight">Every feature, side by side</h2>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="mt-12 overflow-hidden rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)]">
              {COMPARE_ROWS.map((row, i) => (
                <div
                  key={row.feature}
                  className={`grid grid-cols-4 items-center gap-2 px-5 py-4 text-[14px] sm:px-8 ${
                    i % 2 === 0 ? "bg-white" : "bg-[var(--bg-surface)]"
                  }`}
                >
                  <div className="col-span-1 font-semibold text-[var(--text-primary)]">{row.feature}</div>
                  <div className="col-span-1 text-center text-[var(--text-muted)]">{row.free}</div>
                  <div className="col-span-1 text-center">
                    {row.pro === true ? (
                      <Check className="mx-auto h-4 w-4 text-brand-600" />
                    ) : (
                      <span className="font-semibold text-brand-700">{row.pro}</span>
                    )}
                  </div>
                  <div className="col-span-1 text-center">
                    {row.college === true ? (
                      <Check className="mx-auto h-4 w-4 text-brand-600" />
                    ) : (
                      <span className="text-[var(--text-muted)]">{row.college}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <div className="mt-14 grid gap-4 sm:grid-cols-2">
            {FAQS.map((f, i) => (
              <Reveal key={f.q} delay={(i % 2) * 0.08}>
                <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-6">
                  <h3 className="font-bold text-[var(--text-primary)]">{f.q}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-muted)]">{f.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
