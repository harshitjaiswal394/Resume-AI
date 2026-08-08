"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Briefcase, Menu, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/common/AuthModal";
import Footer from "@/components/Footer";

export const MARKETING_NAV = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it Works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
];

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-dvh bg-[var(--bg-base)] font-sans text-[var(--text-primary)]">
      <nav
        className={`fixed inset-x-0 top-0 z-[100] transition-all duration-300 ${
          scrolled
            ? "border-b border-[var(--border-soft)] bg-white/90 py-2.5 shadow-sm backdrop-blur-md"
            : "bg-transparent py-4"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 shadow-sm">
              <Briefcase className="h-4 w-4 text-white" />
            </div>
            <span className="text-[17px] font-bold tracking-tight">ResuMatch AI</span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {MARKETING_NAV.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-[14px] font-semibold transition-colors ${
                    active ? "text-brand-600" : "text-[var(--text-muted)] hover:text-brand-600"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            {!user ? (
              <>
                <button
                  onClick={() => setAuthOpen(true)}
                  className="px-3 py-2 text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:text-brand-600"
                >
                  Sign In
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-[14px] font-semibold text-white shadow-lg shadow-brand-600/20 transition-all hover:-translate-y-0.5 hover:bg-brand-800"
                >
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push("/dashboard")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-[14px] font-semibold text-white shadow-lg shadow-brand-600/20 transition-all hover:-translate-y-0.5 hover:bg-brand-800"
              >
                Dashboard
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-surface)] md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden border-b border-[var(--border-soft)] bg-white/95 backdrop-blur-md md:hidden"
            >
              <div className="space-y-1 px-4 py-4">
                {MARKETING_NAV.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block rounded-lg px-3 py-2.5 text-[15px] font-semibold ${
                      pathname === link.href
                        ? "bg-brand-50 text-brand-600"
                        : "text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="pt-3">
                  {!user ? (
                    <button
                      onClick={() => {
                        setMobileOpen(false);
                        setAuthOpen(true);
                      }}
                      className="w-full rounded-xl bg-brand-600 px-4 py-3 text-center text-[15px] font-semibold text-white"
                    >
                      Sign In
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setMobileOpen(false);
                        router.push("/dashboard");
                      }}
                      className="w-full rounded-xl bg-brand-600 px-4 py-3 text-center text-[15px] font-semibold text-white"
                    >
                      Go to Dashboard
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main>{children}</main>

      <Footer />

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => setAuthOpen(false)} />
    </div>
  );
}
