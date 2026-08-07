"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowUp,
  Briefcase,
  Check,
  Github,
  Linkedin,
  Mail,
  MapPin,
  Send,
  ShieldCheck,
  Twitter,
} from "lucide-react";

const PRODUCT_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/dashboard", label: "Dashboard" },
];

const RESOURCE_LINKS = [
  { href: "/resume-tips", label: "Resume Tips" },
  { href: "/interview-prep", label: "Interview Prep" },
  { href: "/blog", label: "Career Blog" },
  { href: "/job-market-trends", label: "Job Market Trends" },
];

const COMPANY_LINKS = [
  { href: "/features", label: "About us" },
  { href: "/blog", label: "Newsroom" },
  { href: "/gdpr", label: "GDPR Compliance" },
  { href: "mailto:support@resumatch.ai", label: "Support" },
];

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
];

const SOCIALS = [
  { href: "https://twitter.com", label: "Twitter", icon: Twitter },
  { href: "https://linkedin.com", label: "LinkedIn", icon: Linkedin },
  { href: "https://github.com", label: "GitHub", icon: Github },
];

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">{title}</p>
      <ul className="mt-5 space-y-3">
        {links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              className="group inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--text-muted)] transition-colors hover:text-brand-600"
            >
              {link.label}
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
  };

  return (
    <footer className="relative overflow-hidden border-t border-[var(--border-soft)] bg-[var(--bg-surface)]">
      {/* ambient glows */}
      <div className="pointer-events-none absolute -right-40 -top-32 h-[420px] w-[420px] rounded-full bg-brand-100/50 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-accent-50/80 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, var(--border-soft) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* newsletter band */}
        <div className="pt-14">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-8 shadow-2xl shadow-brand-600/30 sm:p-10">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-accent-400/20 blur-3xl" />
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
                backgroundSize: "22px 22px",
              }}
            />

            <div className="relative grid items-center gap-6 lg:grid-cols-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-100">Stay sharp</p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Career tips, straight to your inbox
                </h3>
                <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/75">
                  One practical email a week — resume tricks, interview tactics, and market insights. No spam, ever.
                </p>
              </div>

              <div>
                {subscribed ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-5 py-4 backdrop-blur-sm">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                      <Check className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-[14px] font-bold text-white">You're subscribed!</p>
                      <p className="text-[12px] text-white/70">Welcome aboard — see you in your inbox.</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubscribe} className="flex flex-col gap-3 sm:flex-row">
                    <div className="relative flex-1">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="h-13 w-full rounded-xl border border-white/20 bg-white/10 py-3.5 pl-11 pr-4 text-[14px] text-white placeholder:text-white/50 outline-none backdrop-blur-sm transition-all focus:border-white/50 focus:bg-white/15"
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex h-13 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[14px] font-bold text-brand-700 shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
                    >
                      Subscribe
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* main grid */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 py-14 sm:grid-cols-2 md:grid-cols-12">
          {/* brand */}
          <div className="col-span-2 md:col-span-4">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 shadow-lg shadow-brand-600/25">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <span className="text-[18px] font-bold tracking-tight text-[var(--text-primary)]">ResuMatch AI</span>
            </Link>
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-[var(--text-muted)]">
              Helping Indian job seekers land their dream roles with AI-powered resume analysis and job matching.
            </p>
            <div className="mt-6 flex items-center gap-2.5">
              {SOCIALS.map(({ href, label, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--bg-base)] text-[var(--text-muted)] shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-600 hover:shadow-[var(--shadow-lift)]"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 md:col-start-6">
            <FooterColumn title="Product" links={PRODUCT_LINKS} />
          </div>
          <div className="md:col-span-2">
            <FooterColumn title="Resources" links={RESOURCE_LINKS} />
          </div>
          <div className="md:col-span-2">
            <FooterColumn title="Company" links={COMPANY_LINKS} />
          </div>
        </div>

        {/* contact strip */}
        <div className="flex flex-col gap-4 border-t border-[var(--border-soft)] py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 text-[13px] font-medium text-[var(--text-muted)] sm:flex-row sm:items-center sm:gap-6">
            <a
              href="mailto:support@resumatch.ai"
              className="inline-flex items-center gap-2 transition-colors hover:text-brand-600"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Mail className="h-3.5 w-3.5" />
              </span>
              support@resumatch.ai
            </a>
            <span className="inline-flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <MapPin className="h-3.5 w-3.5" />
              </span>
              Mumbai, Maharashtra, India
            </span>
          </div>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="group inline-flex items-center gap-2 self-start rounded-xl border border-[var(--border-soft)] bg-[var(--bg-base)] px-4 py-2.5 text-[13px] font-semibold text-[var(--text-primary)] shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-600 sm:self-auto"
          >
            Back to top
            <ArrowUp className="h-4 w-4 transition-transform group-hover:-translate-y-0.5" />
          </button>
        </div>

        {/* legal bar */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-[var(--border-soft)] py-7 text-[12px] text-[var(--text-subtle)] md:flex-row">
          <p>© 2026 ResuMatch AI. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.label} href={link.href} className="transition-colors hover:text-brand-600">
                {link.label}
              </Link>
            ))}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("open-cookie-settings"))}
              className="inline-flex cursor-pointer items-center gap-1.5 font-semibold transition-colors hover:text-brand-600"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Cookie Settings
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
