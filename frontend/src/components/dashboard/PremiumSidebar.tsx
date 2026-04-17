"use client";

import React, { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Sparkles,
  Settings,
  LogOut,
  Trash2,
  Zap,
  Crown,
  ChevronLeft,
  ChevronRight
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
  isMobile?: boolean;
}

export function PremiumSidebar({
  activeTab,
  setActiveTab,
  jobCount = 0,
  suggestionCount = 0,
  onLogout,
  onDeleteResume,
  onPlanUpgrade,
  isMobile = false
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const effectiveCollapsed = isMobile ? false : isCollapsed;

  return (
    <aside className={`
      border-r bg-white flex flex-col transition-all duration-300 ease-in-out
      ${isMobile ? 'h-full w-full' : `hidden lg:flex h-screen sticky top-0 ${effectiveCollapsed ? 'w-20' : 'w-64'}`}
    `}>
      {/* Brand */}
      <div className={`p-6 ${effectiveCollapsed ? 'flex justify-center' : 'p-6 lg:p-8'}`}>
        <Link href="/" className="flex items-center gap-3 group">
          <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200 group-hover:scale-105 transition-transform">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          {!effectiveCollapsed && (
            <span className="text-xl font-black tracking-tight text-slate-900 whitespace-nowrap">ResumeAI</span>
          )}
        </Link>
      </div>

      {/* Scrollable Area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* Nav */}
        <nav className={`flex-1 space-y-2 ${effectiveCollapsed ? 'px-3' : 'px-4'}`}>
          <NavItem isCollapsed={effectiveCollapsed} icon={<LayoutDashboard />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
          <NavItem isCollapsed={effectiveCollapsed} icon={<FileText />} label="My Resume" active={activeTab === 'resume'} onClick={() => setActiveTab('resume')} />
          <NavItem isCollapsed={effectiveCollapsed} icon={<Briefcase />} label="Job Matches" active={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')} count={jobCount} />
          <NavItem isCollapsed={effectiveCollapsed} icon={<Sparkles />} label="AI Suggestions" active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} count={suggestionCount} />
          <NavItem isCollapsed={effectiveCollapsed} icon={<Settings />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        {/* Bottom Actions */}
        <div className={`p-4 space-y-4 shrink-0 mt-4 ${effectiveCollapsed ? 'px-2' : 'px-4'}`}>
          {/* Upgrade Card */}
          {!effectiveCollapsed && (
            <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#6366f1] to-[#a855f7] p-5 text-white shadow-xl shadow-indigo-100/50">
              <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-2xl" />
              <h4 className="font-bold text-[15px] mb-1 flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-400" /> Upgrade to Pro
              </h4>
              <p className="text-[12px] text-indigo-50 mb-4 font-medium leading-relaxed">
                Unlimited analyses, AI rewrites, cover letters
              </p>
              <button
                onClick={onPlanUpgrade}
                className="w-full bg-white/20 hover:bg-white hover:text-indigo-600 text-white h-10 rounded-xl text-xs font-bold transition-colors shadow-sm"
              >
                Start Pro — ₹299/mo
              </button>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={onDeleteResume}
              className={`flex items-center gap-3 py-2.5 text-[15px] font-medium text-slate-500 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all ${effectiveCollapsed ? 'justify-center w-full px-0' : 'w-full px-4'}`}
              title="Delete Resume"
            >
              <Trash2 className="h-[22px] w-[22px] shrink-0" />
              {!effectiveCollapsed && <span className="whitespace-nowrap">Delete Resume</span>}
            </button>
            <button
              onClick={onLogout}
              className={`flex items-center gap-3 py-2.5 text-[15px] font-medium text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all ${effectiveCollapsed ? 'justify-center w-full px-0' : 'w-full px-4'}`}
              title="Sign Out"
            >
              <LogOut className="h-[22px] w-[22px] shrink-0" />
              {!effectiveCollapsed && <span className="whitespace-nowrap">Sign Out</span>}
            </button>
          </div>

          {/* Collapse Button - Desktop Only */}
          <div className={`pt-2 border-t border-slate-100 hidden lg:flex ${effectiveCollapsed ? 'justify-center' : 'justify-start'}`}>
              <button 
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
              >
                {effectiveCollapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <><ChevronLeft className="h-4 w-4 shrink-0" /> <span className="whitespace-nowrap">Collapse</span></>}
              </button>
          </div>
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
  count,
  isCollapsed
}: {
  icon: React.ReactNode,
  label: string,
  active: boolean,
  onClick: () => void,
  count?: number,
  isCollapsed: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`
        relative flex items-center w-full rounded-2xl transition-all duration-200
        ${isCollapsed ? 'justify-center py-3' : 'justify-between px-4 py-3'}
        ${active
          ? 'bg-indigo-50 text-indigo-700 font-semibold'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
      `}
      title={isCollapsed ? label : undefined}
    >
      <div className={`flex items-center ${isCollapsed ? '' : 'gap-3'}`}>
        <span className={`transition-colors ${active ? 'text-indigo-700' : 'text-slate-500 group-hover:text-slate-600'}`}>
          {React.cloneElement(icon as any, { className: 'h-[22px] w-[22px]' })}
        </span>
        {!isCollapsed && <span className="text-[16px] whitespace-nowrap">{label}</span>}
      </div>
      
      {/* Badge / Count */}
      {count !== undefined && count > 0 && (
        isCollapsed ? (
          <span className="absolute top-2.5 right-2.5 h-2.5 w-2.5 rounded-full bg-indigo-600 border-2 border-white" />
        ) : (
          <span className={`
            text-[12px] px-2 py-0.5 rounded-full font-bold
            ${active ? 'bg-indigo-100/80 text-indigo-700' : 'bg-slate-100 text-slate-600'}
          `}>
            {count}
          </span>
        )
      )}
    </button>
  );
}
