"use client";

import React from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface ScoreAnalyticsProps {
  score: number;
  atsScore?: number;
  keywordScore?: number;
  readabilityScore?: number;
  scoreBreakdown?: any;
}

export function ScoreAnalytics({
  score,
  atsScore = 64,
  keywordScore = 82,
  readabilityScore = 91,
  scoreBreakdown
}: ScoreAnalyticsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* 1. Score Gauge Card */}
      <div className="bg-white rounded-[32px] p-10 flex flex-col items-center justify-center text-center shadow-sm border border-slate-50">
        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-8">Resume Score</span>

        <div className="relative h-48 w-48 flex items-center justify-center">
          <svg className="h-full w-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="transparent"
              stroke="#f1f5f9"
              strokeWidth="8"
            />
            <motion.circle
              cx="50"
              cy="50"
              r="45"
              fill="transparent"
              stroke="#6366f1"
              strokeWidth="8"
              strokeDasharray="283"
              initial={{ strokeDashoffset: 283 }}
              animate={{ strokeDashoffset: 283 - (283 * score) / 100 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-6xl font-black text-slate-900">{score}</span>
            <span className="text-sm font-bold text-slate-400">out of 100</span>
          </div>
        </div>

        <div className="mt-10">
          <Badge className="bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-100 rounded-lg px-4 py-1.5 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-bold text-xs uppercase tracking-wider">Needs Improvement</span>
          </Badge>
        </div>

        <p className="mt-8 text-sm text-slate-400 font-medium leading-relaxed max-w-[200px]">
          Top candidates score 85+. Fix ATS issues to improve by ~10 points.
        </p>
      </div>

      {/* 2. Detailed Metrics Section */}
      <div className="lg:col-span-2 space-y-6">
        <MetricRow
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          title="ATS Compatibility"
          score={atsScore}
          color="bg-amber-500"
          feedback={scoreBreakdown?.weaknesses?.[0] || "Missing standard section headers. Use 'Work Experience', 'Education', 'Skills'."}
          bgColor="bg-amber-50"
        />

        <MetricRow
          icon={<Sparkles className="h-5 w-5 text-indigo-500" />}
          title="Keyword Optimization"
          score={keywordScore}
          color="bg-indigo-600"
          feedback={scoreBreakdown?.recommendations?.[0] || "Good keyword coverage. Add: Kubernetes, CI/CD, Terraform for DevOps roles."}
          bgColor="bg-indigo-50"
        />

        <MetricRow
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
          title="Readability"
          score={readabilityScore}
          color="bg-emerald-500"
          feedback="Excellent formatting and structure. Recruiters can scan this quickly."
          bgColor="bg-emerald-50"
        />
      </div>
    </div>
  );
}

function MetricRow({ icon, title, score, color, feedback, bgColor }: any) {
  return (
    <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-50 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="font-bold text-slate-800 text-[17px]">{title}</h3>
        </div>
        <span className="text-2xl font-black text-slate-900">{score}</span>
      </div>

      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1, delay: 0.2 }}
        />
      </div>

      <div className={`p-4 rounded-2xl flex gap-3 ${bgColor}`}>
        <div className="pt-1">
          <AlertCircle className={`h-4 w-4 ${color.replace('bg-', 'text-')}`} />
        </div>
        <p className={`text-sm font-medium leading-relaxed ${color.replace('bg-', 'text-')}`}>
          {feedback}
        </p>
      </div>
    </div>
  );
}
