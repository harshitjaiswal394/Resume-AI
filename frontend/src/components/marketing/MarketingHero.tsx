"use client";

import React from "react";
import { motion } from "motion/react";

export function MarketingHero({
  badge,
  title,
  highlight,
  subtitle,
}: {
  badge?: string;
  title: string;
  highlight?: string;
  subtitle?: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--border-soft)] bg-[var(--bg-base)] pb-16 pt-32 sm:pb-24 sm:pt-40">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 top-24 h-72 w-72 rounded-full bg-accent-50/80 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, var(--border-base) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 text-center sm:px-6">
        {badge && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-100 bg-white px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600 shadow-sm"
          >
            <span className="h-2 w-2 rounded-full bg-brand-600" />
            {badge}
          </motion.div>
        )}

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mx-auto max-w-3xl text-[38px] font-bold leading-[1.05] tracking-tight sm:text-6xl"
        >
          {title}{" "}
          {highlight && (
            <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-accent-500 bg-clip-text text-transparent">
              {highlight}
            </span>
          )}
        </motion.h1>

        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-[var(--text-muted)] sm:text-[17px]"
          >
            {subtitle}
          </motion.p>
        )}
      </div>
    </section>
  );
}
