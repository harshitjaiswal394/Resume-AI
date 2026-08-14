"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LoadingScreen } from "@/components/ui/loading";
import {
  Sparkles,
  Copy,
  ChevronLeft,
  Loader2,
  Handshake,
  Send,
  MessageSquare,
  Quote,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";

const TONES = ["Warm & professional", "Casual & friendly", "Formal", "Short & direct"];
const PLATFORMS = ["LinkedIn message", "Email", "WhatsApp", "Instagram DM"];

type ParsedData = {
  fullName?: string;
  summary?: string;
  skills?: string[];
  experience?: { title?: string; company?: string; description?: string[] }[];
  education?: unknown;
};

export default function ReferralsPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [recipientName, setRecipientName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [targetCompany, setTargetCompany] = useState("");
  const [platform, setPlatform] = useState("LinkedIn message");
  const [tone, setTone] = useState("Warm & professional");
  const [extraContext, setExtraContext] = useState("");
  const [highlights, setHighlights] = useState("");
  const [resumeAttached, setResumeAttached] = useState(false);
  const [content, setContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (user) loadLatestResume();
  }, [user]);

  const loadLatestResume = async () => {
    const { data, error } = await supabase
      .from("resumes")
      .select("parsed_data")
      .eq("user_id", user!.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("resume load error", error);
      return;
    }
    const parsed = (data?.parsed_data ?? null) as ParsedData | null;
    if (!parsed || (!parsed.fullName && !parsed.summary && !(parsed.skills?.length))) return;
    setResumeAttached(true);
    const exp = (parsed.experience ?? [])
      .filter((e) => e?.title || e?.company)
      .slice(0, 3)
      .map((e) => `${[e.title, e.company].filter(Boolean).join(" @ ")}`);
    setHighlights(exp.join("\n"));
  };

  const buildResumeData = () => {
    const lines = highlights.split("\n").map((l) => l.trim()).filter(Boolean);
    return { achievements: lines.slice(0, 6) };
  };

  const handleGenerate = async () => {
    if (!targetRole.trim() && !targetCompany.trim()) {
      toast.error("Tell us the role or company you are targeting");
      return;
    }

    setIsGenerating(true);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";
      const response = await fetch(`${backendUrl}/api/resume/referral`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          resume: buildResumeData(),
          referralDetails: {
            recipientName: recipientName.trim(),
            relationship: relationship.trim(),
            targetRole: targetRole.trim(),
            targetCompany: targetCompany.trim(),
            platform,
            tone,
            extraContext: extraContext.trim(),
          },
        }),
      });

      const result = await response.json();
      if (result.success && result.content) {
        setContent(result.content);
        toast.success("Referral message ready!");
      } else {
        throw new Error(result.detail || result.error || "Generation failed");
      }
    } catch (e: any) {
      console.error("Referral generation error:", e);
      toast.error(e.message || "Failed to generate referral message");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy — please copy manually");
    }
  };

  return (
    <div className="min-h-dvh bg-[#f8fafc] font-sans text-slate-900">
      <div className="pointer-events-none fixed inset-0 opacity-20 [background:radial-gradient(circle_at_20%_15%,#99f6e4_0,transparent_30%),radial-gradient(circle_at_85%_85%,#fde68a_0,transparent_30%)]" />

      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <div>
              <h1 className="text-[16px] font-bold leading-none">AI Referrals</h1>
              <p className="mt-1 text-[12px] font-medium text-slate-400">Referral messages that actually get replies</p>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={() => router.back()} className="rounded-xl border-slate-100 bg-white shadow-sm" aria-label="Back">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </Button>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-12">
        {/* Input panel */}
        <div className="lg:col-span-5">
          <Card className="border-slate-100 bg-white/90 shadow-lg shadow-slate-200/40 backdrop-blur-sm">
            <CardHeader className="p-6 pb-2">
              <CardTitle className="flex items-center gap-3 text-[17px] font-bold">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Handshake className="h-5 w-5" />
                </div>
                Who are you reaching out to?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6 pt-3">
              {resumeAttached && (
                <div className="flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-3.5 py-2.5 text-[12px] font-semibold text-brand-800">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />
                  Highlights detected from your latest resume — edit below if needed.
                </div>
              )}

              <Field label="Your highlights (1-3 lines)">
                <Textarea
                  value={highlights}
                  onChange={(e) => setHighlights(e.target.value)}
                  placeholder={"e.g.\nFull-stack engineer @ startup, 3 years\nBuilt payment flow used by 40k+ users\nLed a 5-person team"}
                  rows={4}
                  className="resize-none rounded-xl border-slate-200 text-[14px] font-medium focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Recipient name">
                  <Input
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="h-11 rounded-xl border-slate-200 text-[14px] font-medium focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </Field>
                <Field label="How do you know them?">
                  <Input
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    placeholder="e.g. ex-colleague at Infosys"
                    className="h-11 rounded-xl border-slate-200 text-[14px] font-medium focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </Field>
                <Field label="Target role">
                  <Input
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="e.g. Senior Frontend Engineer"
                    className="h-11 rounded-xl border-slate-200 text-[14px] font-medium focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </Field>
                <Field label="Company">
                  <Input
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                    placeholder="e.g. Razorpay"
                    className="h-11 rounded-xl border-slate-200 text-[14px] font-medium focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Platform">
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-[14px] font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Tone">
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-white text-[14px] font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Anything else they should know?">
                <Textarea
                  value={extraContext}
                  onChange={(e) => setExtraContext(e.target.value)}
                  placeholder="e.g. We did our undergrad together at NIT Trichy. She left a team I now want to join."
                  rows={2}
                  className="resize-none rounded-xl border-slate-200 text-[14px] font-medium focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </Field>

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || (!targetRole.trim() && !targetCompany.trim())}
                className="w-full rounded-xl bg-brand-600 text-[15px] font-bold text-white shadow-lg shadow-brand-600/20 transition-all hover:-translate-y-0.5 hover:bg-brand-800 active:scale-[0.98]"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Crafting your message...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Generate referral message
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Output panel */}
        <div className="lg:col-span-7">
          <Card className="flex min-h-[400px] flex-col overflow-hidden border-slate-100 bg-white/90 shadow-lg shadow-slate-200/40 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 p-6">
              <CardTitle className="flex items-center gap-3 text-[17px] font-bold">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <MessageSquare className="h-5 w-5" />
                </div>
                Your message
              </CardTitle>
              {content && (
                <Button variant="outline" size="icon" onClick={copyToClipboard} className="h-10 w-10 rounded-xl border-slate-100 shadow-sm" aria-label="Copy">
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 p-6">
              <AnimatePresence mode="wait">
                {content ? (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="min-h-[400px] border-none p-0 text-[15px] leading-relaxed text-slate-700 focus-visible:ring-0"
                      placeholder="Generated message will appear here — edit before you send."
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="rounded-full px-3 py-1 text-[12px] font-semibold">
                        <Send className="mr-1.5 h-3.5 w-3.5" /> {platform}
                      </Badge>
                      <Badge variant="secondary" className="rounded-full px-3 py-1 text-[12px] font-semibold">
                        <Quote className="mr-1.5 h-3.5 w-3.5" /> {tone}
                      </Badge>
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
                    {isGenerating ? (
                      <LoadingScreen compact label="Writing a human-sounding ask…" sublabel="Personalizing for your recipient. Usually 5-10 seconds." />
                    ) : (
                      <div className="space-y-3">
                        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[2rem] bg-brand-50 text-brand-300">
                          <Handshake className="h-11 w-11" />
                        </div>
                        <p className="text-xl font-black tracking-tight text-slate-800">Warm. Specific. Low-friction.</p>
                        <p className="mx-auto max-w-sm text-[14px] font-medium leading-relaxed text-slate-400">
                          Tell us who you are reaching out to, and get a referral request that respects their time and highlights why you are worth a bet.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}
