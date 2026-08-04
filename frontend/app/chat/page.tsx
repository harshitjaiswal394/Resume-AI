"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Send,
  Plus,
  Sparkles,
  Bot,
  User2,
  Search,
  FileText,
  ChevronLeft,
  LayoutDashboard,
  Briefcase,
  Settings,
  LogOut,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Crown,
  Square,
  SquarePen,
  ChevronDown,
  Menu,
  X,
  Brain,
  GraduationCap,
  Target,
  BriefcaseBusiness,
  HelpCircle,
  Copy,
  Check,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
  Scissors,
  Shield,
  Mic,
  Map,
  Heart,
  FileSearch,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LoadingScreen, ThinkingIndicator } from "@/components/ui/loading";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface ResumeOption {
  id: string;
  title: string | null;
  status: string;
  updated_at: string;
  has_parsed_data: boolean;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system" | "tool";
  content: string;
  created_at: string;
  streaming?: boolean;
  toolEvent?: string; // e.g. "search_jobs", "fetch_user_resume"
  agentLabel?: string;
  providerLabel?: string;
  feedback?: "like" | "dislike";
}

// ──────────────────────────────────────────────────────────────────────────────
// Logger: deep client-side structured logging
// ──────────────────────────────────────────────────────────────────────────────
const LOG_PREFIX = "[ChatUI]";
const log = {
  info:  (msg: string, data?: unknown) => console.info(`${LOG_PREFIX} ℹ️  ${msg}`, data ?? ""),
  warn:  (msg: string, data?: unknown) => console.warn(`${LOG_PREFIX} ⚠️  ${msg}`, data ?? ""),
  error: (msg: string, data?: unknown) => console.error(`${LOG_PREFIX} ❌ ${msg}`, data ?? ""),
  debug: (msg: string, data?: unknown) => console.debug(`${LOG_PREFIX} 🔍 ${msg}`, data ?? ""),
  group: (label: string) => console.group(`${LOG_PREFIX} ${label}`),
  groupEnd: () => console.groupEnd(),
};

// ──────────────────────────────────────────────────────────────────────────────
// Completion chime (Web Audio – no asset needed)
// ──────────────────────────────────────────────────────────────────────────────
let _audioCtx: AudioContext | null = null;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      _audioCtx = null;
    }
  }
  if (_audioCtx && _audioCtx.state === "suspended") {
    _audioCtx.resume().catch(() => undefined);
  }
  return _audioCtx;
}

function playCompletionChime() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.12;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
  log.debug("Completion chime played");
}

// ──────────────────────────────────────────────────────────────────────────────
// Suggested prompts
// ──────────────────────────────────────────────────────────────────────────────
const SUGGESTED_PROMPTS = [
  { icon: <Search className="h-4 w-4" />, label: "Find me SDE2 jobs in Bangalore", color: "from-blue-500/10 to-indigo-500/10 border-blue-500/20 text-blue-700 dark:text-blue-300" },
  { icon: <FileText className="h-4 w-4" />, label: "Analyse my resume and give feedback", color: "from-purple-500/10 to-pink-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300" },
  { icon: <Sparkles className="h-4 w-4" />, label: "What skills should I learn for ML roles?", color: "from-amber-500/10 to-orange-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300" },
  { icon: <Briefcase className="h-4 w-4" />, label: "Write a cover letter for a product manager", color: "from-teal-500/10 to-emerald-500/10 border-teal-500/20 text-teal-700 dark:text-teal-300" },
];

