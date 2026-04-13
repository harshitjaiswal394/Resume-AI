"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import { Briefcase, LogOut, User, Menu } from 'lucide-react';
import { AuthModal } from './common/AuthModal';

export default function Navbar() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/');
    } catch (error) {
      console.error('Sign out failed', error);
    }
  };

  const scrollToSection = (sectionId: string) => {
    if (pathname !== '/') {
      router.push(`/#${sectionId}`);
    } else {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-20 items-center justify-between px-6">
        <Link href="/" className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <span className="text-h3 font-bold tracking-tight">ResuMatch AI</span>
        </Link>

        <div className="hidden md:flex items-center space-x-8 text-small font-medium text-muted-foreground">
          <button onClick={() => scrollToSection('features')} className="hover:text-brand-600 transition-colors cursor-pointer">Features</button>
          <button onClick={() => scrollToSection('how-it-works')} className="hover:text-brand-600 transition-colors cursor-pointer">How it works</button>
          <button onClick={() => scrollToSection('pricing')} className="hover:text-brand-600 transition-colors cursor-pointer">Pricing</button>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-4">
          {user ? (
            <div className="flex items-center gap-2">
              <Link href="/dashboard" className="hidden sm:block">
                <Button variant="ghost" className="font-bold">Dashboard</Button>
              </Link>
              <Button variant="outline" size="icon" onClick={handleSignOut} className="rounded-xl">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setShowAuthModal(true)} className="font-bold text-small sm:text-body">
                Sign in
              </Button>
              <Button className="rounded-xl px-4 sm:px-6 font-bold shadow-lg shadow-brand-500/20 text-small sm:text-body" onClick={() => setShowAuthModal(true)}>
                Sign Up <span className="hidden sm:inline ml-1">Free</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </nav>
  );
}
