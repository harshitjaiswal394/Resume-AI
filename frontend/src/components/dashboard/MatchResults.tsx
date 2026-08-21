"use client";

import React, { useState } from 'react';
import {
  MapPin,
  Clock,
  IndianRupee,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Lock,
  Briefcase,
  Building2
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
  const [locationFilter, setLocationFilter] = useState<'all' | 'india' | 'international'>('all');

  const INDIA_KEYWORDS = ['india', 'bangalore', 'bengaluru', 'hyderabad', 'pune', 'mumbai', 'chennai', 'delhi', 'noida', 'gurgaon', 'gurugram', 'kolkata', 'coimbatore', 'ahmedabad', 'jaipur', 'lucknow', 'indore', 'bhopal', 'chandigarh', 'mysore', 'visakhapatnam', 'patna', 'kochi', 'thiruvananthapuram', 'in,', 'in |', ', in', 'bangalore', 'south asia'];

  const filteredMatches = (matches || []).filter((match: any) => {
    if (locationFilter === 'all') return true;
    const loc = (match.location || '').toLowerCase();
    const isIndia = INDIA_KEYWORDS.some(kw => loc.includes(kw));
    return locationFilter === 'india' ? isIndia : !isIndia;
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-[28px] font-black tracking-tight text-slate-900">Job Matches</h2>
          <p className="text-slate-500 font-medium">Based on your resume skills and target role — sorted by match %</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden">
            {(['all', 'india', 'international'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setLocationFilter(f)}
                className={`px-4 py-2 text-[12px] font-bold transition-colors ${
                  locationFilter === f
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {f === 'all' ? 'All' : f === 'india' ? 'India' : 'International'}
              </button>
            ))}
          </div>
          <span className="text-slate-400 font-bold text-sm">{filteredMatches.length} matches</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMatches.map((match: any, idx: number) => (
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

import { Bookmark, BookmarkCheck, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

function MatchCard({ match, isLocked, onUpgrade, onSave, onGenerateCoverLetter }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const [showAllMatching, setShowAllMatching] = useState(false);
  const [showAllMissing, setShowAllMissing] = useState(false);
  const router = useRouter();

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
            {match.company && (
              <>
                <Building2 className="h-3 w-3" />
                <span className="text-slate-600">{match.company}</span>
                <span className="w-1 h-1 rounded-full bg-slate-200" />
              </>
            )}
            <MapPin className="h-3 w-3" />
            <span>{match.location || 'Remote'}</span>
            <span className="w-1 h-1 rounded-full bg-slate-200" />
            <span>{match.domain || match.source || 'Tech'}</span>
          </div>

          <div className="flex items-center gap-3 mt-2">
            {match.salary_range && (
              <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs">
                <IndianRupee className="h-3 w-3" />
                <span>{match.salary_range}</span>
              </div>
            )}
          </div>
        </div>

        <div className={`
            shrink-0 h-14 w-14 rounded-[20px] flex items-center justify-center font-black text-base shadow-inner border border-white/50
            ${(match.matchScore ?? match.match_score ?? 0) > 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}
          `}>
          {match.matchScore ?? match.match_score ?? 0}%
        </div>
      </div>

      <div className="space-y-4 mb-6">
        <div className="flex justify-between items-end">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Match strength</p>
          {match.similarity != null && (
            <p className="text-[10px] font-black text-indigo-300">Vector Similarity: {(match.similarity * 100).toFixed(1)}%</p>
          )}
        </div>
        <div className="h-1.5 w-full bg-slate-50 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${(match.matchScore ?? match.match_score ?? 0) > 80 ? 'bg-emerald-500' : 'bg-indigo-600'}`}
            style={{ width: `${match.matchScore ?? match.match_score ?? 0}%` }}
          />
        </div>

        <div className="space-y-2">
          {(match.matchingSkills || match.matching_skills || []).length > 0 && (
            <div>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Matching</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(match.matchingSkills || match.matching_skills || []).slice(0, showAllMatching ? undefined : 6).map((skill: string) => (
                  <Badge key={`m-${skill}`} className="bg-emerald-50 text-emerald-600 border-none px-2.5 py-0.5 font-bold text-[10px] rounded-md">
                    ✓ {skill}
                  </Badge>
                ))}
                {(match.matchingSkills || match.matching_skills || []).length > 6 && !showAllMatching && (
                  <button onClick={() => setShowAllMatching(true)} className="text-[10px] font-bold text-emerald-400 hover:text-emerald-600 self-center transition-colors cursor-pointer">
                    +{(match.matchingSkills || match.matching_skills || []).length - 6} more
                  </button>
                )}
                {showAllMatching && (match.matchingSkills || match.matching_skills || []).length > 6 && (
                  <button onClick={() => setShowAllMatching(false)} className="text-[10px] font-bold text-emerald-400 hover:text-emerald-600 self-center transition-colors cursor-pointer">
                    show less
                  </button>
                )}
              </div>
            </div>
          )}
          {(match.missingSkills || match.missing_skills || []).length > 0 && (
            <div>
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Missing</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(match.missingSkills || match.missing_skills || []).slice(0, showAllMissing ? undefined : 4).map((skill: string) => (
                  <Badge key={`mis-${skill}`} className="bg-rose-50 text-rose-500 border-none px-2.5 py-0.5 font-bold text-[10px] rounded-md">
                    + {skill}
                  </Badge>
                ))}
                {(match.missingSkills || match.missing_skills || []).length > 4 && !showAllMissing && (
                  <button onClick={() => setShowAllMissing(true)} className="text-[10px] font-bold text-rose-400 hover:text-rose-600 self-center transition-colors cursor-pointer">
                    +{(match.missingSkills || match.missing_skills || []).length - 4} more
                  </button>
                )}
                {showAllMissing && (match.missingSkills || match.missing_skills || []).length > 4 && (
                  <button onClick={() => setShowAllMissing(false)} className="text-[10px] font-bold text-rose-400 hover:text-rose-600 self-center transition-colors cursor-pointer">
                    show less
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>


      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">Apply on portal:</span>
          <div className="flex gap-1">
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
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] font-bold text-violet-600 hover:bg-violet-50"
              onClick={() => {
                const jdUrl = match.apply_url || match.apply_links?.linkedin || match.apply_links?.indeed || match.apply_links?.naukri || '';
                const params = new URLSearchParams();
                if (jdUrl) params.set('jdUrl', jdUrl);
                if (match.job_title || match.role) params.set('title', match.job_title || match.role);
                if (match.company) params.set('company', match.company);
                const jdFallback = match.jd_text || match.description || '';
                if (jdFallback) {
                  sessionStorage.setItem('tailor_jd_fallback', jdFallback);
                  params.set('hasJd', '1');
                }
                router.push(`/dashboard/tailor?${params.toString()}`);
              }}
            >
              <Wand2 className="mr-1 h-3 w-3" /> Tailor Resume
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs font-bold rounded-lg border-slate-200"
            onClick={() => {
              const url = match.apply_url || match.apply_links?.linkedin || match.apply_links?.indeed || match.apply_links?.naukri || `https://linkedin.com/jobs/search/?keywords=${encodeURIComponent(match.job_title || match.role || '')}`;
              window.open(url, '_blank');
            }}
          >
            Apply <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
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
