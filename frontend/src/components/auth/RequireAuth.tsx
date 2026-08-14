"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Briefcase, Home, Lock, LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AuthModal } from "@/components/common/AuthModal";
import { LoadingScreen } from "@/components/ui/loading";

/**
 * Protects any page tree from unauthenticated access.
 *
 * - While auth initializes, shows a loading screen.
 * - If logged out, renders a locked screen and auto-opens the login popup.
 * - On successful login the user stays on the exact URL they requested (the
 *   protected page renders in place — including Next.js 404 content if the
 *   path doesn't exist).
 * - Only if the popup is dismissed WITHOUT logging in do we send the user home.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  const userRef = useRef(user);
  userRef.current = user;
  const redirectTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isAuthReady && !user) {
      setModalOpen(true);
    } else if (user) {
      setModalOpen(false);
    }
  }, [isAuthReady, user]);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  const handleModalClose = () => {
    setModalOpen(false);
    // AuthModal fires onClose() before onSuccess() even on a successful
    // sign-in, so defer the redirect and skip it if the user ended up logged
    // in (which also keeps them on the URL they entered).
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
    redirectTimer.current = setTimeout(() => {
      if (!userRef.current) router.replace("/");
    }, 400);
  };

  const handleModalSuccess = () => {
    setModalOpen(false);
  };

  if (!isAuthReady) {
    return (
      <LoadingScreen
        label="Checking your session…"
        sublabel="Securing your account before we continue"
      />
    );
  }

  if (!user) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--bg-base)] p-6">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-accent-50/80 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, var(--border-base) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto w-full max-w-md text-center"
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 shadow-2xl shadow-brand-600/30">
            <Lock className="h-9 w-9 text-white" />
          </div>

          <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-subtle)]">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
            Protected area
          </div>

          <h1 className="mt-5 text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            Sign in to continue
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-[15px] leading-relaxed text-[var(--text-muted)]">
            Your resumes, ATS scores, and job matches live here. Log in to pick up right where you left off.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-800 px-7 text-[14px] font-bold text-white shadow-lg shadow-brand-600/25 transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              <LogIn className="h-4 w-4" />
              Sign In
            </button>
            <button
              onClick={() => router.push("/")}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-base)] bg-[var(--bg-surface)] px-7 text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:border-brand-300 hover:text-brand-600"
            >
              <Home className="h-4 w-4" />
              Back to Home
            </button>
          </div>

          <p className="mt-8 flex items-center justify-center gap-2 text-[12px] font-medium text-[var(--text-subtle)]">
            <Briefcase className="h-3.5 w-3.5 text-brand-600" />
            New here? Sign up in the popup — it only takes a minute.
          </p>
        </motion.div>

        <AuthModal
          isOpen={modalOpen}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
          defaultView="signin"
          title="Sign in to your account"
          description="Sign in to access your resumes, analysis, and job matches."
        />
      </div>
    );
  }

  return <>{children}</>;
}
