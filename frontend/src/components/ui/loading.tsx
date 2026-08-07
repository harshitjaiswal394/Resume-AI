"use client";

import React from "react";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  label?: string;
  sublabel?: string;
  className?: string;
  compact?: boolean;
  dark?: boolean;
}

export function LoadingScreen({
  label = "Loading…",
  sublabel,
  className,
  compact = false,
  dark = false,
}: LoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden",
        compact ? "py-16" : "min-h-screen",
        dark ? "bg-[#050816] text-slate-100" : "bg-transparent text-[var(--text-primary)]",
        className
      )}
    >
      {/* Ambient glows */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden",
          dark ? "opacity-90" : "opacity-60"
        )}
      >
        <div
          className={cn(
            "absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl",
            dark ? "bg-indigo-600/25" : "bg-indigo-500/10"
          )}
        />
        <div
          className={cn(
            "absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl",
            dark ? "bg-fuchsia-500/20" : "bg-fuchsia-500/10"
          )}
        />
      </div>

      {/* Orb + rings */}
      <div className="relative mb-6">
        <motion.span
          className={cn(
            "absolute -inset-3 rounded-[32px] border-2",
            dark ? "border-indigo-400/30" : "border-indigo-500/25"
          )}
          animate={{ scale: [1, 1.5, 1.85], opacity: [0.5, 0.25, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.span
          className={cn(
            "absolute -inset-3 rounded-[32px] border",
            dark ? "border-fuchsia-400/20" : "border-fuchsia-500/20"
          )}
          animate={{ scale: [1, 1.35, 1.6], opacity: [0.4, 0.2, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: 0.55 }}
        />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className={cn(
            "absolute -inset-1.5 rounded-[26px] border border-dashed",
            dark ? "border-white/15" : "border-indigo-500/15"
          )}
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#ff4fd8_0%,#8b5cf6_52%,#2563eb_100%)] shadow-[0_16px_48px_rgba(139,92,246,0.4)] ring-1 ring-white/20">
          <motion.span
            className="absolute inset-0 rounded-[22px] bg-white/20"
            animate={{ opacity: [0.25, 0.05, 0.25] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <Sparkles className="relative h-7 w-7 text-white" />
        </div>
      </div>

      {/* Text */}
      <div className="relative text-center">
        <p className={cn("text-sm font-bold tracking-tight", dark ? "text-white" : "text-[var(--text-primary)]")}>
          ResuMatch <span className="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 bg-clip-text text-transparent">AI</span>
        </p>
        <p className={cn("mt-2 flex items-center justify-center gap-2 text-sm font-medium", dark ? "text-slate-400" : "text-[var(--text-muted)]")}>
          <span className="flex items-center gap-1">
            <motion.span
              className={cn("h-1.5 w-1.5 rounded-full", dark ? "bg-indigo-400" : "bg-indigo-500")}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              className={cn("h-1.5 w-1.5 rounded-full", dark ? "bg-fuchsia-400" : "bg-fuchsia-500")}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
            />
            <motion.span
              className={cn("h-1.5 w-1.5 rounded-full", dark ? "bg-violet-400" : "bg-violet-500")}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
            />
          </span>
          <span className="animate-pulse">{label}</span>
        </p>
        {sublabel && (
          <p className={cn("mt-1.5 text-xs", dark ? "text-slate-500" : "text-[var(--text-subtle)]")}>{sublabel}</p>
        )}
      </div>
    </div>
  );
}

interface ThinkingIndicatorProps {
  dark?: boolean;
}

export function ThinkingIndicator({ dark = false }: ThinkingIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-2.5" role="status" aria-live="polite">
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              dark ? "bg-fuchsia-400" : "bg-indigo-500"
            )}
            animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
          />
        ))}
      </span>
      <span className={cn("text-sm italic", dark ? "text-slate-400" : "text-muted-foreground")}>
        Thinking…
      </span>
    </span>
  );
}
