"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  Cookie,
  FileText,
  Home,
  Mail,
  Scale,
  ShieldCheck,
} from "lucide-react";
import Footer from "@/components/Footer";

export type LegalSection = { id: string; title: string };
export type LegalListItem = { id: string; content: React.ReactNode };

export function LegalPage({
  badge,
  title,
  intro,
  updated,
  sections,
  children,
}: {
  badge: string;
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0);

      let current = sections[0]?.id ?? "";
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= 140) current = s.id;
      }
      setActiveId(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const otherMap: Record<string, { href: string; label: string; icon: LucideIcon }> = {
    "Terms of Service": { href: "/privacy", label: "Privacy Policy", icon: ShieldCheck },
    "Privacy Policy": { href: "/terms", label: "Terms of Service", icon: FileText },
    "Cookie Policy": { href: "/privacy", label: "Privacy Policy", icon: ShieldCheck },
    "GDPR Compliance": { href: "/cookies", label: "Cookie Policy", icon: ShieldCheck },
    "Refund & Cancellation Policy": { href: "/terms", label: "Terms of Service", icon: FileText },
  };
  const other = otherMap[badge] ?? { href: "/terms", label: "Terms of Service", icon: FileText };

  const [head, ...rest] = title.split(" ");

  return (
    <div className="min-h-dvh bg-[var(--bg-surface)] font-sans text-[var(--text-primary)]">
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "border-b border-[var(--border-soft)] bg-[var(--bg-base)]/85 shadow-[var(--shadow-card)] backdrop-blur-xl"
            : "border-b border-transparent bg-[var(--bg-base)]/60 backdrop-blur-lg"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 shadow-lg shadow-brand-600/25 transition-transform duration-200 group-hover:-rotate-3 group-hover:scale-105">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]">ResuMatch AI</span>
            <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600 sm:inline-flex">
              <Scale className="h-3 w-3" />
              Legal
            </span>
          </Link>

          <nav className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-full border border-[var(--border-soft)] bg-[var(--bg-base)] p-1 shadow-[var(--shadow-card)] sm:flex">
              <Link
                href={other.href}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:text-brand-600"
              >
                <other.icon className="h-4 w-4" />
                <span className="hidden md:inline">{other.label}</span>
                <ArrowUpRight className="hidden h-3.5 w-3.5 md:inline" />
              </Link>
              <span className="h-4 w-px bg-[var(--border-soft)]" />
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("open-cookie-settings"))}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:text-brand-600"
              >
                <Cookie className="h-4 w-4" />
                <span className="hidden md:inline">Cookie Settings</span>
              </button>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-brand-800 px-4 py-2 text-[13px] font-bold text-white shadow-lg shadow-brand-600/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-600/30"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          </nav>
        </div>
        <div
          className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-brand-600 via-brand-500 to-accent-500"
          style={{ width: `${progress}%` }}
        />
      </header>

      <div className="relative overflow-hidden border-b border-[var(--border-soft)] bg-[var(--bg-base)]">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-accent-50/90 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, var(--border-base) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600 shadow-sm">
            <Scale className="h-3.5 w-3.5" />
            {badge}
          </div>
          <h1 className="mt-6 max-w-3xl text-[40px] font-bold leading-[1.05] tracking-tight sm:text-6xl">
            {head}{" "}
            <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-accent-500 bg-clip-text text-transparent">
              {rest.join(" ")}
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-[16px] leading-relaxed text-[var(--text-muted)]">{intro}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3 text-[13px] font-medium text-[var(--text-subtle)]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-3 py-1.5">
              <CalendarDays className="h-4 w-4 text-brand-600" />
              Updated {updated}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-3 py-1.5">
              <FileText className="h-4 w-4 text-brand-600" />
              {sections.length} sections
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-3 py-1.5 sm:inline-flex">
              ~{Math.max(3, Math.ceil(sections.length * 0.75))} min read
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[300px_1fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-5">
              <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-base)] p-5 shadow-[var(--shadow-card)]">
                <p className="text-label text-[var(--text-subtle)]">Contents</p>
                <ol className="mt-4 space-y-1">
                  {sections.map((s, i) => {
                    const active = activeId === s.id;
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => scrollTo(s.id)}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-all ${
                            active
                              ? "bg-brand-50 font-semibold text-brand-700"
                              : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          <span
                            className={`text-[11px] font-bold tabular-nums ${
                              active ? "text-brand-600" : "text-[var(--text-subtle)]"
                            }`}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {s.title}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white shadow-[var(--shadow-lift)]">
                <Mail className="h-5 w-5" />
                <p className="mt-3 text-[15px] font-semibold">Need a hand?</p>
                <p className="mt-1 text-[13px] leading-relaxed text-white/75">
                  Questions about this document? Email our team.
                </p>
                <a
                  href="mailto:support@resumatch.ai"
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white hover:underline"
                >
                  support@resumatch.ai
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-8 flex gap-2 overflow-x-auto pb-2 lg:hidden">
              {sections.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    activeId === s.id
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-[var(--border-soft)] bg-[var(--bg-base)] text-[var(--text-muted)]"
                  }`}
                >
                  {i + 1}. {s.title}
                </button>
              ))}
            </div>

            <div className="mx-auto max-w-3xl">{children}</div>

            <div className="mx-auto mt-12 flex max-w-3xl items-center justify-between border-t border-[var(--border-soft)] pt-6">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-brand-600 hover:underline"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Back to home
              </Link>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:text-brand-600"
              >
                Back to top
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border-soft)] bg-[var(--bg-base)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-12 sm:flex-row sm:px-6 sm:py-14">
          <div className="text-center sm:text-left">
            <h2 className="text-h3">Still have questions?</h2>
            <p className="mt-1.5 text-[15px] text-[var(--text-muted)]">Our team responds within one business day.</p>
          </div>
          <Link
            href="mailto:support@resumatch.ai"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-brand-600/20 transition-all hover:-translate-y-0.5 hover:bg-brand-800"
          >
            <Mail className="h-4 w-4" />
            support@resumatch.ai
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export function LegalSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 border-b border-[var(--border-soft)] py-10 first:pt-2 last:border-b-0"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-bold text-white shadow-md shadow-brand-600/20">
          {number}
        </span>
        <h2 className="pt-1 text-[22px] font-bold tracking-tight text-[var(--text-primary)] sm:text-2xl">{title}</h2>
      </div>
      <div className="mt-5 space-y-4 text-[15px] leading-[1.8] text-[var(--text-muted)] sm:pl-14">{children}</div>
    </section>
  );
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-[1.8] text-[var(--text-muted)]">{children}</p>;
}

export function LegalList({ items }: { items: LegalListItem[] }) {
  return (
    <ul className="space-y-3.5">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          <span className="mt-[11px] h-[7px] w-[7px] shrink-0 rounded-full bg-gradient-to-br from-brand-500 to-brand-700" />
          <span className="min-w-0 text-[15px] leading-[1.8] text-[var(--text-muted)]">{item.content}</span>
        </li>
      ))}
    </ul>
  );
}
