"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Briefcase, Github, Twitter, Linkedin, Mail } from 'lucide-react';

export default function Footer() {
  const router = useRouter();
  const pathname = usePathname();

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
    <footer className="bg-[var(--bg-surface)] border-t py-16">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="col-span-1 md:col-span-1">
            <Link href="/" className="flex items-center space-x-2 mb-6">
              <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <span className="text-h3 font-bold tracking-tight">ResuMatch AI</span>
            </Link>
            <p className="text-small text-muted-foreground leading-relaxed">
              Helping Indian job seekers land their dream roles with AI-powered resume analysis and job matching.
            </p>
            <div className="flex space-x-4 mt-6">
              <a href="#" className="text-subtle hover:text-brand-600 transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-subtle hover:text-brand-600 transition-colors">
                <Github className="h-5 w-5" />
              </a>
              <a href="#" className="text-subtle hover:text-brand-600 transition-colors">
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-label text-primary mb-6">Product</h4>
            <ul className="space-y-4 text-small text-muted-foreground">
              <li><button onClick={() => scrollToSection('features')} className="hover:text-brand-600 transition-colors cursor-pointer">Features</button></li>
              <li><button onClick={() => scrollToSection('how-it-works')} className="hover:text-brand-600 transition-colors cursor-pointer">How it works</button></li>
              <li><button onClick={() => scrollToSection('pricing')} className="hover:text-brand-600 transition-colors cursor-pointer">Pricing</button></li>
              <li><a href="#" className="hover:text-brand-600 transition-colors">API (Coming Soon)</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-label text-primary mb-6">Resources</h4>
            <ul className="space-y-4 text-small text-muted-foreground">
              <li><a href="#" className="hover:text-brand-600 transition-colors">Resume Tips</a></li>
              <li><a href="#" className="hover:text-brand-600 transition-colors">Interview Prep</a></li>
              <li><a href="#" className="hover:text-brand-600 transition-colors">Career Blog</a></li>
              <li><a href="#" className="hover:text-brand-600 transition-colors">Job Market Trends</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-label text-primary mb-6">Contact</h4>
            <ul className="space-y-4 text-small text-muted-foreground">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> support@resumatch.ai
              </li>
              <li>Mumbai, Maharashtra, India</li>
            </ul>
          </div>
        </div>

        <div className="mt-16 pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] text-subtle">
          <p>© 2026 ResuMatch AI. All rights reserved.</p>
          <div className="flex space-x-6">
            <a href="#" className="hover:text-brand-600 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-brand-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-brand-600 transition-colors">Cookie Policy</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
