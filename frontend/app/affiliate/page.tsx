import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Megaphone, Percent, Users, Wallet, Rocket, BadgeCheck } from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { Reveal } from "@/components/marketing/Reveal";

export const metadata: Metadata = {
  title: "Affiliate Program | CareerAmp",
  description: "Earn 30% recurring commission for every Pro subscriber you refer to CareerAmp. Real payouts, real tracking, no caps.",
};

const STEPS = [
  { icon: Rocket, title: "Sign up", desc: "Create your affiliate account with your email and preferred payout method." },
  { icon: Megaphone, title: "Share your link", desc: "Post your unique link in blogs, Telegram, LinkedIn, YouTube, or WhatsApp groups." },
  { icon: Wallet, title: "Get paid", desc: "Earn 30% recurring on every Pro subscription from your referrals — monthly, no caps." },
];

const TIERS = [
  {
    name: "Starter",
    badge: "Free",
    payout: "30%",
    desc: "Perfect for bloggers and creators just getting started.",
    features: ["Unique tracking link", "7-day cookie window", "Real-time dashboard", "Payouts from ₹1,000"],
  },
  {
    name: "Creator",
    badge: "Pro",
    payout: "35%",
    desc: "For creators with an engaged career audience.",
    features: ["Everything in Starter", "Custom landing page", "Dedicated creatives", "90-day cookie window", "Priority payouts"],
  },
  {
    name: "Partner",
    badge: "Pro",
    payout: "40%",
    desc: "For coaching institutes, placement cells, and communities.",
    features: ["Everything in Creator", "Whitelabel materials", "Bulk & team plans", "Dedicated account manager", "Performance bonuses"],
  },
];

export default function AffiliatePage() {
  return (
    <MarketingShell>
      <MarketingHero
        badge="Affiliate program"
        title="Earn 30% recurring"
        highlight="for every referral"
        subtitle="Help your audience land interviews faster and earn a recurring income while you're at it. Track everything in real time, get paid monthly."
      />

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-center text-label text-brand-600">How it works</p>
            <h2 className="mt-3 text-center text-h2 font-bold tracking-tight">Three steps to your first payout</h2>
          </Reveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.1}>
                <div className="group relative h-full overflow-hidden rounded-[28px] border border-[var(--border-soft)] bg-[var(--bg-base)] p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)]">
                  <span className="absolute right-6 top-5 text-4xl font-black text-[var(--border-soft)]">{i + 1}</span>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-lg transition-transform duration-300 group-hover:scale-110">
                    <s.icon className="h-6 w-6" />
                  </div>
                  <h3 className="relative mt-6 text-lg font-bold tracking-tight text-[var(--text-primary)]">{s.title}</h3>
                  <p className="relative mt-2.5 text-[14px] leading-relaxed text-[var(--text-muted)]">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-base)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <p className="text-center text-label text-brand-600">Commission tiers</p>
            <h2 className="mt-3 text-center text-h2 font-bold tracking-tight">The more you refer, the more you earn</h2>
          </Reveal>
          <div className="mt-12 grid gap-6 lg:grid-cols-3 sm:gap-8">
            {TIERS.map((t, i) => (
              <Reveal key={t.name} delay={i * 0.1}>
                <div className={`h-full rounded-[28px] border p-7 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[var(--shadow-lift)] ${
                  t.badge === "Pro" ? "border-brand-300 bg-gradient-to-b from-brand-50/60 to-[var(--bg-base)]" : "border-[var(--border-soft)] bg-[var(--bg-base)]"
                }`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">{t.name}</h3>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${t.badge === "Pro" ? "bg-brand-600 text-white" : "bg-accent-50 text-accent-700"}`}>
                      {t.badge}
                    </span>
                  </div>
                  <p className="mt-4 text-4xl font-black tracking-tight text-brand-600">{t.payout}</p>
                  <p className="mt-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">recurring commission</p>
                  <p className="mt-4 text-[14px] leading-relaxed text-[var(--text-muted)]">{t.desc}</p>
                  <ul className="mt-6 space-y-3">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[13px] font-medium text-[var(--text-primary)]">
                        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/pricing"
                    className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[14px] font-bold shadow-lg transition-all hover:-translate-y-0.5 ${
                      t.badge === "Pro" ? "bg-brand-600 text-white shadow-brand-600/25 hover:bg-brand-800" : "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--shadow-card)] hover:border-brand-300"
                    }`}
                  >
                    Start earning <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-4 rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-surface)] p-6">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-muted)]">
                <Percent className="h-4 w-4 text-brand-600" /> Recurring, not one-off
              </div>
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-muted)]">
                <Users className="h-4 w-4 text-brand-600" /> Real-time referral dashboard
              </div>
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-muted)]">
                <Wallet className="h-4 w-4 text-brand-600" /> UPI, bank transfer, or PayPal
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-[var(--bg-surface)] py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Reveal>
            <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-8 text-center text-white shadow-2xl sm:p-14">
              <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
              <h2 className="relative text-h2 font-bold">Ready to turn your audience into income?</h2>
              <p className="relative mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/80">
                Join 300+ creators already earning with CareerAmp. Average affiliate makes their first payout in under 30 days.
              </p>
              <div className="relative mt-8 flex justify-center">
                <a
                  href="mailto:affiliates@careeramp.ai"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-[15px] font-bold text-brand-700 shadow-xl transition-all hover:-translate-y-0.5 hover:bg-brand-50"
                >
                  Become an affiliate <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}
