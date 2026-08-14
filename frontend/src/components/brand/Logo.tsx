"use client";

import React from "react";
import Link from "next/link";

export function BrandMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  // Unique gradient id per instance so multiple BrandMarks on the same page
  // (sidebar + mobile sheet + navbar + footer) never collide on `url(#...)`.
  const gradientId = `amp-grad-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // Geometric ascending bars — a minimal "career amp" mark.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect x="1" y="1" width="38" height="38" rx="11" fill={`url(#${gradientId})`} />
      <rect x="7" y="22" width="6" height="10" rx="2" fill="white" opacity="0.92" />
      <rect x="17" y="15" width="6" height="17" rx="2" fill="white" opacity="0.92" />
      <rect x="27" y="8" width="6" height="24" rx="2" fill="white" opacity="0.92" />
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0D9488" />
          <stop offset="1" stopColor="#134E4A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Logo({
  href = "/",
  size = 28,
  textClassName = "text-[17px] font-bold tracking-tight",
  showText = true,
  variant = "dark",
}: {
  href?: string;
  size?: number;
  textClassName?: string;
  showText?: boolean;
  variant?: "dark" | "light";
}) {
  const textColor = variant === "light" ? "text-white" : "text-[var(--text-primary)]";
  return (
    <Link href={href} className="inline-flex items-center gap-2.5">
      <BrandMark size={size} />
      {showText && (
        <span className={`${textClassName} ${textColor}`}>
          Career<span className="text-brand-600">Amp</span>
        </span>
      )}
    </Link>
  );
}

export default Logo;
