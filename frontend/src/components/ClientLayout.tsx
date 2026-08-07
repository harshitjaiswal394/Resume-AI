"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "./AuthProvider";
import { Toaster } from "./ui/sonner";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { ChatWidget } from "./ChatWidget";
import { CookieConsent } from "./compliance/CookieConsent";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isDashboard = pathname?.startsWith("/dashboard");
  const isOnboarding = pathname?.startsWith("/onboarding");
  const isChat = pathname === "/chat" || pathname?.startsWith("/chat/");
  const isLegal = ["/terms", "/privacy", "/cookies", "/gdpr", "/refund-policy"].some((r) => pathname?.startsWith(r));
  const isMarketing = ["/features", "/how-it-works", "/pricing", "/resume-tips", "/interview-prep", "/blog", "/job-market-trends"].some(
    (r) => pathname?.startsWith(r)
  );

  // Only show the old global Navbar on routes that aren't the home page, onboarding, dashboard, chat, legal, or marketing pages.
  const showNavbar = !isHome && !isOnboarding && !isDashboard && !isChat && !isLegal && !isMarketing;
  // Prevent duplicate footers on the home page, dashboard, chat, and legal/marketing pages (which render their own).
  const showFooter = !isHome && !isDashboard && !isChat && !isLegal && !isMarketing;

  return (
    <AuthProvider>
      <div className="min-h-screen bg-background font-sans antialiased flex flex-col">
        {showNavbar && <Navbar />}
        <main className="flex-grow">{children}</main>
        {showFooter && <Footer />}
        <Toaster />
        <ChatWidget />
        <CookieConsent />
      </div>
    </AuthProvider>
  );
}
