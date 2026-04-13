"use client";

import React from 'react';
import { 
  FileText, 
  Search, 
  AlertCircle,
  Clock 
} from 'lucide-react';

interface StatsColumnProps {
  keywordsFound: string; // e.g. "34/41"
  resumeLength: string; // e.g. "1 page"
  skillGaps: number;
  weakBullets: number;
}

export function StatsColumn({
  keywordsFound,
  resumeLength,
  skillGaps,
  weakBullets
}: StatsColumnProps) {
  return (
    <div className="space-y-4">
      <StatCard 
        label="Keywords Found"
        value={keywordsFound}
        subtext="Role relevant terms"
        icon={<Search className="h-5 w-5 text-indigo-600" />}
        color="bg-indigo-50"
      />
      <StatCard 
        label="Resume Length"
        value={resumeLength}
        subtext="Ideal for your experience"
        icon={<FileText className="h-5 w-5 text-emerald-600" />}
        color="bg-emerald-50"
      />
      <StatCard 
        label="Skill Gaps"
        value={`${skillGaps} found`}
        subtext="High-priority for target role"
        icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
        color="bg-amber-50"
      />
      <StatCard 
        label="Weak Bullets"
        value={`${weakBullets} found`}
        subtext="AI rewrites available"
        icon={<AlertCircle className="h-5 w-5 text-rose-600" />}
        color="bg-rose-50"
      />
    </div>
  );
}

function StatCard({ label, value, subtext, icon, color }: any) {
  return (
    <div className={`p-6 rounded-[24px] ${color} space-y-4 flex flex-col justify-between h-[160px] border border-white`}>
      <div className="flex justify-between items-start">
        <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
          {icon}
        </div>
        <span className="text-[28px] font-black text-slate-900 leading-none">{value.split(' ')[0]} <span className="text-sm font-bold text-slate-500">{value.split(' ')[1] || ''}</span></span>
      </div>
      
      <div className="space-y-1">
        <h4 className="font-bold text-slate-800 text-[15px]">{label}</h4>
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{subtext}</p>
      </div>
    </div>
  );
}
