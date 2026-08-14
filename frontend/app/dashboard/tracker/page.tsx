"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  IndianRupee,
  Calendar,
  X,
  Loader2,
  Kanban,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  BellRing,
  CalendarCheck,
  Handshake,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";

const STAGES = [
  { key: "saved", label: "Saved", color: "text-slate-500", dot: "bg-slate-400", icon: Clock },
  { key: "applied", label: "Applied", color: "text-sky-600", dot: "bg-sky-500", icon: Send },
  { key: "interview", label: "Interview", color: "text-amber-600", dot: "bg-amber-500", icon: Calendar },
  { key: "offer", label: "Offer", color: "text-emerald-600", dot: "bg-emerald-500", icon: CheckCircle2 },
  { key: "rejected", label: "Rejected", color: "text-rose-600", dot: "bg-rose-500", icon: XCircle },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

type JobApp = {
  id: string;
  user_id: string;
  company: string | null;
  title: string | null;
  location: string | null;
  apply_url: string | null;
  salary_range: { min?: string; max?: string; currency?: string } | null;
  status: string;
  notes: string | null;
  applied_at: string | null;
  interview_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FormState = {
  id?: string;
  company: string;
  title: string;
  location: string;
  apply_url: string;
  salary_min: string;
  salary_max: string;
  salary_currency: string;
  notes: string;
  status: StageKey;
  interview_at: string;
};

const EMPTY_FORM: FormState = {
  company: "",
  title: "",
  location: "",
  apply_url: "",
  salary_min: "",
  salary_max: "",
  salary_currency: "LPA",
  notes: "",
  status: "saved",
  interview_at: "",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

type Nudge = {
  id: string;
  kind: "warn" | "info" | "success" | "reminder";
  message: string;
};

const DAY = 86400000;

function computeNudges(apps: JobApp[]): Nudge[] {
  const now = Date.now();
  const out: Nudge[] = [];
  for (const app of apps) {
    const label = app.company || app.title || "this role";
    const lastTouch = new Date(app.updated_at || app.created_at || app.applied_at || now).getTime();
    const staleDays = (now - lastTouch) / DAY;
    const safeDays = Math.max(1, Math.floor(staleDays));

    if (app.status === "applied" && staleDays >= 7 && !app.interview_at) {
      out.push({
        id: `followup-${app.id}`,
        kind: "warn",
        message: `You applied to ${label} ${safeDays} days ago. A short, polite follow-up can revive the thread.`,
      });
    }
    if (app.status === "saved" && staleDays >= 14) {
      out.push({
        id: `apply-${app.id}`,
        kind: "info",
        message: `${label} has been saved for ${safeDays} days. Ready to apply before it goes stale?`,
      });
    }
    if (app.status === "interview" && app.interview_at) {
      const it = new Date(app.interview_at).getTime();
      if (it > now && it - now <= 2 * DAY) {
        out.push({
          id: `interview-${app.id}`,
          kind: "reminder",
          message: `Interview with ${label} is scheduled for ${formatDate(app.interview_at)} — review your notes and prep the role.`,
        });
      } else if (it <= now) {
        out.push({
          id: `thanks-${app.id}`,
          kind: "success",
          message: `Your ${label} interview was on ${formatDate(app.interview_at)}. Send a thank-you note today to stay top of mind.`,
        });
      }
    }
  }
  return out;
}

export default function TrackerPage() {
  const { user, isAuthReady } = useAuth();
  const router = useRouter();
  const [apps, setApps] = useState<JobApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const dropRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const loadApps = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("job_applications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("load tracker error", error);
      toast.error("Could not load your applications");
    } else {
      setApps((data as JobApp[]) ?? []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (isAuthReady) {
      if (!user) {
        router.replace("/");
        return;
      }
      loadApps();
    }
  }, [isAuthReady, user, router, loadApps]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (app: JobApp) => {
    const salary = app.salary_range ?? {};
    setForm({
      id: app.id,
      company: app.company ?? "",
      title: app.title ?? "",
      location: app.location ?? "",
      apply_url: app.apply_url ?? "",
      salary_min: salary.min ?? "",
      salary_max: salary.max ?? "",
      salary_currency: salary.currency ?? "LPA",
      notes: app.notes ?? "",
      status: (STAGES.some((s) => s.key === app.status) ? app.status : "saved") as StageKey,
      interview_at: app.interview_at ? new Date(app.interview_at).toISOString().slice(0, 16) : "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.company.trim() && !form.title.trim()) {
      toast.error("Add a company or role name");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: user!.id,
      company: form.company.trim() || null,
      title: form.title.trim() || null,
      location: form.location.trim() || null,
      apply_url: form.apply_url.trim() || null,
      salary_range:
        form.salary_min.trim() || form.salary_max.trim()
          ? {
              min: form.salary_min.trim() || undefined,
              max: form.salary_max.trim() || undefined,
              currency: form.salary_currency.trim() || "LPA",
            }
          : null,
      notes: form.notes.trim() || null,
      status: form.status,
      interview_at: form.interview_at ? new Date(form.interview_at).toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (form.id) {
      const { error } = await supabase
        .from("job_applications")
        .update(payload)
        .eq("id", form.id)
        .eq("user_id", user!.id);
      if (error) {
        toast.error("Failed to update application");
        console.error(error);
      } else {
        toast.success("Application updated");
      }
    } else {
      const { data, error } = await supabase
        .from("job_applications")
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select("*")
        .single();
      if (error) {
        toast.error("Failed to add application");
        console.error(error);
      } else if (data) {
        toast.success("Application added to your tracker");
      }
    }
    setSaving(false);
    setModalOpen(false);
    loadApps();
  };

  const moveStage = async (app: JobApp, dir: -1 | 1) => {
    const idx = STAGES.findIndex((s) => s.key === app.status);
    const next = STAGES[idx + dir];
    if (!next) return;
    setApps((prev) =>
      prev.map((a) =>
        a.id === app.id
          ? { ...a, status: next.key, applied_at: next.key === "applied" ? a.applied_at ?? new Date().toISOString() : a.applied_at }
          : a
      )
    );
    const { error } = await supabase
      .from("job_applications")
      .update({ status: next.key, updated_at: new Date().toISOString() })
      .eq("id", app.id)
      .eq("user_id", user!.id);
    if (error) {
      console.error(error);
      toast.error("Failed to move application");
      loadApps();
    }
  };

  const handleDrop = async (stage: StageKey) => {
    if (!dragId) return;
    const target = apps.find((a) => a.id === dragId);
    setDragging(false);
    setDragId(null);
    if (!target || target.status === stage) return;
    setApps((prev) =>
      prev.map((a) =>
        a.id === dragId
          ? { ...a, status: stage, applied_at: stage === "applied" ? a.applied_at ?? new Date().toISOString() : a.applied_at }
          : a
      )
    );
    const { error } = await supabase
      .from("job_applications")
      .update({ status: stage, updated_at: new Date().toISOString() })
      .eq("id", dragId)
      .eq("user_id", user!.id);
    if (error) {
      console.error(error);
      toast.error("Failed to move application");
      loadApps();
    }
  };

  const handleDelete = async (app: JobApp) => {
    if (!window.confirm(`Remove "${app.title || app.company || "this application"}" from your tracker?`)) return;
    const { error } = await supabase
      .from("job_applications")
      .delete()
      .eq("id", app.id)
      .eq("user_id", user!.id);
    if (error) {
      console.error(error);
      toast.error("Failed to delete application");
    } else {
      toast.success("Application removed");
      setApps((prev) => prev.filter((a) => a.id !== app.id));
    }
  };

  const byStage = (key: StageKey) => apps.filter((a) => a.status === key);
  const total = apps.length;
  const nudges = computeNudges(apps).filter((n) => !dismissed.has(n.id));
  const NUDGE_STYLES: Record<Nudge["kind"], { icon: typeof BellRing; chip: string; text: string }> = {
    warn: { icon: BellRing, chip: "bg-rose-50 text-rose-600", text: "text-rose-700" },
    info: { icon: BellRing, chip: "bg-sky-50 text-sky-600", text: "text-sky-700" },
    success: { icon: Handshake, chip: "bg-emerald-50 text-emerald-600", text: "text-emerald-700" },
    reminder: { icon: CalendarCheck, chip: "bg-amber-50 text-amber-600", text: "text-amber-700" },
  };

  if (loading || !isAuthReady) {
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
              <h1 className="text-[16px] font-bold leading-none">Job Tracker</h1>
              <p className="mt-1 text-[12px] font-medium text-slate-400">Your application pipeline</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[12px] font-bold">
              <Kanban className="mr-1.5 h-3.5 w-3.5" />
              {total} {total === 1 ? "application" : "applications"}
            </Badge>
            <Button onClick={openAdd} className="rounded-xl bg-brand-600 px-4 font-bold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-800">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Application</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {nudges.length > 0 && (
          <div className="mb-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-brand-600" />
              <h2 className="text-[14px] font-bold text-slate-800">Smart nudges</h2>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {nudges.map((n) => {
                const style = NUDGE_STYLES[n.kind];
                const NudgeIcon = style.icon;
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 rounded-xl px-3.5 py-3 ${style.chip} ring-1 ring-black/[0.04]`}
                  >
                    <NudgeIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <p className={`flex-1 text-[13px] font-semibold leading-snug ${style.text}`}>{n.message}</p>
                    <button
                      onClick={() => setDismissed((prev) => new Set(prev).add(n.id))}
                      aria-label="Dismiss nudge"
                      className="rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white px-6 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50">
              <Kanban className="h-8 w-8 text-brand-600" />
            </div>
            <h2 className="mt-5 text-lg font-bold">Track every application in one place</h2>
            <p className="mt-2 max-w-md text-[14px] text-slate-500">
              Add the roles you are applying to and drag them through Saved → Applied → Interview → Offer. Your whole search, on a board.
            </p>
            <Button onClick={openAdd} className="mt-6 rounded-xl bg-brand-600 font-bold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-800">
              <Plus className="h-4 w-4" /> Add your first application
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STAGES.map((stage) => {
              const items = byStage(stage.key);
              const StageIcon = stage.icon;
              return (
                <div
                  key={stage.key}
                  ref={(el) => {
                    dropRefs.current[stage.key] = el;
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(stage.key);
                  }}
                  className={`flex min-h-[300px] flex-col rounded-2xl border border-slate-100 bg-white/60 p-3 transition-colors ${
                    dragging ? "ring-2 ring-brand-200" : ""
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
                      <span className={`text-[13px] font-bold ${stage.color}`}>{stage.label}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{items.length}</span>
                    </div>
                    <StageIcon className="h-4 w-4 text-slate-300" />
                  </div>

                  <div className="flex flex-1 flex-col gap-2">
                    <AnimatePresence>
                      {items.map((app) => (
                        <motion.div
                          key={app.id}
                          layout
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          draggable
                          onDragStart={() => {
                            setDragId(app.id);
                            setDragging(true);
                          }}
                          onDragEnd={() => {
                            setDragging(false);
                            setDragId(null);
                          }}
                          className="group cursor-grab rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-bold text-slate-900">{app.title || "Untitled role"}</p>
                              <p className="mt-0.5 truncate text-[13px] font-medium text-slate-500">{app.company || "—"}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                onClick={() => moveStage(app, -1)}
                                disabled={STAGES[0].key === app.status}
                                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                                aria-label="Move back"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => moveStage(app, 1)}
                                disabled={STAGES[STAGES.length - 1].key === app.status}
                                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                                aria-label="Move forward"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {(app.location || app.salary_range) && (
                            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-slate-400">
                              {app.location && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" /> {app.location}
                                </span>
                              )}
                              {app.salary_range && (app.salary_range.min || app.salary_range.max) && (
                                <span className="inline-flex items-center gap-1">
                                  <IndianRupee className="h-3.5 w-3.5" />
                                  {app.salary_range.min && <span>{app.salary_range.min}</span>}
                                  {app.salary_range.min && app.salary_range.max && <span>–</span>}
                                  {app.salary_range.max && <span>{app.salary_range.max}</span>}
                                  <span>{app.salary_range.currency}</span>
                                </span>
                              )}
                            </div>
                          )}

                          {app.applied_at && (
                            <p className="mt-2 text-[11px] font-medium text-slate-400">Applied {formatDate(app.applied_at)}</p>
                          )}
                          {app.interview_at && (
                            <p className="mt-1 text-[11px] font-bold text-amber-600">Interview {formatDate(app.interview_at)}</p>
                          )}

                          <div className="mt-3 flex items-center justify-between border-t border-slate-50 pt-2.5">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEdit(app)}
                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-brand-50 hover:text-brand-600"
                                aria-label="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(app)}
                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                                aria-label="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {app.apply_url && (
                              <a
                                href={app.apply_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-md p-1.5 text-[12px] font-bold text-brand-600 transition-colors hover:bg-brand-50"
                              >
                                Open <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  <button
                    onClick={() => {
                      setForm({ ...EMPTY_FORM, status: stage.key });
                      setModalOpen(true);
                    }}
                    className="mt-3 flex items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 py-2 text-[12px] font-bold text-slate-400 transition-colors hover:border-brand-300 hover:text-brand-600"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 32, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{form.id ? "Edit application" : "Add application"}</h3>
                <button onClick={() => setModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-slate-400">Company</span>
                  <input
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="e.g. Razorpay"
                    className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-slate-400">Role</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. SDE-1"
                    className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-slate-400">Location</span>
                  <input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="e.g. Bengaluru / Remote"
                    className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-slate-400">Application link</span>
                  <input
                    value={form.apply_url}
                    onChange={(e) => setForm({ ...form, apply_url: e.target.value })}
                    placeholder="https://..."
                    className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-slate-400">Salary min</span>
                  <input
                    value={form.salary_min}
                    onChange={(e) => setForm({ ...form, salary_min: e.target.value })}
                    placeholder="e.g. 12"
                    className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-slate-400">Salary max</span>
                  <input
                    value={form.salary_max}
                    onChange={(e) => setForm({ ...form, salary_max: e.target.value })}
                    placeholder="e.g. 18"
                    className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-slate-400">Currency unit</span>
                  <div className="flex gap-2">
                    {["LPA", "CTC", "₹/mo", "$/yr"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm({ ...form, salary_currency: c })}
                        className={`rounded-xl border px-4 py-2 text-[13px] font-bold transition-colors ${
                          form.salary_currency === c
                            ? "border-brand-500 bg-brand-50 text-brand-700"
                            : "border-slate-200 text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-slate-400">Stage</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as StageKey })}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  >
                    {STAGES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-slate-400">Interview time</span>
                  <input
                    type="datetime-local"
                    value={form.interview_at}
                    onChange={(e) => setForm({ ...form, interview_at: e.target.value })}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3.5 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-wide text-slate-400">Notes</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={3}
                    placeholder="Recruiter contact, round details, next steps..."
                    className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-3 text-[14px] font-medium outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </label>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setModalOpen(false)} className="rounded-xl font-bold">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving} className="rounded-xl bg-brand-600 font-bold text-white shadow-lg shadow-brand-600/20 hover:bg-brand-800">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {form.id ? "Save changes" : "Add to tracker"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
