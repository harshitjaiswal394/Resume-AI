"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  ShieldCheck,
  Cookie,
  Download,
  Trash2,
  Loader2,
  Lock,
  FileJson,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";

type ConsentKey = "essential" | "analytics" | "marketing" | "preferences";

const CONSENT_CATEGORIES: { key: ConsentKey; title: string; desc: string; required?: boolean }[] = [
  {
    key: "essential",
    title: "Essential",
    desc: "Required for the Service to work — signing you in, keeping sessions secure, and saving resume drafts. Always on.",
    required: true,
  },
  {
    key: "analytics",
    title: "Analytics",
    desc: "Helps us understand how the Service is used so we can improve features. CareerAmp does not currently run third-party analytics trackers.",
  },
  {
    key: "marketing",
    title: "Marketing",
    desc: "Used to show relevant promotions. We do not currently set any third-party marketing or advertising cookies.",
  },
  {
    key: "preferences",
    title: "Preferences",
    desc: "Remembers your choices, such as editor mode or tailored-view settings, so you don't have to set them every visit.",
  },
];

const COOKIE_STORAGE_KEY = "rm_cookie_consent_v1";
const NOTICE_VERSION = "v1.0";

function Toggle({ checked, onChange, disabled, label }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? "bg-indigo-600" : "bg-slate-200"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function PrivacySettingsPage() {
  const { user, isAuthReady } = useAuth();
  const router = useRouter();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";

  const [loading, setLoading] = useState(true);
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({
    essential: true,
    analytics: false,
    marketing: false,
    preferences: false,
  });
  const [savingKey, setSavingKey] = useState<ConsentKey | null>(null);
  const [accountStatus, setAccountStatus] = useState<string>("active");
  const [deletionDue, setDeletionDue] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const loadState = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) throw new Error("No session");

      const [consentRes, statusRes] = await Promise.all([
        fetch(`${backendUrl}/api/v1/users/consent`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${backendUrl}/api/v1/users/profile`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (!consentRes.ok) throw new Error("Failed to load consent state");
      const consentJson = await consentRes.json();
      if (consentJson.state) {
        setConsents({
          essential: true,
          analytics: !!consentJson.state.analytics,
          marketing: !!consentJson.state.marketing,
          preferences: !!consentJson.state.preferences,
        });
      }

      if (statusRes.ok) {
        const statusJson = await statusRes.json();
        setAccountStatus(statusJson.account_status || "active");
        setDeletionDue(statusJson.hard_delete_due_at || null);
      }
    } catch (err: any) {
      console.error("[Privacy] load failed", err);
      toast.error(err?.message || "Could not load your privacy settings");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, getToken]);

  useEffect(() => {
    if (isAuthReady && !user) {
      router.push("/");
      return;
    }
    if (user) loadState();
  }, [isAuthReady, user, router, loadState]);

  const syncLocalCookiePrefs = (next: Record<ConsentKey, boolean>) => {
    try {
      window.localStorage.setItem(
        COOKIE_STORAGE_KEY,
        JSON.stringify({ ...next, savedAt: new Date().toISOString() })
      );
    } catch {
      /* storage unavailable — ignore */
    }
  };

  const handleConsentToggle = async (key: ConsentKey, value: boolean) => {
    if (key === "essential") return;
    const previous = consents;
    const next = { ...consents, [key]: value };
    setConsents(next);
    setSavingKey(key);
    try {
      const token = await getToken();
      if (!token) throw new Error("No session");
      const res = await fetch(`${backendUrl}/api/v1/users/consent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          consent_type: key,
          status: value,
          notice_version: NOTICE_VERSION,
          language_code: "en",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to save consent");
      }
      syncLocalCookiePrefs(next);
      toast.success(value ? `Consent granted for ${key}` : `Consent withdrawn for ${key}`);
    } catch (err: any) {
      console.error("[Privacy] consent save failed", err);
      setConsents(previous);
      toast.error(err?.message || "Could not save your preference");
    } finally {
      setSavingKey(null);
    }
  };

  const handleExport = async (format: "json" | "csv") => {
    setExporting(format);
    try {
      const token = await getToken();
      if (!token) throw new Error("No session");
      const res = await fetch(`${backendUrl}/api/v1/users/profile/export?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "json" ? "my-careeramp-data.json" : "my-careeramp-data.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Your data export is downloading");
    } catch (err: any) {
      console.error("[Privacy] export failed", err);
      toast.error(err?.message || "Could not generate export");
    } finally {
      setExporting(null);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("No session");
      const res = await fetch(`${backendUrl}/api/v1/users/profile`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Requested via privacy settings" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "Deletion request failed");
      setAccountStatus("deletion_requested");
      setDeletionDue(json.grace_period_ends_at || null);
      setConfirmOpen(false);
      setConfirmText("");
      toast.success("Deletion scheduled", {
        description: "Your account will be permanently purged after the 30-day grace period.",
      });
    } catch (err: any) {
      console.error("[Privacy] delete failed", err);
      toast.error(err?.message || "Could not schedule deletion");
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelDeletion = async () => {
    setCancelling(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("No session");
      const res = await fetch(`${backendUrl}/api/v1/users/profile/cancel-deletion`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "Could not cancel deletion");
      setAccountStatus("active");
      setDeletionDue(null);
      toast.success("Deletion cancelled", { description: "Your account and data will be kept." });
    } catch (err: any) {
      console.error("[Privacy] cancel failed", err);
      toast.error(err?.message || "Could not cancel deletion");
    } finally {
      setCancelling(false);
    }
  };

  const deletionPending = accountStatus === "deletion_requested";
  const formatDue = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(d);
  };

  if (!isAuthReady || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-8">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="h-10 w-10 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <ShieldCheck className="h-7 w-7 text-indigo-600" />
              Privacy Settings
            </h1>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Manage your consent, data access and erasure rights under the Digital Personal Data Protection (DPDP) Act, 2025.
            </p>
          </div>
        </div>

        {deletionPending && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-black text-amber-700">
                <Clock className="h-5 w-5" /> Account deletion pending
              </div>
              <p className="text-sm font-medium text-amber-600 mt-1">
                Your data will be permanently purged on <span className="font-bold">{formatDue(deletionDue)}</span>. You can cancel this any time during the grace period.
              </p>
            </div>
            <Button
              onClick={handleCancelDeletion}
              disabled={cancelling}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold shrink-0"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Cancel Deletion
            </Button>
          </div>
        )}

        {/* Consent */}
        <Card className="border-slate-100 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <Cookie className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-lg font-black text-slate-900">Consent Preferences</CardTitle>
                <CardDescription className="text-sm font-medium text-slate-500 mt-0.5">
                  Grant or withdraw consent for how your data is used. Changes apply immediately.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading ? (
              <div className="flex items-center gap-3 py-6 text-slate-400 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your consent state…
              </div>
            ) : (
              CONSENT_CATEGORIES.map((c) => (
                <div
                  key={c.key}
                  className={`flex items-start justify-between gap-4 rounded-2xl px-4 py-4 ${c.required ? "bg-slate-50/70" : "hover:bg-slate-50/70"} transition-colors`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[15px] font-bold text-slate-800">
                        {c.title}
                        {c.required && (
                          <span className="ml-2 text-[11px] font-semibold text-indigo-600">(Always on)</span>
                        )}
                      </p>
                      {savingKey === c.key && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{c.desc}</p>
                  </div>
                  <Toggle
                    checked={consents[c.key]}
                    onChange={(v) => handleConsentToggle(c.key, v)}
                    disabled={c.required || savingKey === c.key}
                    label={`Toggle ${c.title} consent`}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Export */}
        <Card className="border-slate-100 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <Download className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-lg font-black text-slate-900">Download Your Data</CardTitle>
                <CardDescription className="text-sm font-medium text-slate-500 mt-0.5">
                  Your right to data portability (DPDP §11). Get a copy of everything we hold about you.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => handleExport("json")}
              disabled={exporting !== null}
              variant="outline"
              className="rounded-xl border-slate-200 font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-600 h-12 flex-1"
            >
              {exporting === "json" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
              Export as JSON
            </Button>
            <Button
              onClick={() => handleExport("csv")}
              disabled={exporting !== null}
              variant="outline"
              className="rounded-xl border-slate-200 font-bold text-slate-700 hover:border-indigo-200 hover:text-indigo-600 h-12 flex-1"
            >
              {exporting === "csv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Export as CSV
            </Button>
          </CardContent>
        </Card>

        {/* Delete account */}
        <Card className="border-rose-100 shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-2xl bg-rose-50 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <CardTitle className="text-lg font-black text-slate-900">Delete Account</CardTitle>
                <CardDescription className="text-sm font-medium text-slate-500 mt-0.5">
                  Your right to erasure (DPDP §12). After a 30-day grace period, all your data is permanently purged.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {deletionPending ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm font-medium text-amber-700">
                  A deletion request is already in progress. Your data will be permanently removed on{" "}
                  <span className="font-bold">{formatDue(deletionDue)}</span>.
                  <button
                    onClick={handleCancelDeletion}
                    disabled={cancelling}
                    className="block mt-2 font-bold text-amber-800 hover:underline disabled:opacity-60"
                  >
                    {cancelling ? "Cancelling…" : "I changed my mind — cancel the deletion"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  variant="danger"
                  className="rounded-xl font-bold"
                >
                  <Trash2 className="h-4 w-4" /> Request Account Deletion
                </Button>
                <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" /> You'll have 30 days to change your mind before data is erased.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Confirm deletion modal */}
        {confirmOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
            <div
              className="absolute inset-0 bg-black/30 backdrop-blur-sm"
              onClick={() => setConfirmOpen(false)}
            />
            <div className="relative w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Delete your account?</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                    This schedules permanent deletion of your account, resumes, chats, job matches and all associated data.
                    You'll have <span className="font-bold">30 days</span> to cancel before anything is erased.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-xs font-bold text-slate-500 mb-1.5">
                  Type <span className="text-rose-600">DELETE</span> to confirm
                </label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  placeholder="DELETE"
                  autoFocus
                />
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => setConfirmOpen(false)}
                  variant="outline"
                  className="rounded-xl font-bold flex-1"
                >
                  Keep my account
                </Button>
                <Button
                  onClick={handleDeleteAccount}
                  disabled={confirmText !== "DELETE" || deleting}
                  variant="danger"
                  className="rounded-xl font-bold flex-1 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Schedule Deletion
                </Button>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-xs font-medium text-slate-400 flex items-center justify-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Your privacy choices are recorded in accordance with the DPDP Act, 2025. See our{" "}
          <Link href="/privacy" className="font-bold text-indigo-600 hover:underline">Privacy Policy</Link>.
        </p>
      </div>
    </div>
  );
}
