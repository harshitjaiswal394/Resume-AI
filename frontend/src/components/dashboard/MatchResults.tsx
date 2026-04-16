"use client";

import React from 'react';
import {
  MapPin,
  Clock,
  IndianRupee,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Lock,
  Briefcase
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface MatchResultsProps {
  matches: any[];
  isPro?: boolean;
  onUpgrade?: () => void;
  onSave?: (jobId: string, isSaved: boolean) => Promise<void>;
  onGenerateCoverLetter?: (match: any) => void;
}

export function MatchResults({
  matches,
  isPro = false,
  onUpgrade,
  onSave,
  onGenerateCoverLetter
}: MatchResultsProps) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[28px] font-black tracking-tight text-slate-900">Job Matches</h2>
          <p className="text-slate-500 font-medium">Based on your resume skills and target role — sorted by match %</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400 font-bold">Showing {matches.length} matches</span>
          <Button variant="link" className="text-indigo-600 font-black p-0 uppercase text-xs tracking-widest">Upgrade for all</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(matches || []).map((match, idx) => (
          <MatchCard
            key={idx}
            match={match}
            isLocked={!isPro && idx >= 5}
            onUpgrade={onUpgrade}
            onSave={onSave}
            onGenerateCoverLetter={onGenerateCoverLetter}
          />
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';

function MatchCard({ match, isLocked, onUpgrade, onSave, onGenerateCoverLetter }: any) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (onSave) {
      setIsSaving(true);
      await onSave(match.id, !match.is_saved);
      setIsSaving(false);
    }
  };

  return (
    <div className={`relative bg-white rounded-[32px] p-8 border border-slate-50 shadow-sm transition-all duration-300 ${isLocked ? 'blur-[4px] pointer-events-none opacity-60' : 'hover:shadow-xl hover:-translate-y-1'}`}>
      <div className="flex justify-between items-start mb-6">
        <div className="space-y-1 pr-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-black text-slate-900 leading-tight">{match.job_title || match.role}</h3>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className={`p-1.5 rounded-lg transition-colors ${match.is_saved ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:bg-slate-100'}`}
            >
              {match.is_saved ? <BookmarkCheck className="h-4 w-4 fill-current" /> : <Bookmark className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center gap-2 text-slate-400 font-bold text-[13px] flex-wrap">
            <MapPin className="h-3 w-3" />
            <span>{match.location || 'Remote'}</span>
            <span className="w-1 h-1 rounded-full bg-slate-200" />
            <Briefcase className="h-3 w-3" />
            <span>{match.domain || 'Tech'}</span>
            <span className="w-1 h-1 rounded-full bg-slate-200" />
            <Clock className="h-3 w-3" />
            <span>{match.work_mode || 'Full-time'}</span>
          </div>

          <div className="flex items-center gap-3 mt-2">
            {(match.salary_min || match.salary_range) && (
              <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs">
                <IndianRupee className="h-3 w-3" />
                <span>{match.salaryRange || match.salary_range}</span>
              </div>
            )}
            {match.source && (
              <Badge className="bg-slate-100 text-slate-500 border-none px-2 py-0 h-5 font-black text-[9px] uppercase tracking-tighter">
                Source: {match.source}
              </Badge>
            )}
          </div>
        </div>

        <div className={`
            shrink-0 h-14 w-14 rounded-[20px] flex items-center justify-center font-black text-base shadow-inner border border-white/50
            ${(match.matchScore || match.match_score) > 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}
          `}>
          {match.matchScore || match.match_score}%
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div className="flex justify-between items-end">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Match strength</p>
          {match.similarity && (
            <p className="text-[10px] font-black text-indigo-300">Vector Similarity: {(match.similarity * 100).toFixed(1)}%</p>
          )}
        </div>
        <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${(match.matchScore || match.match_score) > 80 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
            style={{ width: `${match.matchScore || match.match_score}%` }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(match.matchingSkills || match.matching_skills || []).map((skill: string) => (
            <Badge key={`m-${skill}`} className="bg-emerald-50 text-emerald-600 border-none px-3 py-1 font-bold text-[11px] rounded-lg">
              ✓ {skill}
            </Badge>
          ))}
          {(match.missingSkills || match.missing_skills || []).map((skill: string) => (
            <Badge key={`mis-${skill}`} className="bg-rose-50 text-rose-500 border-none px-3 py-1 font-bold text-[11px] rounded-lg">
              + {skill}
            </Badge>
          ))}
        </div>
      </div>


      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">Apply on portals:</span>
          {onGenerateCoverLetter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50"
              onClick={() => onGenerateCoverLetter(match)}
            >
              <Sparkles className="mr-1 h-3 w-3" /> Cover Letter
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {match.apply_links && typeof match.apply_links === 'object' ? (
            Object.entries(match.apply_links).map(([platform, url]) => (
              <Button
                key={platform}
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs font-bold rounded-lg capitalize border-slate-200"
                onClick={() => window.open(url as string, '_blank')}
              >
                {platform} <ExternalLink className="ml-1 h-3 w-3" />
              </Button>
            ))
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs font-bold rounded-lg capitalize border-slate-200"
              onClick={() => window.open(`https://linkedin.com/jobs/search/?keywords=${encodeURIComponent(match.job_title || match.role || '')}`, '_blank')}
            >
              LinkedIn <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {isLocked && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-8 text-center bg-white/40 backdrop-blur-[2px] rounded-[32px]">
          <div className="bg-white p-6 rounded-[24px] shadow-2xl shadow-indigo-200 border border-indigo-50 flex flex-col items-center">
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-indigo-600" />
            </div>
            <h4 className="font-black text-slate-900 mb-2">Pro Feature</h4>
            <p className="text-sm text-slate-500 font-medium mb-6">Unlock all job matches</p>
            <button
              onClick={onUpgrade}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-indigo-200 hover:scale-105 transition-transform"
            >
              Upgrade — ₹299/mo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
