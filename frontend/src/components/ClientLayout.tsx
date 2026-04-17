"use client";

import React from "react";
import { usePathname } from "next/navigation";
import dynamic from 'next/dynamic';
import { Toaster } from "./ui/sonner";
import Navbar from "./Navbar";
import Footer from "./Footer";
const AuthProvider = dynamic(() => import('./AuthProvider').then(mod => mod.AuthProvider), { ssr: false });

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isDashboard = pathname?.startsWith("/dashboard");
  const isOnboarding = pathname?.startsWith("/onboarding");

  // Only show the old global Navbar on routes that aren't the home page, onboarding, or dashboard.
  const showNavbar = !isHome && !isOnboarding && !isDashboard;
  // Prevent duplicate footers on the home page and dashboard.
  const showFooter = !isHome && !isDashboard;

  return (
    <AuthProvider>
      <div className="min-h-screen bg-background font-sans antialiased flex flex-col">
        {showNavbar && <Navbar />}
        <main className="flex-grow">{children}</main>
        {showFooter && <Footer />}
        <Toaster />
      </div>
    </AuthProvider>
  );
}
