"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import {
  Search,
  MapPin,
  Clock,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Loader2,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Sparkles,
  Building2,
  X,
} from "lucide-react";

const WORK_MODES = ["Remote", "On-site", "Hybrid"];
const EXPERIENCE_LEVELS = ["Entry level", "Mid-Senior", "Senior", "Director", "Executive"];
const SALARY_OPTIONS = [
  { value: 0, label: "Any salary" },
  { value: 10, label: "10+ LPA" },
  { value: 15, label: "15+ LPA" },
  { value: 20, label: "20+ LPA" },
  { value: 30, label: "30+ LPA" },
  { value: 40, label: "40+ LPA" },
  { value: 50, label: "50+ LPA" },
];
const DAY_OPTIONS = [
  { value: 0, label: "Any time" },
  { value: 1, label: "Past 24 hours" },
  { value: 3, label: "Past 3 days" },
  { value: 7, label: "Past week" },
  { value: 30, label: "Past month" },
];

type Job = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  skills: string[] | null;
  salary_range: string | null;
  domain: string | null;
  source: string | null;
  work_mode: string | null;
  experience_level: string | null;
  apply_url: string | null;
  posted_at: string | null;
  similarity?: number;
  apply_links?: Record<string, string>;
};

type Filters = {
  q: string;
  location: string;
  work_mode: string;
  experience_level: string;
  days_old: number;
  salary_min: number;
};

const DEFAULT_FILTERS: Filters = { q: "", location: "", work_mode: "", experience_level: "", days_old: 30, salary_min: 0 };

