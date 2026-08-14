"use client";

import React from 'react';
import { 
  Menu, 
  LayoutDashboard,
  FileText,
  Briefcase,
  Settings,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetTrigger 
} from '@/components/ui/sheet';
import { PremiumSidebar } from './PremiumSidebar';
import { BrandMark } from '@/components/brand/Logo';
import Link from 'next/link';

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  jobCount?: number;
  suggestionCount?: number;
  onLogout: () => void;
  onDeleteResume: () => void;
  onPlanUpgrade: () => void;
}

export function MobileNav(props: MobileNavProps) {
  return (
    <div className="lg:hidden flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-50">
      <Link href="/" className="flex items-center gap-2 group">
        <BrandMark size={32} />
        <span className="text-lg font-black tracking-tight text-slate-900">Career<span className="text-brand-600">Amp</span></span>
      </Link>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-slate-600">
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 border-none w-72">
          <SheetHeader className="p-6 pb-2 sr-only">
             <SheetTitle>Navigation Menu</SheetTitle>
          </SheetHeader>
          <div className="h-full">
            <PremiumSidebar 
              {...props}
              isMobile={true}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
