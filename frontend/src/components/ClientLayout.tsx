"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "./AuthProvider";
import { Toaster } from "./ui/sonner";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { ChatWidget } from "./ChatWidget";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isDashboard = pathname?.startsWith("/dashboard");
  const isOnboarding = pathname?.startsWith("/onboarding");
  const isChat = pathname === "/chat" || pathname?.startsWith("/chat/");

  // Only show the old global Navbar on routes that aren't the home page, onboarding, dashboard, or chat.
  const showNavbar = !isHome && !isOnboarding && !isDashboard && !isChat;
  // Prevent duplicate footers on the home page, dashboard, and chat.
  const showFooter = !isHome && !isDashboard && !isChat;

  return (
    <AuthProvider>
      <div className="min-h-screen bg-background font-sans antialiased flex flex-col">
        {showNavbar && <Navbar />}
        <main className="flex-grow">{children}</main>
        {showFooter && <Footer />}
        <Toaster />
        <ChatWidget />
      </div>
    </AuthProvider>
  );
}