function parseSalary(text: string | null): { min?: string; max?: string; currency?: string } | null {
  if (!text) return null;
  const nums = text.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  return {
    min: nums[0],
    max: nums.length > 1 ? nums[1] : nums[0],
    currency: "LPA",
  };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function titleCase(s: string | null): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function JobsPage() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [aiRanked, setAiRanked] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  const PAGE = Math.floor(offset / limit) + 1;

  const fetchSaved = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("job_applications")
      .select("job_posting_id")
      .eq("user_id", user.id)
      .not("job_posting_id", "is", null);
    if (!error && data) {
      setSavedIds(new Set(data.map((d) => d.job_posting_id)));
    }
  }, [user]);

  useEffect(() => {
    if (isAuthReady) {
      if (!user) {
        router.replace("/");
        return;
      }
      fetchSaved();
    }
  }, [isAuthReady, user, router, fetchSaved]);

  const runSearch = useCallback(
    async (newOffset = 0, overrides: Partial<Filters> = {}) => {
      setLoading(true);
      const active = { ...filters, ...overrides };
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";
      const params = new URLSearchParams();
      if (active.q.trim()) params.set("q", active.q.trim());
      if (active.location.trim()) params.set("location", active.location.trim());
      if (active.work_mode) params.set("work_mode", active.work_mode);
      if (active.experience_level) params.set("experience_level", active.experience_level);
      if (active.days_old) params.set("days_old", String(active.days_old));
      if (active.salary_min) params.set("salary_min", String(active.salary_min));
      params.set("limit", String(limit));
      params.set("offset", String(newOffset));
      try {
        const res = await fetch(`${backendUrl}/api/resume/search-jobs?${params.toString()}`);
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.detail || "Search failed");
        setJobs(result.data.jobs ?? []);
        setTotal(result.data.total ?? 0);
        setOffset(newOffset);
        setAiRanked(!!result.data.ai_ranked);
        setHasSearched(true);
      } catch (err) {
        console.error(err);
        toast.error("Could not search jobs. Is the backend running?");
        setJobs([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [filters, limit]
  );

  const resetToInitial = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setJobs([]);
    setTotal(0);
    setOffset(0);
    setAiRanked(false);
    setHasSearched(false);
  }, []);

  const handleChip = useCallback(
    (q: string) => {
      setFilters((f) => ({ ...f, q }));
      runSearch(0, { q });
    },
    [runSearch]
  );

  const handleSave = async (job: Job) => {
    if (!user) return;
    setSavingId(job.id);
    const payload = {
      user_id: user.id,
      company: job.company || null,
      title: job.title || null,
      location: job.location || null,
      apply_url: job.apply_url || null,
      salary_range: parseSalary(job.salary_range),
      notes: null,
      status: "saved",
      job_posting_id: job.id,
      source: job.source || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("job_applications").insert(payload).select("*").single();
    setSavingId(null);
    if (error) {
      console.error(error);
      toast.error("Could not save this job to your tracker");
    } else {
      toast.success("Saved to your Job Tracker");
      setSavedIds((prev) => new Set(prev).add(job.id));
    }
  };

  const applyHref = (job: Job) => job.apply_url || job.apply_links?.linkedin || job.apply_links?.naukri || job.apply_links?.indeed || "#";

  const pageCount = Math.max(1, Math.ceil(total / limit));

  if (!isAuthReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f8fafc]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f8fafc] font-sans text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <div className="hidden sm:block">
              <h1 className="text-[16px] font-bold leading-none">Job Search</h1>
              <p className="mt-1 text-[12px] font-medium text-slate-400">Discover live openings from 2,500+ postings</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {aiRanked && hasSearched && (
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[12px] font-bold">
                <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                AI-ranked
              </Badge>
            )}
            {hasSearched && (
              <Badge variant="secondary" className="rounded-full px-3 py-1 text-[12px] font-bold">
                <Briefcase className="mr-1.5 h-3.5 w-3.5" />
                {total} {total === 1 ? "job" : "jobs"}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Filters */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && runSearch(0)}
                placeholder="Role, skills or company…"
                className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label className="relative">
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={filters.location}
                onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && runSearch(0)}
                placeholder="Location (Bangalore, Remote…)"
                className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <select
              value={filters.work_mode}
              onChange={(e) => setFilters({ ...filters, work_mode: e.target.value })}
              className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">All work modes</option>
              {WORK_MODES.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <select
              value={filters.experience_level}
              onChange={(e) => setFilters({ ...filters, experience_level: e.target.value })}
              className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">All experience</option>
              {EXPERIENCE_LEVELS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <select
              value={filters.salary_min}
              onChange={(e) => setFilters({ ...filters, salary_min: Number(e.target.value) })}
              className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              {SALARY_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={filters.days_old}
              onChange={(e) => setFilters({ ...filters, days_old: Number(e.target.value) })}
              className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              {DAY_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              onClick={resetToInitial}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold text-slate-500 transition-colors hover:text-slate-800"
            >
              <X className="h-3.5 w-3.5" /> Reset
            </button>
            <Button onClick={() => runSearch(0)} className="rounded-xl bg-brand-600 px-6 font-bold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-800">
              <Search className="h-4 w-4" /> Search
            </Button>
          </div>
        </div>

        {/* Results */}
        <div className="mt-6">
          {!hasSearched && !loading ? (
            <div className="relative overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-100/70 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-100/60 blur-3xl" />
              <div className="relative px-6 py-16 text-center sm:px-12 sm:py-20">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 shadow-lg shadow-brand-600/25">
                  <Search className="h-8 w-8 text-white" />
                </div>
                <h2 className="mt-6 text-2xl font-black tracking-tight text-slate-900 sm:text-[28px]">
                  Find your next role
                </h2>
                <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-slate-500">
                  Search by role, skill, or company and our AI will rank the strongest matches for you across thousands of live postings.
                </p>
                <div className="mx-auto mt-8 flex max-w-lg flex-wrap items-center justify-center gap-2">
                  {["React Developer", "Data Analyst", "Product Manager", "DevOps Engineer", "UI/UX Designer", "Backend Engineer"].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => handleChip(chip)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-600 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 hover:shadow-sm"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center rounded-[28px] border border-slate-100 bg-white py-24">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
              <p className="mt-4 text-[14px] font-medium text-slate-500">Finding the best matches…</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white px-6 py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
                <Search className="h-8 w-8 text-brand-600" />
              </div>
              <h2 className="mt-5 text-lg font-bold">No jobs match your filters</h2>
              <p className="mt-2 max-w-md text-[14px] text-slate-500">
                Try widening the time window, removing the salary filter, or searching with a broader role title.
              </p>
              <Button
                onClick={resetToInitial}
                className="mt-6 rounded-xl bg-brand-600 font-bold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-800"
              >
                Reset filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {jobs.map((job) => {
                const saved = savedIds.has(job.id);
                return (
                  <div
                    key={job.id}
                    className="flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-900">{job.title || "Untitled role"}</h3>
                        <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-slate-500">
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate">{job.company || "—"}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => handleSave(job)}
                        disabled={savingId === job.id}
                        aria-label={saved ? "Saved to tracker" : "Save to tracker"}
                        className={`shrink-0 rounded-lg p-2 transition-colors ${
                          saved ? "bg-brand-50 text-brand-600" : "text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                        }`}
                      >
                        {savingId === job.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : saved ? (
                          <BookmarkCheck className="h-4 w-4" />
                        ) : (
                          <Bookmark className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {(job.location || job.work_mode) && (
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-slate-400">
                        {job.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" /> {job.location}
                          </span>
                        )}
                        {job.work_mode && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
                            {titleCase(job.work_mode)}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-slate-400">
                      {job.salary_range && (
                        <span className="inline-flex items-center gap-1">
                          <IndianRupee className="h-3.5 w-3.5" /> {job.salary_range}
                        </span>
                      )}
                      {job.source && <span className="text-slate-400">{titleCase(job.source)}</span>}
                      {job.posted_at && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {timeAgo(job.posted_at)}
                        </span>
                      )}
                    </div>

                    {job.description && (
                      <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-slate-500">
                        {job.description.replace(/\s+/g, " ").slice(0, 400)}
                      </p>
                    )}

                    {Array.isArray(job.skills) && job.skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {job.skills.slice(0, 6).map((s) => (
                          <span key={s} className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-100">
                            {s}
                          </span>
                        ))}
                        {job.skills.length > 6 && (
                          <span className="px-1 py-1 text-[11px] font-bold text-slate-400">+{job.skills.length - 6}</span>
                        )}
                      </div>
                    )}

                    {job.similarity !== undefined && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-slate-400">Match</span>
                          <span className={job.similarity >= 0.5 ? "text-brand-600" : "text-amber-600"}>
                            {Math.round(job.similarity * 100)}%
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600"
                            style={{ width: `${Math.min(100, Math.round(job.similarity * 100))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2 border-t border-slate-50 pt-3.5">
                      <a
                        href={applyHref(job)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-brand-800"
                      >
                        Apply <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => router.push("/dashboard/tracker")}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2.5 text-[12px] font-bold text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-600"
                      >
                        <Briefcase className="h-3.5 w-3.5" /> Tracker
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 sm:flex-row">
            <p className="text-[13px] font-medium text-slate-500">
              Showing <span className="font-bold text-slate-800">{offset + 1}</span>–{Math.min(offset + limit, total)} of{" "}
              <span className="font-bold text-slate-800">{total}</span> jobs
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => runSearch(offset - limit)}
                disabled={offset === 0 || loading}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3.5 py-2 text-[13px] font-bold text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <span className="px-2 text-[13px] font-bold text-slate-700">
                Page {PAGE} of {pageCount}
              </span>
              <button
                onClick={() => runSearch(offset + limit)}
                disabled={offset + limit >= total || loading}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3.5 py-2 text-[13px] font-bold text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
