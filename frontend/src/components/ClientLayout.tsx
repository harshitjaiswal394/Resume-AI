"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "./AuthProvider";
import { Toaster } from "./ui/sonner";
import Navbar from "./Navbar";
import Footer from "./Footer";

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboard = pathname?.startsWith("/dashboard");
  const isOnboarding = pathname?.startsWith("/onboarding");

  return (
    <AuthProvider>
      <div className="min-h-screen bg-background font-sans antialiased flex flex-col">
        {!isOnboarding && <Navbar />}
        <main className="flex-grow">{children}</main>
        {!isDashboard && <Footer />}
        <Toaster />
      </div>
    </AuthProvider>
  );
}