// ──────────────────────────────────────────────────────────────────────────────
// Tool indicator badge
// ──────────────────────────────────────────────────────────────────────────────
function ToolBadge({ name }: { name: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    search_jobs:        { label: "Searching Jobs",         icon: <Search className="h-3 w-3" />,   color: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-300" },
    fetch_user_resume:  { label: "Reading Your Resume",    icon: <FileText className="h-3 w-3" />, color: "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-300" },
    analyze_jd:         { label: "Analyzing JD",           icon: <FileSearch className="h-3 w-3" />, color: "bg-violet-500/10 border-violet-500/30 text-violet-600 dark:text-violet-300" },
    compare_resume_jd:  { label: "Comparing Resume vs JD", icon: <Target className="h-3 w-3" />,  color: "bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-300" },
    tailor_resume:      { label: "Tailoring Resume",       icon: <Scissors className="h-3 w-3" />, color: "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-600 dark:text-fuchsia-300" },
    analyze_ats:        { label: "ATS Analysis",           icon: <Shield className="h-3 w-3" />,  color: "bg-sky-500/10 border-sky-500/30 text-sky-600 dark:text-sky-300" },
    start_interview:    { label: "Starting Interview",     icon: <Mic className="h-3 w-3" />,     color: "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-300" },
    answer_interview:   { label: "Answering Question",     icon: <GraduationCap className="h-3 w-3" />, color: "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-300" },
    generate_roadmap:   { label: "Generating Roadmap",     icon: <Map className="h-3 w-3" />,      color: "bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-300" },
    get_career_advice:  { label: "Career Advice",          icon: <Heart className="h-3 w-3" />,   color: "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-300" },
  };
  const t = map[name] ?? { label: name, icon: <Sparkles className="h-3 w-3" />, color: "bg-slate-500/10 border-slate-500/30 text-slate-600" };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${t.color} backdrop-blur-sm`}
    >
      {t.icon}
      {t.label}
      <Loader2 className="h-3 w-3 animate-spin ml-0.5" />
    </motion.div>
  );
}

function getHeadingIcon(label: string) {
  const normalized = label.trim().toLowerCase();
  const icons: Record<string, string> = {
    "contact details": "📞",
    "executive summary": "✨",
    "summary": "📌",
    "top strengths": "✅",
    "strengths": "✅",
    "areas to improve": "⚠️",
    "weaknesses": "⚠️",
    "gaps": "🧭",
    "ats score": "🏆",
    "ats keywords": "🏷️",
    "keywords": "🔑",
    "missing keywords": "🔍",
    "recommendations": "💡",
    "recommended improvements": "💡",
    "next steps": "➡️",
    "action plan": "📝",
    "career advice": "🎯",
    "learning roadmap": "📚",
    "interview readiness": "🎯",
    "final verdict": "🏁",
    "overall feedback": "📝",
    "overview": "📌",
    "feedback": "📝",
    "resume review": "📝",
  };
  return icons[normalized] || "📌";
}

function normalizeAssistantText(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/={3,}/g, "\n\n")
    .replace(/\|\|\s*/g, "\n\n")
    .replace(/([^\n])\s*(#{1,3}\s+)/g, "$1\n\n$2")
    .replace(/(#{1,3}\s*[^\n|]+?)\s*(?=\|)/g, "$1\n\n")
    .replace(/(\*\*[^\*]+\*\*)\s*(?=\*)/g, "$1\n\n")
    .replace(/([^\n])\s*(\|[^\n]*\|[^\n]*\|)/g, "$1\n$2")
    .replace(/^(#{1,3})\s*(.+)$/gm, (_, hashes, label) => {
      const trimmed = String(label).trim();
      if (/^[^\w\s]/.test(trimmed)) {
        return `${hashes} ${trimmed}`;
      }
      const icon = getHeadingIcon(trimmed);
      return `${hashes} ${icon} ${trimmed}`;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getHeadingMeta(label: string) {
  const normalized = label.trim().toLowerCase();
  const map: Record<string, { icon: React.ReactNode; pill: string }> = {
    "contact details": { icon: <User2 className="h-4 w-4" />, pill: "from-sky-500 to-blue-600" },
    "executive summary": { icon: <Sparkles className="h-4 w-4" />, pill: "from-indigo-500 to-violet-600" },
    summary: { icon: <Sparkles className="h-4 w-4" />, pill: "from-indigo-500 to-violet-600" },
    "top strengths": { icon: <CheckCircle2 className="h-4 w-4" />, pill: "from-emerald-500 to-teal-600" },
    strengths: { icon: <CheckCircle2 className="h-4 w-4" />, pill: "from-emerald-500 to-teal-600" },
    "areas to improve": { icon: <AlertCircle className="h-4 w-4" />, pill: "from-amber-500 to-orange-600" },
    weaknesses: { icon: <AlertCircle className="h-4 w-4" />, pill: "from-amber-500 to-orange-600" },
    gaps: { icon: <Clock className="h-4 w-4" />, pill: "from-orange-500 to-rose-500" },
    "ats score": { icon: <Crown className="h-4 w-4" />, pill: "from-slate-500 to-slate-700" },
    "ats keywords": { icon: <Search className="h-4 w-4" />, pill: "from-sky-500 to-cyan-600" },
    keywords: { icon: <Search className="h-4 w-4" />, pill: "from-sky-500 to-cyan-600" },
    "missing keywords": { icon: <Search className="h-4 w-4" />, pill: "from-sky-500 to-cyan-600" },
    recommendations: { icon: <FileText className="h-4 w-4" />, pill: "from-fuchsia-500 to-pink-600" },
    "recommended improvements": { icon: <FileText className="h-4 w-4" />, pill: "from-fuchsia-500 to-pink-600" },
    "career advice": { icon: <Briefcase className="h-4 w-4" />, pill: "from-violet-500 to-indigo-600" },
    "learning roadmap": { icon: <ChevronDown className="h-4 w-4" />, pill: "from-violet-500 to-fuchsia-600" },
    "interview readiness": { icon: <Sparkles className="h-4 w-4" />, pill: "from-indigo-500 to-sky-600" },
    "next steps": { icon: <ChevronDown className="h-4 w-4" />, pill: "from-violet-500 to-fuchsia-600" },
    "action plan": { icon: <Briefcase className="h-4 w-4" />, pill: "from-violet-500 to-indigo-600" },
    "final verdict": { icon: <Crown className="h-4 w-4" />, pill: "from-slate-500 to-slate-700" },
    "overall feedback": { icon: <Crown className="h-4 w-4" />, pill: "from-slate-500 to-slate-700" },
  };
  return map[normalized] ?? { icon: <Sparkles className="h-4 w-4" />, pill: "from-slate-400 to-slate-600" };
}

function MarkdownMessage({ content }: { content: string }) {
  const normalized = normalizeAssistantText(content);

  const headingMetaFor = (label: string) => {
    const key = label.trim().toLowerCase();
    const map: Record<string, { icon: React.ReactNode; pill: string }> = {
      summary: { icon: <Sparkles className="h-4 w-4" />, pill: "from-indigo-500 to-violet-600" },
      strengths: { icon: <CheckCircle2 className="h-4 w-4" />, pill: "from-emerald-500 to-teal-600" },
      weaknesses: { icon: <AlertCircle className="h-4 w-4" />, pill: "from-amber-500 to-orange-600" },
      gaps: { icon: <Clock className="h-4 w-4" />, pill: "from-orange-500 to-rose-500" },
      "ats keywords": { icon: <Search className="h-4 w-4" />, pill: "from-sky-500 to-cyan-600" },
      keywords: { icon: <Search className="h-4 w-4" />, pill: "from-sky-500 to-cyan-600" },
      recommendations: { icon: <FileText className="h-4 w-4" />, pill: "from-fuchsia-500 to-pink-600" },
      "next steps": { icon: <ChevronDown className="h-4 w-4" />, pill: "from-violet-500 to-fuchsia-600" },
      "action plan": { icon: <Briefcase className="h-4 w-4" />, pill: "from-violet-500 to-indigo-600" },
      "overall feedback": { icon: <Crown className="h-4 w-4" />, pill: "from-slate-500 to-slate-700" },
    };
    return map[key] ?? { icon: <Sparkles className="h-4 w-4" />, pill: "from-slate-400 to-slate-600" };
  };

  const headingCard = (level: 1 | 2 | 3, children: React.ReactNode) => {
    const text = String(children).replace(/\s+/g, " ").trim();
    if (!text || text.length < 2 || /^[\-??]+$/.test(text)) return null;
    const meta = headingMetaFor(text);
    if (level === 1 || level === 2) {
      return (
        <div className="my-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-slate-950/20 backdrop-blur-xl">
          <div className={`flex items-center gap-3 bg-gradient-to-r ${meta.pill} px-4 py-2.5 text-white`}>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 shadow-inner text-white">{meta.icon}</span>
            <span className={`${level === 1 ? "text-[16px] sm:text-[18px]" : "text-[15px] sm:text-[16px]"} font-semibold tracking-tight text-white`}>{children}</span>
          </div>
        </div>
      );
    }
    return (
      <h3 className="mt-5 mb-2 flex items-center gap-2 text-[15px] sm:text-[16px] font-bold tracking-tight text-white">
        <span className="text-fuchsia-300">{meta.icon}</span>
        <span className="text-white">{children}</span>
      </h3>
    );
  };

  return (
    <div className="markdown max-w-none text-white">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight, rehypeSanitize]}
        components={{
          h1: ({ children }) => headingCard(1, children),
          h2: ({ children }) => headingCard(2, children),
          h3: ({ children }) => headingCard(3, children),
          h4: ({ children }) => <h4 className="mt-4 mb-2 text-[15px] font-semibold tracking-tight text-white">{children}</h4>,
          p: ({ children }) => <p className="my-2 text-[13px] sm:text-[14px] leading-7 text-slate-100">{children}</p>,
          ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-2 text-[13px] sm:text-[14px] leading-7 text-slate-100">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-2 text-[13px] sm:text-[14px] leading-7 text-slate-100">{children}</ol>,
          li: ({ children }) => <li className="marker:text-indigo-400 text-slate-100">{children}</li>,
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950 shadow-sm">
              <table className="w-full border-collapse text-left text-[13px] sm:text-[14px] text-slate-100">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-900 text-slate-200">{children}</thead>,
          tbody: ({ children }) => <tbody className="divide-y divide-slate-800">{children}</tbody>,
          tr: ({ children }) => <tr className="align-top">{children}</tr>,
          th: ({ children }) => <th className="border-b border-slate-800 px-3 py-2 font-semibold text-slate-100">{children}</th>,
          td: ({ children }) => <td className="border-b border-slate-800 px-3 py-2 align-top text-slate-100">{children}</td>,
          blockquote: ({ children }) => <blockquote className="my-4 rounded-r-2xl border-l-4 border-indigo-400 bg-slate-900/80 px-4 py-3 italic text-slate-100">{children}</blockquote>,
          code: ({ inline, className, children, ...props }: any) => {
            if (inline) {
              return <code className="rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[12px] text-slate-100" {...props}>{children}</code>;
            }
            return <code className={className} {...props}>{children}</code>;
          },
          pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 text-[12px] leading-relaxed text-slate-100 shadow-sm">{children}</pre>,
          a: ({ children, href }) => <a href={href} className="text-indigo-300 underline decoration-indigo-400 underline-offset-4 hover:text-indigo-200">{children}</a>,
          hr: () => <hr className="my-5 border-slate-800" />,
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}

function MessageBubble({
  msg,
  isStreaming,
  onCopy,
  onRegenerate,
  onEdit,
  onFeedback,
}: {
  msg: ChatMessage;
  isStreaming?: boolean;
  onCopy: (content: string) => void;
  onRegenerate: (msg: ChatMessage) => void;
  onEdit: (msg: ChatMessage) => void;
  onFeedback: (msg: ChatMessage, feedback: "like" | "dislike") => void;
}) {
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);
  const roleMeta = msg.role === "user"
    ? { icon: <User2 className="h-3.5 w-3.5 text-white" />, label: "You", badge: "bg-fuchsia-600/10 text-white border-white/10" }
    : msg.role === "tool"
      ? { icon: <Search className="h-3.5 w-3.5 text-slate-100" />, label: "Tool", badge: "bg-slate-800/80 text-slate-100 border-slate-700/80" }
      : { icon: <Bot className="h-3.5 w-3.5 text-white" />, label: "ResuMatch", badge: "bg-slate-800/80 text-slate-100 border-white/10" };
  const agentLabel = msg.agentLabel ? msg.agentLabel.toUpperCase() : null;
  const providerLabel = msg.providerLabel ? msg.providerLabel.toUpperCase() : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div className={`
        h-10 w-10 shrink-0 rounded-3xl flex items-center justify-center shadow-lg mt-0.5 ring-1 ring-white/20
        ${isUser
          ? "bg-gradient-to-br from-fuchsia-500 via-violet-600 to-indigo-600"
          : "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700"
        }
      `}>
        {isUser
          ? <User2 className="h-4.5 w-4.5 text-white" />
          : <Sparkles className="h-4.5 w-4.5 text-white" />
        }
      </div>

      {/* Content */}
      <div className={`flex flex-col gap-1.5 max-w-[82%] sm:max-w-[76%] ${isUser ? "items-end" : "items-start"}`}>
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] ${roleMeta.badge}`}>
          {roleMeta.icon}
          <span>{roleMeta.label}</span>
          {agentLabel && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">{agentLabel}</span>}
          {providerLabel && <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px]">{providerLabel}</span>}
        </div>

        {msg.toolEvent && <ToolBadge name={msg.toolEvent} />}

        <div className={`relative overflow-hidden rounded-[26px] px-4 py-4 leading-relaxed backdrop-blur-xl border
          ${isUser
            ? "bg-gradient-to-br from-fuchsia-600 via-violet-600 to-indigo-600 text-white rounded-tr-md border-white/10 shadow-2xl shadow-fuchsia-500/20"
            : "bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.92))] border-white/10 text-slate-100 rounded-tl-md shadow-2xl shadow-slate-950/20"
          }
        `}>
          <div className={`pointer-events-none absolute inset-0 ${isUser ? "bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_42%)]" : "bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.12),transparent_38%)]"}`} />
          <div className="relative">
            {msg.content
              ? <MarkdownMessage content={msg.content} />
              : <ThinkingIndicator dark />
            }
          </div>
        </div>

        {isUser && msg.content && (
          <div className="flex items-center gap-1 px-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={async () => {
                setCopied(true);
                await onCopy(msg.content);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-white"
              title="Copy prompt"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => onEdit(msg)}
              disabled={!!isStreaming}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              title="Edit prompt"
            >
              <SquarePen className="h-3 w-3" /> Edit
            </button>
            <button
              type="button"
              onClick={() => onRegenerate(msg)}
              disabled={!!isStreaming}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              title="Regenerate response"
            >
              <RotateCw className="h-3 w-3" /> Regenerate
            </button>
          </div>
        )}

        {!isUser && msg.content && msg.role === "agent" && (
          <div className="flex items-center gap-1 px-1" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={async () => {
                setCopied(true);
                await onCopy(msg.content);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-white"
              title="Copy response"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => onFeedback(msg, "like")}
              disabled={!!isStreaming}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                msg.feedback === "like"
                  ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                  : "text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
              title="Like response"
            >
              <ThumbsUp className="h-3 w-3" /> Like
            </button>
            <button
              type="button"
              onClick={() => onFeedback(msg, "dislike")}
              disabled={!!isStreaming}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                msg.feedback === "dislike"
                  ? "bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                  : "text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
              title="Dislike response"
            >
              <ThumbsDown className="h-3 w-3" /> Dislike
            </button>
            <button
              type="button"
              onClick={() => onRegenerate(msg)}
              disabled={!!isStreaming}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              title="Regenerate response"
            >
              <RotateCw className="h-3 w-3" /> Regenerate
            </button>
          </div>
        )}

        <span className={`text-[11px] px-1 ${isUser ? "text-slate-500/80" : "text-slate-400"}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sidebar conversation list
// ──────────────────────────────────────────────────────────────────────────────
function ChatSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onLogout,
  onDelete,
  onRename,
  mobile = false,
  embedded = false,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (c: Conversation) => void;
  onNew: () => void;
  onLogout: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  mobile?: boolean;
  embedded?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const handleSave = (id: string) => {
    if (editTitle.trim()) {
      onRename(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <aside className={`${mobile ? "flex flex-col h-full w-full max-w-xs" : "hidden lg:flex flex-col w-80 h-screen sticky top-0"} border-r border-white/10 bg-[linear-gradient(180deg,rgba(8,11,22,0.98),rgba(10,14,28,0.96))] text-slate-100 shadow-2xl shadow-black/20`}>
      {/* Brand */}
      <div className="p-6 border-b border-white/10 bg-white/[0.02]">
        <Link href="/" className="flex items-center gap-3 group mb-5">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40 group-hover:scale-105 transition-transform">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-[18px] font-black tracking-tight text-slate-50">ResuMatch AI</span>
        </Link>

        <button
          id="chat-new-conversation-btn"
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-fuchsia-500 via-violet-600 to-indigo-600 hover:from-fuchsia-600 hover:via-violet-700 hover:to-indigo-700 text-white h-11 rounded-2xl text-sm font-semibold transition-all shadow-[0_18px_60px_rgba(168,85,247,0.35)] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" /> New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gradient-to-b from-white/[0.01] to-transparent">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 px-3 pt-2 pb-1">Recent</p>
        <AnimatePresence>
          {conversations.length === 0 && (
            <p className="text-sm text-slate-400 px-3 py-8 text-center leading-relaxed">No conversations yet. <br />Start a new chat above!</p>
          )}
          {conversations.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className={`
                group w-full flex items-center justify-between p-2 rounded-xl transition-all
                ${activeId === c.id
                  ? "bg-white/10 text-white shadow-xl shadow-fuchsia-500/10 border border-white/10"
                  : "hover:bg-white/5 border border-transparent"
                }
              `}
            >
              {editingId === c.id ? (
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => handleSave(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave(c.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className="flex-1 bg-white/10 text-sm text-slate-100 border border-fuchsia-400/40 rounded-xl px-2 py-1 outline-none min-w-0"
                />
              ) : (
                <>
                  <button
                    id={`chat-conversation-${c.id}`}
                    onClick={() => onSelect(c)}
                    className="flex-1 flex items-start gap-3 text-left min-w-0"
                  >
                    <MessageSquare className={`h-4 w-4 mt-0.5 shrink-0 ${activeId === c.id ? "text-white" : "text-slate-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${activeId === c.id ? "text-white" : "text-slate-100"}`}>
                        {c.title}
                      </p>
                      <p className={`text-[11px] truncate ${activeId === c.id ? "text-white/70" : "text-slate-400"}`}>
                        {new Date(c.updated_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(c.id);
                        setEditTitle(c.title);
                      }}
                      className={`p-1 rounded-lg ${activeId === c.id ? "text-white/80 hover:text-white hover:bg-white/10" : "text-slate-400 hover:text-fuchsia-300 hover:bg-white/10"}`}
                      title="Rename Chat"
                    >
                      <SquarePen className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-white/10"
                      title="Delete Conversation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Nav links + logout */}
      {!embedded && (
        <div className="p-4 border-t border-white/10 space-y-1 bg-white/[0.02]">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 rounded-xl transition-all">
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
          <button
            id="chat-logout-btn"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-rose-300 hover:bg-white/5 rounded-xl transition-all"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { user, profile, isAuthReady } = useAuth();
  const router = useRouter();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";

  const [conversations, setConversations]       = useState<Conversation[]>([]);
  const [resumeOptions, setResumeOptions]       = useState<ResumeOption[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages]                 = useState<ChatMessage[]>([]);
  const [input, setInput]                       = useState("");
  const [isStreaming, setIsStreaming]            = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingConvos, setIsLoadingConvos]   = useState(true);
  const [isSidebarOpen, setIsSidebarOpen]       = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [stopReason, setStopReason]             = useState<string | null>(null);
  const [embedded, setEmbedded]                 = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef       = useRef<AbortController | null>(null);
  const readerRef      = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  // ── Detect embedded (floating widget) mode ─────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const isEmbedded = params.get("embedded") === "1";
    log.info(`Chat rendered in ${isEmbedded ? "embedded (widget)" : "full-page"} mode`);
    setEmbedded(isEmbedded);
  }, []);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthReady) return;
    if (!user) {
      log.warn("Unauthenticated access to /chat, redirecting to /");
      router.replace("/");
    }
  }, [isAuthReady, user, router]);

  // ── Scroll to bottom ────────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleMessageScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollToBottom(distanceFromBottom > 200);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleMessageScroll, { passive: true });
    handleMessageScroll();
    return () => el.removeEventListener("scroll", handleMessageScroll);
  }, [handleMessageScroll, isLoadingHistory, messages.length]);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  // ── Fetch conversations list ─────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    log.info("Fetching conversations list");
    setIsLoadingConvos(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { log.warn("No session found when fetching conversations"); return; }

      const res = await fetch(`${backendUrl}/api/chat/conversations`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      if (res.status === 401) {
        log.warn("Fetch conversations unauthorized (401); clearing list");
        setConversations([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Conversation[] = await res.json();
      log.info(`Fetched ${data.length} conversation(s)`, data.map(c => c.id));
      setConversations(data);
    } catch (e: any) {
      log.error("Failed to fetch conversations", e);
    } finally {
      setIsLoadingConvos(false);
    }
  }, [user, backendUrl]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const fetchResumes = useCallback(async () => {
    if (!user) return;
    log.info("Fetching resume options");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { log.warn("No session found when fetching resumes"); return; }
      const res = await fetch(`${backendUrl}/api/chat/resumes`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      if (res.status === 401) { log.warn("Fetch resumes unauthorized (401)"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ResumeOption[] = await res.json();
      log.info(`Fetched ${data.length} resume option(s)`);
      setResumeOptions(data);
      if (!selectedResumeId && data.length > 0) setSelectedResumeId(data[0].id);
    } catch (e) {
      log.warn("Failed to fetch resume options", e);
    }
  }, [user, backendUrl, selectedResumeId]);

  useEffect(() => { fetchResumes(); }, [fetchResumes]);

  // ── Load message history ─────────────────────────────────────────────────────
  const loadHistory = useCallback(async (conversationId: string) => {
    log.info(`Loading history for conversation ${conversationId}`);
    setIsLoadingHistory(true);
    setMessages([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const res = await fetch(`${backendUrl}/api/chat/conversations/${conversationId}/messages`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      if (res.status === 401) {
        setError("Your session expired. Please sign in again.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ChatMessage[] = await res.json();
      log.info(`Loaded ${data.length} message(s) for ${conversationId}`);
      setMessages(data);
    } catch (e: any) {
      log.error("Failed to load message history", e);
      setError("Could not load message history.");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [backendUrl]);

  // ── Create conversation ──────────────────────────────────────────────────────
  const createConversation = useCallback(async (): Promise<Conversation | null> => {
    log.info("Creating new conversation");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const res = await fetch(`${backendUrl}/api/chat/conversations`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "New Conversation" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const conv: Conversation = await res.json();
      log.info(`Conversation created: ${conv.id}`);
      setConversations(prev => [conv, ...prev]);
      return conv;
    } catch (e: any) {
      log.error("Failed to create conversation", e);
      setError("Could not start a new conversation.");
      return null;
    }
  }, [backendUrl]);

  const handleNewChat = useCallback(async () => {
    log.info("Starting new chat");
    abortRef.current?.abort();
    setStopReason(null);
    const conv = await createConversation();
    setIsSidebarOpen(false);
    if (conv) {
      setActiveConversation(conv);
      setMessages([]);
      setError(null);
      textareaRef.current?.focus();
      log.info("New chat ready", { conversationId: conv.id });
    } else {
      log.warn("New chat could not be created");
    }
  }, [createConversation]);

  const handleSelectConversation = useCallback(async (c: Conversation) => {
    if (activeConversation?.id === c.id) {
      setIsSidebarOpen(false);
      return;
    }
    abortRef.current?.abort();
    setStopReason(null);
    log.info(`Switching to conversation: ${c.id}`);
    setActiveConversation(c);
    setError(null);
    setIsSidebarOpen(false);
    await loadHistory(c.id);
  }, [activeConversation, loadHistory]);

  // ── Streaming send ────────────────────────────────────────────────────────────
  const stopGeneration = useCallback(() => {
    log.info("Stop requested; aborting stream");
    abortRef.current?.abort();
    readerRef.current?.cancel().catch(() => undefined);
    readerRef.current = null;
    setIsStreaming(false);
    setStopReason("Response stopped.");
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m));
  }, []);

  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = String(overrideText ?? input ?? "").trim();
    if (!text) { log.debug("sendMessage ignored: empty input"); return; }
    if (isStreaming) {
      log.warn("sendMessage called while streaming; stopping stream instead");
      stopGeneration();
      return;
    }

    log.group("sendMessage");
    const clientRequestId = crypto.randomUUID();
    log.info("User input", { text, conversationId: activeConversation?.id, clientRequestId });

    setInput("");
    setError(null);

    // Ensure a conversation exists
    let conv = activeConversation;
    if (!conv) {
      conv = await createConversation();
      if (!conv) { log.groupEnd(); return; }
      setActiveConversation(conv);
    }

    // Optimistically add user message
    const tempUserId = `temp-user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: tempUserId,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    // Add placeholder agent message
    const tempAgentId = `temp-agent-${Date.now()}`;
    const agentMsg: ChatMessage = {
      id: tempAgentId,
      role: "agent",
      content: "",
      created_at: new Date().toISOString(),
      streaming: true,
    };
    setMessages(prev => [...prev, agentMsg]);

    let fullContent = "";
    let chunkCount = 0;
    setIsStreaming(true);
    ensureAudioContext(); // unlock audio on this user gesture so the completion chime can play

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No auth session");

      log.info("Opening SSE stream", { url: `${backendUrl}/api/chat/stream` });

      abortRef.current = new AbortController();
      const res = await fetch(`${backendUrl}/api/chat/stream`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ conversation_id: conv.id, message: text, selected_resume_id: selectedResumeId, client_request_id: clientRequestId }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      log.info("SSE stream connected, reading chunks…");

      const reader = res.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) { log.info(`Stream ended after ${chunkCount} chunk(s)`); break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            log.debug("SSE chunk", parsed);

            if (parsed.done) {
              log.info("Stream complete signal received");
              playCompletionChime();
              setStopReason(null);
              const dbMessageId = parsed.message_id as string | undefined;
              setMessages(prev =>
                prev.map(m =>
                  m.id === tempAgentId
                    ? { ...m, streaming: false, content: fullContent, id: dbMessageId ?? m.id }
                    : m
                )
              );
              // Refresh conversation list to update timestamp
              fetchConversations();
              break;
            }
            if (parsed.error) {
              log.error("Stream returned error", parsed.error);
              setStopReason(null);
              setError(parsed.error);
              setMessages(prev => prev.map(m => m.id === tempAgentId
                ? { ...m, streaming: false, content: "[Error: " + parsed.error + "]" }
                : m
              ));
              break;
            }
            if (parsed.tool_call) {
              log.info("Tool call intercepted", parsed.tool_call);
              setMessages(prev => prev.map(m => m.id === tempAgentId
                ? { ...m, toolEvent: parsed.tool_call }
                : m
              ));
            }
            if (parsed.tool_result) {
              log.info("Tool result received", parsed.tool_result);
              setMessages(prev => prev.map(m => m.id === tempAgentId
                ? { ...m, toolEvent: undefined }
                : m
              ));
            }
            if (parsed.processed_content) {
              // Use backend-processed content once the final response arrives.
              fullContent = parsed.processed_content;
              setMessages(prev => prev.map(m => m.id === tempAgentId
                ? { ...m, content: fullContent, toolEvent: undefined, agentLabel: parsed.agent, providerLabel: parsed.provider }
                : m
              ));
            } else if (parsed.content) {
              fullContent += parsed.content;
              chunkCount++;
              setMessages(prev => prev.map(m => m.id === tempAgentId
                ? { ...m, content: fullContent, toolEvent: undefined, agentLabel: parsed.agent, providerLabel: parsed.provider }
                : m
              ));
            }
          } catch (parseErr) {
            log.warn("Failed to parse SSE line", line);
          }
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        log.warn("Stream aborted by user");
        setStopReason("Response stopped.");
        setMessages(prev => prev.map(m => m.id === tempAgentId
          ? { ...m, streaming: false, content: fullContent || "Response stopped by user." }
          : m
        ));
      } else {
        log.error("Streaming error", e);
        setError(e.message || "Something went wrong. Please try again.");
        setMessages(prev => prev.map(m => m.id === tempAgentId
          ? { ...m, streaming: false, content: "" }
          : m
        ));
      }
    } finally {
      readerRef.current = null;
      log.groupEnd();
      setIsStreaming(false);
    }
  }, [input, isStreaming, activeConversation, backendUrl, createConversation, fetchConversations, stopGeneration]);

  // ── Keyboard shortcut ─────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Per-user-message actions (copy / regenerate / edit) ─────────────────────
  const handleCopyMessage = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      log.info("Copied user message to clipboard", { chars: content.length });
    } catch (e: any) {
      log.error("Failed to copy user message", e);
    }
  }, []);

  const handleRegenerate = useCallback((userMsg: ChatMessage) => {
    if (isStreaming) {
      log.warn("Regenerate ignored while streaming");
      return;
    }
    log.info(`Regenerating response for user message: ${userMsg.id}`);
    const idx = messages.findIndex(m => m.id === userMsg.id);
    setMessages(prev => (idx >= 0 ? prev.slice(0, idx) : prev));
    setError(null);
    sendMessage(userMsg.content);
  }, [isStreaming, messages, sendMessage]);

  const handleEditUserMessage = useCallback((userMsg: ChatMessage) => {
    log.info(`Editing user message: ${userMsg.id}`);
    const idx = messages.findIndex(m => m.id === userMsg.id);
    setMessages(prev => (idx >= 0 ? prev.slice(0, idx) : prev));
    setInput(userMsg.content);
    setError(null);
    textareaRef.current?.focus();
  }, [messages]);

  // ── Per-response feedback (like / dislike) ──────────────────────────────────
  const handleFeedback = useCallback(async (msg: ChatMessage, feedback: "like" | "dislike") => {
    if (isStreaming || !msg.id) {
      log.warn("Feedback ignored (streaming or missing message id)");
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No auth session");
      log.info(`Recording feedback on message ${msg.id}: ${feedback}`);

      const togglingOff = msg.feedback === feedback;
      const url = togglingOff
        ? `${backendUrl}/api/chat/feedback/${msg.id}`
        : `${backendUrl}/api/chat/feedback`;

      const res = await fetch(url, {
        method: togglingOff ? "DELETE" : "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: togglingOff ? undefined : JSON.stringify({ message_id: msg.id, feedback }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      setMessages(prev =>
        prev.map(m => m.id === msg.id ? { ...m, feedback: togglingOff ? undefined : feedback } : m)
      );
      log.info(`Feedback ${togglingOff ? "removed" : "recorded"}: ${feedback}`);
    } catch (e: any) {
      log.error("Failed to record feedback", e);
      setError(e.message || "Could not record your feedback. Please try again.");
    }
  }, [isStreaming, backendUrl]);

  // ── Auto-resize textarea ───────────────────────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  const handleLogout = async () => {
    log.info("User initiated logout");
    abortRef.current?.abort();
    await supabase.auth.signOut();
    router.replace("/");
  };

  const handleDeleteConversation = async (conversationId: string) => {
    log.info(`Deleting conversation: ${conversationId}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const res = await fetch(`${backendUrl}/api/chat/conversations/${conversationId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      log.info(`Successfully deleted conversation: ${conversationId}`);
      setConversations(prev => prev.filter(c => c.id !== conversationId));
      if (activeConversation?.id === conversationId) {
        setActiveConversation(null);
        setMessages([]);
      }
    } catch (e: any) {
      log.error("Failed to delete conversation", e);
      setError("Could not delete conversation.");
    }
  };

  const handleRenameConversation = async (conversationId: string, newTitle: string) => {
    log.info(`Renaming conversation: ${conversationId} to: ${newTitle}`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");

      const res = await fetch(`${backendUrl}/api/chat/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      log.info(`Successfully renamed conversation: ${conversationId}`);
      setConversations(prev =>
        prev.map(c => c.id === conversationId ? { ...c, title: newTitle } : c)
      );
      if (activeConversation?.id === conversationId) {
        setActiveConversation(prev => prev ? { ...prev, title: newTitle } : null);
      }
    } catch (e: any) {
      log.error("Failed to rename conversation", e);
      setError("Could not rename conversation.");
    }
  };

  const getSuggestionsForLastMessage = () => {
    if (messages.length === 0 || isStreaming) return [];
    
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "agent") return [];

    const text = lastMsg.content.toLowerCase();
    
    if (text.includes("cover letter")) {
      return [
        { label: "✍️ Make tone more professional", prompt: "Make the tone of this cover letter more professional." },
        { label: "🎯 Adapt for startup role", prompt: "Adapt this cover letter for a startup/early-stage company." },
        { label: "💡 Show me formatting tips", prompt: "Give me formatting tips to make this cover letter stand out." }
      ];
    }
    if (text.includes("resume") || text.includes("feedback") || text.includes("analyze")) {
      return [
        { label: "🛠️ Rewrite last experience bullet", prompt: "Help me rewrite the first bullet point of my most recent job experience to make it more action-oriented." },
        { label: "📊 Find key ATS keywords to add", prompt: "What are the top 5 ATS keywords I should add to my resume?" },
        { label: "💡 Identify skills I should learn", prompt: "Based on my resume, what are the most critical skills I should learn next?" }
      ];
    }
    if (text.includes("job") || text.includes("sde") || text.includes("software")) {
      return [
        { label: "💼 Show remote jobs only", prompt: "Filter these jobs to show only remote positions." },
        { label: "📈 Tell me SDE2 salary ranges", prompt: "What are the average salary ranges for SDE2 positions in India?" },
        { label: "🔍 Show SDE positions in Bangalore", prompt: "Find me SDE2 jobs in Bangalore." }
      ];
    }
    
    return [
      { label: "🔍 Search matching jobs", prompt: "Can you search for jobs that match my parsed resume?" },
      { label: "🛠️ Audit my resume", prompt: "Auditing my resume: tell me my contact details, skills, and experience ATS scores." },
      { label: "✍️ Draft a general cover letter", prompt: "Can you help me write a general cover letter for a Software Engineer role?" }
    ];
  };

  // ──────────────────────────────────────────────────────────────────────────────
  if (!isAuthReady) {
    return (
      <LoadingScreen dark label="Preparing your assistant…" sublabel="Loading your profile, resumes & conversations" />
    );
  }

  const isEmpty = messages.length === 0 && !isLoadingHistory;

  return (
    <div className="flex h-screen overflow-hidden bg-[#050816] text-slate-100">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <ChatSidebar
        conversations={conversations}
        activeId={activeConversation?.id ?? null}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onLogout={handleLogout}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        embedded={embedded}
      />

      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex bg-slate-950/90 backdrop-blur-sm lg:hidden">
          <div className="relative flex h-full w-full max-w-xs flex-col overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,rgba(8,11,22,0.98),rgba(10,14,28,0.96))] text-slate-100 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-slate-950/95">
              <div className="flex items-center gap-2 text-white">
                <Sparkles className="h-5 w-5" />
                <span className="text-sm font-semibold">Conversations</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white"
                aria-label="Close conversations"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ChatSidebar
                mobile
                conversations={conversations}
                activeId={activeConversation?.id ?? null}
                onSelect={handleSelectConversation}
                onNew={handleNewChat}
                onLogout={handleLogout}
                onDelete={handleDeleteConversation}
                onRename={handleRenameConversation}
                embedded={embedded}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="flex-1 bg-transparent"
            aria-label="Close overlay"
          />
        </div>
      )}

      {/* ── Main chat area ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 relative bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.10),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_24%),linear-gradient(180deg,#0b1020_0%,#080b16_55%,#050816_100%)]">
        {/* Header */}
        <header className="shrink-0 h-16 flex items-center justify-between px-4 lg:px-6 border-b border-white/10 bg-slate-950/55 backdrop-blur-2xl z-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden shrink-0 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10"
            >
              <Menu className="h-4 w-4" />
              <span className="hidden sm:inline">Chats</span>
            </button>

            {!embedded && (
              <Link href="/" className="lg:hidden flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-bold text-[var(--text-primary)]">ResuMatch</span>
              </Link>
            )}

            {activeConversation && (
              <div className="hidden lg:flex items-center gap-2 text-sm text-slate-200/80">
                <MessageSquare className="h-4 w-4" />
                <span className="font-medium truncate max-w-[280px]">{activeConversation.title}</span>
              </div>
            )}
          </div>

<div className="flex items-center gap-1.5 sm:gap-2">
              {resumeOptions.length > 0 && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 text-xs text-slate-100 shadow-lg shadow-black/10 backdrop-blur-xl">
                <FileText className="h-3.5 w-3.5 text-indigo-500" />
                <select
                  value={selectedResumeId || ""}
                  onChange={(e) => setSelectedResumeId(e.target.value || null)}
                  className="bg-transparent outline-none text-sm font-medium text-slate-100 max-w-[260px]"
                >
                  {resumeOptions.map((resume) => (
                    <option key={resume.id} value={resume.id}>
                      {resume.title || `Resume ${resume.id.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </div>
            )}
            {profile && (
              <div className="hidden sm:flex shrink-0 items-center gap-2 text-sm text-[var(--text-muted)]">
                {profile.plan !== "free" && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-xs font-semibold border border-amber-200 dark:border-amber-700/50">
                    <Crown className="h-3 w-3" /> Pro
                  </span>
                )}
                <span className="hidden lg:inline max-w-[140px] truncate">{profile.fullName || profile.email}</span>
              </div>
            )}
            <button
              id="chat-header-new-btn"
              onClick={handleNewChat}
              className="shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-100 border border-white/15 bg-white/5 hover:bg-white/10 hover:border-fuchsia-400/40 rounded-2xl transition-all backdrop-blur-xl active:scale-[0.97]"
            >
              <SquarePen className="h-3.5 w-3.5" /> New
            </button>
          </div>
        </header>

        {/* Message area */}
        <div ref={scrollContainerRef} onScroll={handleMessageScroll} className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.02),transparent_32%)]">
          {isLoadingHistory ? (
            <LoadingScreen dark compact label="Loading conversation…" />
          ) : isEmpty ? (
            /* Welcome / empty state */
            <div className="flex flex-col items-center justify-center h-full px-4 py-16 text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: "backOut" }}
                className="h-24 w-24 rounded-[28px] bg-[linear-gradient(135deg,#ff4fd8_0%,#8b5cf6_52%,#2563eb_100%)] flex items-center justify-center shadow-[0_24px_80px_rgba(139,92,246,0.35)] mb-6 ring-1 ring-white/20"
              >
                <Sparkles className="h-10 w-10 text-white" />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-2xl font-bold text-slate-50 mb-2"
              >
                Your AI Career Assistant
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-slate-300 max-w-md mb-8 leading-relaxed"
              >
                Ask me anything about jobs, resume feedback, skill gaps, or career strategy. I can also search live job listings for you.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl"
              >
                {SUGGESTED_PROMPTS.map((s, i) => (
                  <button
                    key={i}
                    id={`chat-suggest-${i}`}
                    onClick={() => { setInput(s.label); textareaRef.current?.focus(); }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-[22px] text-sm font-medium border bg-gradient-to-r ${s.color} text-left hover:scale-[1.02] active:scale-[0.99] transition-transform shadow-lg shadow-black/10 backdrop-blur-xl`}
                  >
                    {s.icon} {s.label}
                  </button>
                ))}
              </motion.div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
              <AnimatePresence initial={false}>
                {messages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isStreaming={isStreaming}
                    onCopy={handleCopyMessage}
                    onRegenerate={handleRegenerate}
                    onEdit={handleEditUserMessage}
                    onFeedback={handleFeedback}
                  />
                ))}
              </AnimatePresence>

              {/* Dynamic Follow-up Suggestions */}
              {!isStreaming && messages.length > 0 && messages[messages.length - 1].role === "agent" && (
                <div className="flex flex-wrap gap-2 pt-2 pb-4">
                  {getSuggestionsForLastMessage().map((s, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setInput(s.prompt);
                        textareaRef.current?.focus();
                      }}
                      className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-slate-100 hover:border-fuchsia-400/40 hover:text-white hover:bg-white/15 text-xs font-semibold transition-all shadow-lg shadow-black/10 backdrop-blur-xl active:scale-[0.98]"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Error state */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-400/20 text-rose-100 text-sm backdrop-blur-xl"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-xs underline">Dismiss</button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Jump to bottom (floating) ─────────────────────────────────────── */}
        <AnimatePresence>
          {showScrollToBottom && !isEmpty && (
            <motion.button
              id="chat-scroll-to-bottom-btn"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={scrollToBottom}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full border border-white/15 bg-slate-900/80 text-slate-100 text-xs font-semibold shadow-2xl shadow-black/40 backdrop-blur-xl hover:bg-slate-800 hover:border-fuchsia-400/40 active:scale-95 transition-all"
              aria-label="Scroll to bottom"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Jump to latest
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Input bar ────────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-white/10 bg-black/35 backdrop-blur-2xl px-3 lg:px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className={`
              flex items-end gap-3 rounded-[28px] border px-4 py-1 transition-all shadow-2xl
              ${isStreaming
                ? "border-fuchsia-400/30 shadow-[0_0_0_1px_rgba(236,72,153,0.18),0_22px_80px_rgba(168,85,247,0.18)]"
                : "border-white/10 focus-within:border-fuchsia-400/40 focus-within:shadow-[0_0_0_1px_rgba(236,72,153,0.12),0_18px_70px_rgba(15,23,42,0.35)]"
              }
              bg-[rgba(255,255,255,0.04)]
            `}>
              <textarea
                ref={textareaRef}
                id="chat-message-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isStreaming ? "AI is responding…" : "Ask about jobs, resume feedback, career strategy…"}
                disabled={isStreaming}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder:text-slate-400 outline-none max-h-28 leading-relaxed disabled:opacity-50"
              />

              <button
                id="chat-send-btn"
                onClick={isStreaming ? stopGeneration : () => sendMessage()}
                disabled={!input.trim() && !isStreaming}
                className={`
                  shrink-0 h-11 min-w-11 px-4 rounded-2xl flex items-center justify-center gap-1.5 transition-all text-xs font-semibold
                  ${isStreaming
                    ? "bg-gradient-to-br from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 shadow-lg shadow-rose-500/25 text-white"
                    : input.trim()
                      ? "bg-gradient-to-br from-fuchsia-500 via-violet-600 to-indigo-600 hover:from-fuchsia-600 hover:via-violet-700 hover:to-indigo-700 shadow-lg shadow-fuchsia-500/25 active:scale-95 text-white"
                      : "bg-white/8 text-slate-500 cursor-not-allowed"
                  }
                `}
              >
                {isStreaming
                  ? <><Square className="h-3.5 w-3.5" /> Stop</>
                  : <><Send className="h-4 w-4" /> Send</>
                }
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
