"use client";

import React from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  Briefcase, 
  Sparkles, 
  Settings, 
  LogOut, 
  Trash2,
  Zap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  jobCount?: number;
  suggestionCount?: number;
  onLogout: () => void;
  onDeleteResume: () => void;
  onPlanUpgrade: () => void;
}

export function PremiumSidebar({
  activeTab,
  setActiveTab,
  jobCount = 0,
  suggestionCount = 0,
  onLogout,
  onDeleteResume,
  onPlanUpgrade
}: SidebarProps) {
  return (
    <aside className="w-64 border-r bg-white flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="p-8">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:scale-105 transition-transform">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-black tracking-tight text-slate-900">ResumeAI</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 space-y-2">
        <NavItem 
          icon={<LayoutDashboard />} 
          label="Dashboard" 
          active={activeTab === 'dashboard'} 
          onClick={() => setActiveTab('dashboard')} 
        />
        <NavItem 
          icon={<FileText />} 
          label="My Resume" 
          active={activeTab === 'resume'} 
          onClick={() => setActiveTab('resume')} 
        />
        <NavItem 
          icon={<Briefcase />} 
          label="Job Matches" 
          active={activeTab === 'jobs'} 
          onClick={() => setActiveTab('jobs')} 
          count={jobCount}
        />
        <NavItem 
          icon={<Sparkles />} 
          label="AI Suggestions" 
          active={activeTab === 'ai'} 
          onClick={() => setActiveTab('ai')} 
          count={suggestionCount}
        />
        <NavItem 
          icon={<Settings />} 
          label="Settings" 
          active={activeTab === 'settings'} 
          onClick={() => setActiveTab('settings')} 
        />
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 space-y-4">
        {/* Upgrade Card */}
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#6366f1] to-[#a855f7] p-5 text-white shadow-xl shadow-indigo-100/50">
          <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-2xl" />
          <h4 className="font-bold text-sm mb-1 flex items-center gap-2">
            <Zap className="h-4 w-4 fill-white" /> Upgrade to Pro
          </h4>
          <p className="text-[11px] text-white/80 mb-4 font-medium leading-relaxed">
            Unlimited analyses, AI rewrites, cover letters
          </p>
          <button 
            onClick={onPlanUpgrade}
            className="w-full bg-white text-indigo-600 h-9 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors shadow-sm"
          >
            Start Pro — ₹299/mo
          </button>
        </div>
        
        <div className="pt-2">
          <button 
            onClick={onDeleteResume}
            className="flex items-center gap-3 px-4 py-2.5 w-full text-sm font-semibold text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
          >
            <Trash2 className="h-4 w-4" /> 
            <span>Delete Resume</span>
          </button>
          <button 
            onClick={onLogout}
            className="flex items-center gap-3 px-4 py-2.5 w-full text-sm font-semibold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
          >
            <LogOut className="h-4 w-4" /> 
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ 
  icon, 
  label, 
  active, 
  onClick, 
  count 
}: { 
  icon: React.ReactNode, 
  label: string, 
  active: boolean, 
  onClick: () => void,
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center justify-between px-4 py-3 w-full rounded-2xl transition-all duration-200
        ${active 
          ? 'bg-indigo-50/50 text-indigo-600 shadow-sm' 
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
      `}
    >
      <div className="flex items-center gap-3">
        <span className={`transition-colors ${active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
          {React.cloneElement(icon as React.ReactElement, { className: 'h-5 w-5' })}
        </span>
        <span className="font-bold text-[15px]">{label}</span>
      </div>
      {count !== undefined && count > 0 && (
        <span className={`
          text-[11px] px-2 py-0.5 rounded-full font-bold
          ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}
        `}>
          {count}
        </span>
      )}
    </button>
  );
}
