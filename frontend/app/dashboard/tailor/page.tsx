"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LoadingScreen } from "@/components/ui/loading";
import {
  ChevronLeft,
  FileText,
  Link as LinkIcon,
  Loader2,
  Wand2,
  Sparkles,
  Trash2,
  Download,
  ExternalLink,
  History,
  RefreshCw,
  Type,
  ChevronDown,
  GitCompare,
  CheckCircle2,
  Target,
  Lightbulb,
  ArrowUpRight,
  Clock,
  TrendingUp,
  PenLine,
  Database,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

const REASON_LABELS: Record<string, string> = {
  keyword_match: "Keyword match",
  clarity: "Improved clarity",
  quantification: "Quantified impact",
  reorder: "Reordered for impact",
  emphasis: "Emphasized achievement",
};

function formatReasonCode(code: string): string {
  return REASON_LABELS[code.trim().toLowerCase()] ?? code.trim();
}

function flattenChangeReasons(reasons: (string | null | undefined)[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  (reasons || []).forEach((r) => {
    if (!r) return;
    String(r)
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => {
        if (!seen.has(s.toLowerCase())) {
          seen.add(s.toLowerCase());
          out.push(s);
        }
      });
  });
  return out;
}

interface TailorResult {
  version_id?: string | null;
  resume_id?: string | null;
  version_number?: number;
  created_at?: string | null;
  diff?: any;
  change_reasons?: string[];
  match_score_before?: number;
  match_score_after?: number;
  cached?: boolean;
  tailored_data?: any;
  jd_required_skills?: string[];
  suggested_skills?: string[];
}

interface VersionRecord {
  version_id: string;
  resume_id: string | null;
  version_number: number;
  created_at: string | null;
  change_reasons?: string[];
  diff_summary?: {
    summary_changed?: boolean;
    summary?: { removed?: string; added?: string };
    skills_added?: number;
    skills_removed?: number;
    bullets_changed?: number;
  };
}

interface Improvement {
  tone: "emerald" | "rose" | "violet" | "amber" | "slate";
  text: string;
}

function buildImprovements(diff: any): Improvement[] {
  const items: Improvement[] = [];
  const summary = diff?.summary;
  const skills = diff?.skills || {};
  const experience = diff?.experience || [];
  const bullets = experience.reduce((n: number, e: any) => n + (e.bullet_changes?.length ?? 0), 0);
  const added = skills.added || [];
  const removed = skills.removed || [];

  if (summary && (summary.removed || summary.added)) {
    items.push({ tone: "amber", text: "Rewrote your professional summary to better match this role." });
  }
  if (added.length > 0) {
    items.push({
      tone: "emerald",
      text: `Added ${added.length} keyword${added.length > 1 ? "s" : ""} aligned with the job description.`,
    });
  }
  if (removed.length > 0) {
    items.push({
      tone: "rose",
      text: `Removed ${removed.length} skill${removed.length > 1 ? "s" : ""} that didn't align with the role.`,
    });
  }
  if (bullets > 0) {
    items.push({
      tone: "violet",
      text: `Rewrote ${bullets} experience bullet${bullets > 1 ? "s" : ""} to emphasize impact and keywords.`,
    });
  }
  if (items.length === 0) {
    items.push({ tone: "slate", text: "No significant changes detected for this version." });
  }
  return items;
}

const IMPROVEMENT_STYLES: Record<Improvement["tone"], { chip: string; dot: string }> = {
  emerald: { chip: "bg-emerald-50 text-emerald-700 border-emerald-100", dot: "bg-emerald-500" },
  rose: { chip: "bg-rose-50 text-rose-700 border-rose-100", dot: "bg-rose-500" },
  violet: { chip: "bg-violet-50 text-violet-700 border-violet-100", dot: "bg-violet-500" },
  amber: { chip: "bg-amber-50 text-amber-700 border-amber-100", dot: "bg-amber-500" },
  slate: { chip: "bg-slate-50 text-slate-600 border-slate-100", dot: "bg-slate-400" },
};

/* ── JD skill coverage helpers ───────────────────────────────────────────── */

function normalizeSkill(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#.\-]/g, "");
}

function getResumeCorpus(data: any): string {
  const parts: string[] = [];
  if (data?.summary) parts.push(String(data.summary));
  (data?.skills || []).forEach((s: any) => parts.push(String(s)));
  (data?.experience || []).forEach((e: any) => {
    parts.push(String(e.title || ""));
    parts.push(String(e.company || ""));
    (e.description || e.bullets || []).forEach((b: any) =>
      parts.push(typeof b === "string" ? b : String(b.text || "")),
    );
  });
  (data?.education || []).forEach((e: any) => {
    parts.push(String(e.degree || ""));
    parts.push(String(e.institution || ""));
  });
  (data?.projects || []).forEach((p: any) =>
    parts.push(`${String(p.title || "")} ${String(p.description || "")}`),
  );
  (data?.certifications || []).forEach((c: any) => parts.push(String(c.name || "")));
  (data?.achievements || []).forEach((a: any) =>
    parts.push(`${String(a.title || "")} ${String(a.description || "")}`),
  );
  return parts.join(" ").toLowerCase();
}

function skillTokens(skill: string): string[] {
  return skill.toLowerCase().split(/[^a-z0-9+#.\-]+/).filter(Boolean);
}

function analyzeJdSkills(
  jdSkills: string[],
  data: any,
): { skill: string; status: "skills" | "covered" | "missing" }[] {
  if (!jdSkills || !jdSkills.length || !data) return [];
  const skillLabels = (data.skills || []).map((s: any) => normalizeSkill(String(s))).filter(Boolean);
  const corpus = getResumeCorpus(data);

  return jdSkills.map((raw) => {
    const skill = String(raw || "").trim();
    const norm = normalizeSkill(skill);
    if (!norm) return { skill, status: "missing" };
    const inSkills = skillLabels.some((l) => l === norm || l.includes(norm) || norm.includes(l));
    if (inSkills) return { skill, status: "skills" };
    const tokens = skillTokens(skill);
    const inText = tokens.length > 0 && tokens.every((t) => corpus.includes(t));
    return inText ? { skill, status: "covered" } : { skill, status: "missing" };
  });
}

/* ── Tailored resume preview ─────────────────────────────────────────────── */

function getEntryBullets(entry: any): string[] {
  const raw = entry?.bullets || entry?.description || [];
  return raw
    .map((b: any) => (typeof b === "string" ? b : String(b?.text || "")))
    .map((b: string) => b.trim())
    .filter(Boolean);
}

function ResumePreview({ data, jdSkills }: { data: any; jdSkills: string[] }) {
  const jdNorm = jdSkills.map(normalizeSkill).filter(Boolean);
  const isJdSkill = (s: any) => {
    const n = normalizeSkill(String(s));
    return jdNorm.some((jd) => n === jd || n.includes(jd) || jd.includes(n));
  };

  const name = data.fullName || data.full_name || data.targetRole || "Tailored Resume";
  const skills = data.skills || [];
  const experience = (data.experience || []).filter((e: any) => e?.title);
  const education = (data.education || []).filter((e: any) => e?.degree);
  const projects = (data.projects || []).filter((p: any) => p?.title);
  const certifications = data.certifications || [];
  const achievements = data.achievements || [];
  const languages = data.languages || [];

  return (
    <div className="border-t border-slate-100 bg-slate-50/50 p-4 md:p-6">
      <div className="rounded-xl bg-white shadow-inner ring-1 ring-slate-100 overflow-hidden font-sans">
        <div className="h-1.5 bg-gradient-to-r from-indigo-600 to-violet-600" />
        <div className="p-5 md:p-7">
          {/* Header */}
          <h3 className="text-lg md:text-2xl font-black text-slate-900 uppercase tracking-tight leading-tight">
            {name}
          </h3>
          {(data.email || data.phone) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {data.email && <span>{data.email}</span>}
              {data.phone && <span>{data.phone}</span>}
            </div>
          )}
          <div className="mt-3 h-px w-16 bg-indigo-100" />

          {/* Summary */}
          {data.summary && (
            <div className="mt-4">
              <PreviewSectionTitle>Professional Summary</PreviewSectionTitle>
              <p className="mt-1 text-xs md:text-[13px] leading-relaxed text-slate-600">{data.summary}</p>
            </div>
          )}

          {/* Skills — JD matched highlighted */}
          {skills.length > 0 && (
            <div className="mt-4">
              <PreviewSectionTitle>Skills</PreviewSectionTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.map((s: any, i: number) => {
                  const matched = isJdSkill(s);
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] md:text-[11px] font-bold border ${
                        matched
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-slate-100 bg-slate-50 text-slate-700"
                      }`}
                    >
                      {s}
                      {matched && (
                        <span className="rounded bg-emerald-500 px-1 py-px text-[7px] font-black uppercase tracking-wider text-white">
                          JD
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-slate-400 italic">
                Green skills with a <span className="rounded bg-emerald-500 px-1 py-px text-[7px] font-black uppercase tracking-wider text-white">JD</span> tag
                are keywords this job description asks for — now placed in your skills section.
              </p>
            </div>
          )}

          {/* Experience */}
          {experience.length > 0 && (
            <div className="mt-4">
              <PreviewSectionTitle>Experience</PreviewSectionTitle>
              <div className="mt-2 space-y-4">
                {experience.map((exp: any, i: number) => (
                  <div key={i}>
                    <div className="flex flex-wrap items-baseline justify-between gap-1">
                      <div>
                        <div className="text-xs md:text-sm font-extrabold text-slate-900">{exp.title}</div>
                        {exp.company && (
                          <div className="text-[10px] md:text-[11px] font-bold text-indigo-500 uppercase tracking-wider">
                            {exp.company}
                          </div>
                        )}
                      </div>
                      {exp.duration && (
                        <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
                          {exp.duration}
                        </span>
                      )}
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {getEntryBullets(exp).map((b, bi) => (
                        <li key={bi} className="flex gap-2 text-xs leading-relaxed text-slate-600">
                          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-indigo-300" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Education */}
          {education.length > 0 && (
            <div className="mt-4">
              <PreviewSectionTitle>Education</PreviewSectionTitle>
              <div className="mt-2 space-y-1.5">
                {education.map((edu: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-baseline justify-between gap-1">
                    <div className="text-xs font-bold text-slate-800">
                      {edu.degree}
                      {edu.institution && <span className="text-slate-400"> · {edu.institution}</span>}
                    </div>
                    {edu.year && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{edu.year}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {projects.length > 0 && (
            <div className="mt-4">
              <PreviewSectionTitle>Projects</PreviewSectionTitle>
              <div className="mt-2 space-y-1.5">
                {projects.map((p: any, i: number) => (
                  <div key={i}>
                    <div className="text-xs font-bold text-slate-800">{p.title}</div>
                    {p.description && (
                      <p className="text-[11px] leading-relaxed text-slate-600">{p.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certifications */}
          {certifications.length > 0 && (
            <div className="mt-4">
              <PreviewSectionTitle>Certifications</PreviewSectionTitle>
              <div className="mt-2 space-y-1">
                {certifications.map((c: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="text-xs font-bold text-slate-800">{c.name}</span>
                    {c.year && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{c.year}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Achievements */}
          {achievements.length > 0 && (
            <div className="mt-4">
              <PreviewSectionTitle>Highlights</PreviewSectionTitle>
              <div className="mt-2 space-y-1.5">
                {achievements.map((a: any, i: number) => (
                  <div key={i}>
                    <div className="text-xs font-bold text-slate-800">{a.title}</div>
                    {a.description && (
                      <p className="text-[11px] leading-relaxed text-slate-600">{a.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Languages */}
          {languages.length > 0 && (
            <div className="mt-4">
              <PreviewSectionTitle>Languages</PreviewSectionTitle>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {languages.map((l: any, i: number) => (
                  <span key={i} className="text-xs font-bold text-slate-800">
                    {l.language}
                    {l.proficiency && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">
                        {" "}
                        · {l.proficiency}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-[10px] text-slate-400">
        This is a preview of the tailored resume document — download the PDF or DOCX for the final, ATS-formatted file.
      </p>
    </div>
  );
}

function PreviewSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">{children}</h4>
      <div className="h-px flex-1 bg-indigo-50" />
    </div>
  );
}

/* ── PDF generation ──────────────────────────────────────────────────────── */

function cleanVal(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") return bulletText(v as any);
  return String(v).trim();
}

function cleanArr<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function bulletText(b: any): string {
  if (typeof b === "string") return b;
  if (b && typeof b === "object") return cleanVal(b.text ?? b.value ?? b.content);
  return "";
}

function entryBullets(entry: any): string[] {
  const raw = entry?.bullets || entry?.description || [];
  return cleanArr(raw)
    .map(bulletText)
    .map((b) => b.trim())
    .filter(Boolean);
}

function downloadResumePdf(data: any, filename?: string) {
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  type PdfSettings = {
    mx: number; my: number; bar: number; barGap: number;
    name: number; contact: number; headerAfter: number;
    section: number; ruleGap: number;
    body: number; gap: number; sectionPad: number;
    head: number; headLine: number; company: number; companyGap: number; itemPad: number;
    bullet: number; bulletGap: number;
  };

  const layouts: Record<"normal" | "compact", PdfSettings> = {
    normal: {
      mx: 18, my: 16, bar: 3.5, barGap: 8,
      name: 20, contact: 9, headerAfter: 6,
      section: 10.5, ruleGap: 5,
      body: 10, gap: 1.8, sectionPad: 4,
      head: 11, headLine: 0.5, company: 9.5, companyGap: 4.5, itemPad: 2.5,
      bullet: 9.5, bulletGap: 4,
    },
    compact: {
      mx: 14, my: 11, bar: 2.5, barGap: 6,
      name: 16, contact: 8, headerAfter: 4.5,
      section: 9.5, ruleGap: 4,
      body: 8.5, gap: 1.4, sectionPad: 2.5,
      head: 10, headLine: 0.3, company: 8.5, companyGap: 3.6, itemPad: 1.8,
      bullet: 8.5, bulletGap: 3.4,
    },
  };

  // Renders the whole resume into `doc`. When `paint` is false it only simulates
  // layout (identical math, no drawing) so we can measure page count.
  const renderLayout = (doc: typeof pdf, st: PdfSettings, paint: boolean) => {
    const contentW = pageW - st.mx * 2;
    let y = st.my;
    let pages = 1;

    const ensure = (needed: number, keepAfter = 0) => {
      if (y + needed + keepAfter > pageH - st.my) {
        pages += 1;
        y = st.my;
        if (paint) doc.addPage();
      }
    };

    const wrap = (text: string, size: number, width = contentW): string[] => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      return doc.splitTextToSize(text, width) as string[];
    };

    const draw = (
      lines: string | string[],
      size: number,
      color: [number, number, number],
      style: "normal" | "bold" | "italic",
      lineGap: number,
      indent = 0,
    ) => {
      if (paint) {
        doc.setFont("helvetica", style);
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
      }
      const arr = Array.isArray(lines) ? lines : [lines];
      arr.forEach((ln) => {
        ensure(size * 0.35 + lineGap);
        if (paint) doc.text(ln, st.mx + indent, y);
        y += size * 0.35 + lineGap;
      });
    };

    const sectionTitle = (title: string) => {
      ensure(10, 16);
      if (paint) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(st.section);
        doc.setTextColor(79, 70, 229);
        doc.text(title.toUpperCase(), st.mx, y);
      }
      y += 1.4;
      if (paint) {
        doc.setDrawColor(225, 228, 232);
        doc.line(st.mx, y, pageW - st.mx, y);
      }
      y += st.ruleGap;
    };

    const bullets = (items: string[]) => {
      items.forEach((b) => {
        const lines = wrap(b, st.bullet, contentW - 6);
        const h = lines.length * st.bulletGap;
        ensure(h + 1);
        lines.forEach((ln, li) => {
          if (paint) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(st.bullet);
            doc.setTextColor(71, 85, 105);
            if (li === 0) doc.text("•", st.mx + 1, y);
            doc.text(ln, st.mx + 5, y);
          }
          y += st.bulletGap;
        });
      });
    };

    // Accent bar
    if (paint) {
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageW, st.bar, "F");
    }
    y = st.my + st.bar + st.barGap;

    // Header (only non-empty values)
    const name = cleanVal(data.fullName || data.full_name);
    if (name) {
      ensure(12);
      draw(name.toUpperCase(), st.name, [15, 23, 42], "bold", 2);
      y += 3;
    }
    const contacts = [cleanVal(data.email), cleanVal(data.phone)].filter(Boolean);
    if (contacts.length) {
      ensure(8);
      draw(contacts.join("   •   "), st.contact, [100, 116, 139], "bold", 2);
      y += 2;
    }
    if (paint) {
      doc.setDrawColor(241, 245, 249);
      doc.line(st.mx, y, pageW - st.mx, y);
    }
    y += st.headerAfter;

    const summary = cleanVal(data.summary);
    if (summary) {
      sectionTitle("Professional Summary");
      draw(wrap(summary, st.body), st.body, [71, 85, 105], "normal", st.gap);
      y += st.sectionPad;
    }

    const skills = cleanArr(data.skills).map(cleanVal).filter(Boolean);
    if (skills.length) {
      sectionTitle("Skills");
      draw(wrap(skills.join("  •  "), st.body), st.body, [71, 85, 105], "normal", st.gap);
      y += st.sectionPad;
    }

    const experience = cleanArr(data.experience).filter((e: any) => cleanVal(e?.title) || cleanVal(e?.company));
    if (experience.length) {
      sectionTitle("Experience");
      experience.forEach((exp: any) => {
        const title = cleanVal(exp.title);
        const company = cleanVal(exp.company);
        const duration = cleanVal(exp.duration);
        const blist = entryBullets(exp);
        const firstBulletH = blist.length ? Math.max(1, wrap(blist[0], st.bullet, contentW - 6).length) * st.bulletGap : 6;
        ensure(10, Math.min(firstBulletH + 4, 18));
        if (title) {
          draw(title, st.head, [15, 23, 42], "bold", st.headLine);
          y += st.itemPad;
        }
        if (company || duration) {
          ensure(8);
          if (paint) {
            if (company) {
              doc.setFont("helvetica", "italic");
              doc.setFontSize(st.company);
              doc.setTextColor(99, 102, 241);
              doc.text(company, st.mx, y);
            }
            if (duration) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(st.company);
              doc.setTextColor(100, 116, 139);
              doc.text(duration, pageW - st.mx, y, { align: "right" });
            }
          }
          y += st.companyGap;
        }
        bullets(blist);
        y += st.itemPad;
      });
      y += 2;
    }

    const education = cleanArr(data.education).filter((e: any) => cleanVal(e?.degree));
    if (education.length) {
      sectionTitle("Education");
      education.forEach((edu: any) => {
        const degree = cleanVal(edu.degree);
        const institution = cleanVal(edu.institution);
        const year = cleanVal(edu.year);
        ensure(8, 6);
        if (degree) draw(degree, st.head - 0.5, [15, 23, 42], "bold", st.headLine);
        if (institution || year) {
          ensure(8);
          if (paint) {
            if (institution) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(st.body);
              doc.setTextColor(71, 85, 105);
              doc.text(institution, st.mx, y);
            }
            if (year) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(st.body - 0.5);
              doc.setTextColor(100, 116, 139);
              doc.text(year, pageW - st.mx, y, { align: "right" });
            }
          }
          y += st.companyGap;
        }
        y += 1.5;
      });
      y += 2;
    }

    const projects = cleanArr(data.projects).filter((p: any) => cleanVal(p?.title));
    if (projects.length) {
      sectionTitle("Projects");
      projects.forEach((proj: any) => {
        const title = cleanVal(proj.title);
        const desc = cleanVal(proj.description);
        ensure(9, 8);
        if (title) {
          draw(title, st.head - 0.5, [15, 23, 42], "bold", st.headLine);
          y += st.itemPad;
        }
        if (desc) {
          draw(wrap(desc, st.body), st.body, [71, 85, 105], "normal", st.gap);
          y += 2;
        }
        y += 2;
      });
      y += 2;
    }

    const certifications = cleanArr(data.certifications).filter((c: any) => cleanVal(c?.name));
    if (certifications.length) {
      sectionTitle("Certifications");
      certifications.forEach((cert: any) => {
        const cname = cleanVal(cert.name);
        const year = cleanVal(cert.year);
        ensure(8);
        if (cname) {
          draw(cname, st.head - 0.5, [15, 23, 42], "bold", st.headLine);
          if (year) {
            if (paint) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(st.body - 0.5);
              doc.setTextColor(100, 116, 139);
              doc.text(year, pageW - st.mx, y, { align: "right" });
            }
            y += 2;
          }
          y += 1.5;
        }
      });
      y += 2;
    }

    const achievements = cleanArr(data.achievements).filter((a: any) => cleanVal(a?.title) || cleanVal(a?.description));
    if (achievements.length) {
      sectionTitle("Highlights");
      achievements.forEach((ach: any) => {
        const title = cleanVal(ach.title);
        const desc = cleanVal(ach.description);
        ensure(9, 8);
        if (title) {
          draw(title, st.head - 0.5, [15, 23, 42], "bold", st.headLine);
          y += st.itemPad;
        }
        if (desc) {
          draw(wrap(desc, st.body), st.body, [71, 85, 105], "normal", st.gap);
          y += 2;
        }
        y += 1.5;
      });
      y += 2;
    }

    const languages = cleanArr(data.languages).filter((l: any) => cleanVal(l?.language));
    if (languages.length) {
      sectionTitle("Languages");
      languages.forEach((lang: any) => {
        const lname = cleanVal(lang.language);
        const prof = cleanVal(lang.proficiency);
        ensure(8);
        draw(lname, st.head - 0.5, [15, 23, 42], "bold", st.headLine);
        if (prof) {
          if (paint) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(st.body - 0.5);
            doc.setTextColor(79, 70, 229);
            doc.text(`• ${prof}`, pageW - st.mx, y, { align: "right" });
          }
          y += 2;
        }
        y += 2;
      });
    }

    return pages;
  };

  const probe = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

  // Scale every numeric layout setting by `s` so one pass can shrink the whole
  // page proportionally (fonts, margins, spacing) to force a fit.
  const scaleSettings = (base: PdfSettings, s: number): PdfSettings => {
    const out = {} as PdfSettings;
    (Object.keys(base) as (keyof PdfSettings)[]).forEach((k) => {
      out[k] = base[k] * s;
    });
    return out;
  };

  const pageCount = (st: PdfSettings) => renderLayout(probe, st, false);

  // Fit to exactly one page: try full-size layout first, then compact,
  // then progressively shrink compact (down to ~0.72x) until it fits.
  const chosen = (() => {
    if (pageCount(layouts.normal) === 1) return layouts.normal;
    if (pageCount(layouts.compact) === 1) return layouts.compact;
    const MIN_SCALE = 0.72;
    let lo = MIN_SCALE;
    let hi = 1;
    let best = layouts.compact;
    for (let i = 0; i < 10; i += 1) {
      const mid = (lo + hi) / 2;
      const st = scaleSettings(layouts.compact, mid);
      if (pageCount(st) === 1) {
        best = st;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return best;
  })();

  const name = cleanVal(data.fullName || data.full_name);
  renderLayout(pdf, chosen, true);
  pdf.save(filename || `${(name || "Tailored-Resume").replace(/[^a-z0-9]/gi, "_")}.pdf`);
}

export default function TailorPage() {
  const router = useRouter();
  const { user } = useAuth();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:8000";

  const [resumes, setResumes] = useState<any[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>("");
  const [jdUrl, setJdUrl] = useState("");
  const [jdText, setJdText] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isTailoring, setIsTailoring] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [building, setBuilding] = useState(false);
  const [deletingVersion, setDeletingVersion] = useState<string | null>(null);

  const getResumeLabel = (resume: any) => {
    if (resume.title && resume.title !== "Untitled Resume") return resume.title;
    const role = resume.parsed_data?.targetRole || "Professional Resume";
    const date = new Date(resume.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${role} (${date})`;
  };

  const fetchResumes = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("resumes")
      .select("id, title, updated_at, parsed_data")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("Failed to load resumes");
      return;
    }
    if (data) {
      setResumes(data);
      setSelectedResumeId((prev) => prev || (data.length > 0 ? data[0].id : ""));
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchResumes();
  }, [user, fetchResumes]);

  const getToken = async (): Promise<string> => {
    const { data: sessionData } = await supabase.auth.getSession();
    return sessionData.session?.access_token || "";
  };

  const fetchVersions = useCallback(
    async (resumeId: string) => {
      if (!resumeId) {
        setVersions([]);
        return;
      }
      setLoadingVersions(true);
      try {
        const token = await getToken();
        const res = await fetch(`${backendUrl}/api/agents/resume/${resumeId}/versions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (body.success && Array.isArray(body.versions)) {
          setVersions(body.versions);
        }
      } catch (e) {
        console.error("Failed to load versions:", e);
      } finally {
        setLoadingVersions(false);
      }
    },
    [backendUrl],
  );

  useEffect(() => {
    if (selectedResumeId) fetchVersions(selectedResumeId);
  }, [selectedResumeId, fetchVersions]);

  const handleFetchJD = async () => {
    if (!jdUrl) {
      toast.error("Please enter a job URL first");
      return;
    }

    setIsFetching(true);
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/cover-letter/fetch-jd`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jdUrl }),
      });
      let result: any;
      try {
        result = await res.json();
      } catch {
        throw new Error(`Fetch failed (HTTP ${res.status || "unknown"})`);
      }
      if (result.success && result.jdText) {
        setJdText(result.jdText);
        toast.success("Job description fetched successfully!");
      } else {
        throw new Error(result.detail || `Fetch failed (HTTP ${res.status || "unknown"})`);
      }
    } catch (e: any) {
      console.error("JD Fetch Error:", e);
      toast.error(e.message || "Could not fetch Job Description. Please paste it manually below.");
    } finally {
      setIsFetching(false);
    }
  };

  const handleTailor = async () => {
    if (!selectedResumeId) {
      toast.error("Please select a resume first");
      return;
    }
    if (!jdText && !jdUrl) {
      toast.error("Please provide a Job URL or Job Description text");
      return;
    }
    setIsTailoring(true);
    setResult(null);
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/agents/resume/tailor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resume_id: selectedResumeId, jd_text: jdText, jd_url: jdUrl || null }),
      });
      const body = await res.json();
      if (body.status === "success") {
        setResult({
          version_id: body.version_id,
          resume_id: body.resume_id || selectedResumeId,
          version_number: body.version_number,
          created_at: body.created_at || null,
          diff: body.diff_json || body.diff,
          change_reasons: body.change_reasons || [],
          match_score_before: body.match_score_before,
          match_score_after: body.match_score_after,
          cached: body.cached,
          tailored_data: body.tailored_data || body.parsed_data || null,
          jd_required_skills: body.jd_required_skills || body.jd_skills || [],
          suggested_skills: body.suggested_skills || [],
        });
        toast.success(body.cached ? "Loaded from cache (same resume + JD)" : "Resume tailored successfully!");
        fetchVersions(selectedResumeId);
      } else {
        throw new Error(body.detail || body.message || "Tailoring failed");
      }
    } catch (e: any) {
      console.error("Tailor Error:", e);
      toast.error(e.message || "Failed to tailor resume");
    } finally {
      setIsTailoring(false);
    }
  };

  const handleDeleteResume = async () => {
    if (!selectedResumeId) return;
    if (!window.confirm("Are you sure? This will delete this resume and all its tailored versions.")) return;
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/resumes/${selectedResumeId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Resume deleted");
      setSelectedResumeId("");
      setResult(null);
      setVersions([]);
      await fetchResumes();
    } catch (e) {
      console.error("Delete error:", e);
      toast.error("Failed to delete resume");
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!window.confirm("Delete this tailored version?")) return;
    setDeletingVersion(versionId);
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/agents/resume/version/${versionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Version deleted");
      if (result?.version_id === versionId) setResult(null);
      if (selectedResumeId) fetchVersions(selectedResumeId);
    } catch (e) {
      console.error("Version delete error:", e);
      toast.error("Failed to delete version");
    } finally {
      setDeletingVersion(null);
    }
  };

  const viewVersion = async (versionId: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/agents/resume/version/${versionId}/data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (body.success) {
        setResult({
          version_id: body.version_id,
          version_number: body.version_number,
          created_at: body.created_at,
          diff: body.diff || {},
          change_reasons: body.change_reasons || [],
          tailored_data: body.parsed_data || null,
          jd_required_skills: body.jd_skills || [],
          suggested_skills: body.suggested_skills || [],
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        throw new Error(body.detail || "Failed to load version");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to load version");
    }
  };

  const downloadDocx = async (versionId?: string | null) => {
    const vid = versionId || result?.version_id;
    if (!vid) return;
    setDownloading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/agents/resume/version/${vid}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tailored-resume-${vid}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("DOCX downloaded");
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const downloadPdf = async (versionId?: string | null) => {
    const vid = versionId || result?.version_id;
    let data = result?.tailored_data;
    try {
      if (vid && (!data || (versionId && versionId !== result?.version_id))) {
        const token = await getToken();
        const res = await fetch(`${backendUrl}/api/agents/resume/version/${vid}/data`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json();
        if (body.success) data = body.parsed_data || null;
      }
    } catch (e) {
      console.error("PDF version fetch failed:", e);
    }
    if (!data) {
      toast.error("No tailored data available to export");
      return;
    }
    setDownloadingPdf(true);
    try {
      downloadResumePdf(data, vid ? `tailored-resume-${vid}.pdf` : "tailored-resume.pdf");
      toast.success("PDF downloaded");
    } catch (e: any) {
      console.error("PDF Error:", e);
      toast.error(e.message || "Export failed - please try one more time");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const openInBuilder = async (versionId?: string | null) => {
    const vid = versionId || result?.version_id;
    if (!vid) return;
    setBuilding(true);
    try {
      const token = await getToken();
      const res = await fetch(`${backendUrl}/api/agents/resume/version/${vid}/to-builder`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (body.success && body.resume_id) {
        router.push(`/dashboard/builder?id=${body.resume_id}`);
      } else {
        throw new Error(body.detail || "Failed to open in builder");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to open in builder");
    } finally {
      setBuilding(false);
    }
  };

  const diff = result?.diff;
  const reasonChips = flattenChangeReasons(result?.change_reasons || null);
  const scoreBefore = result?.match_score_before;
  const scoreAfter = result?.match_score_after;

  return (
    <div className="min-h-screen bg-[#f8faff] p-4 md:p-8 lg:p-12 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8 md:space-y-12">
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20 bg-[radial-gradient(circle_at_20%_20%,#e0e7ff_0,transparent_25%),radial-gradient(circle_at_80%_80%,#f5f3ff_0,transparent_25%)]" />

        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between relative z-10 gap-6">
          <div className="flex items-center gap-3 md:gap-6">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.back()}
              className="rounded-xl md:rounded-2xl h-10 w-10 md:h-14 md:w-14 bg-white border-slate-100 shadow-sm hover:shadow-md transition-all"
            >
              <ChevronLeft className="h-5 w-5 md:h-6 md:w-6 text-slate-600" />
            </Button>
            <div>
              <div className="flex items-center gap-2 md:gap-3 mb-1">
                <Badge className="bg-indigo-600 text-white border-0 font-black text-[8px] md:text-[10px] uppercase tracking-tighter px-2 py-0.5 rounded-md shadow-lg shadow-indigo-100">
                  AI Powered
                </Badge>
                <span className="h-1 w-1 md:h-1.5 md:w-1.5 rounded-full bg-indigo-200" />
                <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Premium v2.0
                </span>
              </div>
              <h1 className="text-2xl md:text-5xl font-black text-slate-900 tracking-tighter leading-none">
                Tailor Resume
              </h1>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10 relative z-10">
          {/* Left: Input Panel */}
          <div className="lg:col-span-5 space-y-6 md:space-y-8">
            <Card className="border-0 shadow-xl md:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] rounded-[1.5rem] md:rounded-[3rem] bg-white/80 backdrop-blur-3xl overflow-hidden ring-1 ring-white/20">
              <CardHeader className="p-5 md:p-10 pb-2">
                <CardTitle className="text-base md:text-xl font-black flex items-center gap-3 text-slate-900">
                  <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl md:rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 md:h-5 md:w-5" />
                  </div>
                  Target Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 md:p-10 pt-4 space-y-5 md:space-y-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">
                    Choose Base Resume
                  </label>
                  <div className="flex gap-2">
                    <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                      <SelectTrigger className="h-14 md:h-20 rounded-xl md:rounded-3xl border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 focus:ring-4 focus:ring-indigo-50 hover:border-indigo-100 transition-all text-left px-4 md:px-6 flex-1">
                        <SelectValue placeholder="Select a resume" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl md:rounded-2xl border-slate-100 shadow-2xl">
                        {(resumes || []).map((r) => (
                          <SelectItem key={r.id} value={r.id} className="py-3 focus:bg-indigo-50 rounded-lg md:rounded-xl">
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-bold text-slate-900 text-sm">{getResumeLabel(r)}</span>
                              <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black">
                                ID: {r.id.split("-")[0]}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedResumeId && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleDeleteResume}
                        className="h-14 md:h-20 w-14 md:w-20 rounded-xl md:rounded-3xl border-slate-100 bg-white text-slate-300 hover:text-rose-500 transition-colors shrink-0"
                      >
                        <Trash2 className="h-5 w-5 md:h-6 md:w-6" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs md:text-sm font-bold text-slate-700">Job Information</label>
                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-slate-100 text-slate-400">
                      Step 1: Fetch
                    </Badge>
                  </div>

                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                      <LinkIcon className="h-4 w-4" />
                    </div>
                    <Input
                      placeholder="Paste Job URL"
                      className="pl-12 pr-20 h-12 md:h-14 rounded-xl border-slate-200 focus:ring-indigo-600/10"
                      value={jdUrl}
                      onChange={(e) => setJdUrl(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={handleFetchJD}
                      disabled={isFetching || !jdUrl}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 md:h-10 rounded-lg md:rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-bold text-[10px] md:text-xs tracking-tight transition-all"
                    >
                      {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Wand2 className="h-3 w-3 mr-1.5" /> Fetch</>}
                    </Button>
                  </div>

                  <div className="relative group">
                    <div className="absolute left-4 top-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                      <Type className="h-4 w-4" />
                    </div>
                    <Textarea
                      placeholder="...or paste the full Job Description text here"
                      className="pl-12 min-h-[150px] md:min-h-[250px] rounded-[1.2rem] md:rounded-[2rem] border-slate-100 bg-white/50 focus:bg-white focus:ring-indigo-600/10 resize-none text-sm leading-relaxed"
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleTailor}
                  disabled={isTailoring || (!jdText && !jdUrl) || !selectedResumeId}
                  className="w-full h-14 md:h-20 rounded-xl md:rounded-[2.5rem] bg-indigo-600 hover:bg-violet-600 text-white font-black text-base md:text-xl shadow-lg shadow-indigo-100 hover:shadow-violet-200 transition-all active:scale-[0.98] group overflow-hidden relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  {isTailoring ? (
                    <>
                      <Loader2 className="h-5 w-5 md:h-6 md:w-6 mr-3 animate-spin" />
                      Tailoring Resume...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 md:h-6 md:w-6 mr-3" />
                      Tailor My Resume
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Output Panel — premium result report */}
          <div className="lg:col-span-7 space-y-6 md:space-y-8">
            {result ? (
              <PremiumResultCard
                result={result}
                diff={diff}
                scoreBefore={scoreBefore}
                scoreAfter={scoreAfter}
                reasonChips={reasonChips}
                downloading={downloading}
                downloadingPdf={downloadingPdf}
                building={building}
                onDownload={() => downloadDocx()}
                onDownloadPdf={() => downloadPdf()}
                onOpenBuilder={() => openInBuilder()}
              />
            ) : isTailoring ? (
              <div className="min-h-[480px] md:min-h-[640px]">
                <LoadingScreen
                  compact
                  label="Tailoring your resume…"
                  sublabel="Our AI is aligning your resume to the job description. This can take up to a minute."
                />
              </div>
            ) : (
              <EmptyState />
            )}
          </div>
        </div>

        {/* Tailoring History — premium timeline */}
        <TailorHistory
          versions={versions}
          loadingVersions={loadingVersions}
          downloading={downloading}
          downloadingPdf={downloadingPdf}
          building={building}
          deletingVersion={deletingVersion}
          resultVersionId={result?.version_id || null}
          resumeLabel={
            selectedResumeId
              ? getResumeLabel(resumes.find((r) => r.id === selectedResumeId))
              : ""
          }
          onRefresh={() => selectedResumeId && fetchVersions(selectedResumeId)}
          onView={viewVersion}
          onDownload={downloadDocx}
          onDownloadPdf={downloadPdf}
          onOpenBuilder={openInBuilder}
          onDelete={handleDeleteVersion}
        />
      </div>
    </div>
  );
}

/* ── Premium Result Report ────────────────────────────────────────────────── */

interface PremiumResultCardProps {
  result: TailorResult;
  diff: any;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  reasonChips: string[];
  downloading: boolean;
  downloadingPdf: boolean;
  building: boolean;
  onDownload: () => void;
  onDownloadPdf: () => void;
  onOpenBuilder: () => void;
}

function PremiumResultCard({
  result,
  diff,
  scoreBefore,
  scoreAfter,
  reasonChips,
  downloading,
  downloadingPdf,
  building,
  onDownload,
  onDownloadPdf,
  onOpenBuilder,
}: PremiumResultCardProps) {
  const [showDiff, setShowDiff] = useState(true);
  const [showPreview, setShowPreview] = useState(true);

  const improvements = buildImprovements(diff);
  const skills = diff?.skills || {};
  const experience = diff?.experience || [];
  const changedBullets = experience.reduce((n: number, e: any) => n + (e.bullet_changes?.length ?? 0), 0);
  const skillsAdded = skills.added?.length ?? 0;
  const skillsRemoved = skills.removed?.length ?? 0;
  const hasScore =
    typeof scoreBefore === "number" && typeof scoreAfter === "number" && scoreBefore > 0 && scoreAfter > 0;
  const scoreGain =
    typeof scoreBefore === "number" && typeof scoreAfter === "number"
      ? Math.round(scoreAfter - scoreBefore)
      : null;

  const tailoredData = result.tailored_data;
  const jdSkills = result.jd_required_skills || [];
  const coverage = analyzeJdSkills(jdSkills, tailoredData);
  const coveredCount = coverage.filter((c) => c.status !== "missing").length;
  const suggestedSkills =
    result.suggested_skills && result.suggested_skills.length
      ? result.suggested_skills
      : coverage.filter((c) => c.status === "missing").map((c) => c.skill);

  const versionLabel = result.version_number ? `Version ${result.version_number}` : "Latest version";
  const dateLabel = result.created_at
    ? new Date(result.created_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Just now";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-[1.5rem] md:rounded-[2.5rem] p-[1px] bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_32px_64px_-16px_rgba(99,102,241,0.25)]"
    >
      <div className="rounded-[calc(1.5rem-1px)] md:rounded-[calc(2.5rem-1px)] bg-white overflow-hidden">
        {/* Header band */}
        <div className="relative overflow-hidden bg-[linear-gradient(135deg,#0f172a_0%,#1e1b4b_45%,#4c1d95_100%)] px-5 py-6 md:px-8 md:py-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.35),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.25),transparent_40%)]" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-white/10 text-white border border-white/15 backdrop-blur font-black text-[9px] md:text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-lg">
                  <Sparkles className="h-3 w-3 mr-1 text-fuchsia-300" />
                  Tailoring Result
                </Badge>
                {result.cached && (
                  <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-400/20 font-black text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-lg">
                    <Database className="h-3 w-3 mr-1" />
                    Cached
                  </Badge>
                )}
              </div>
              <h2 className="mt-3 text-xl md:text-3xl font-black text-white tracking-tight">
                Your Tailored Resume
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] md:text-xs text-slate-300">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
                  {versionLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  <Clock className="h-3.5 w-3.5" />
                  {dateLabel}
                </span>
              </div>
            </div>

            {/* Score */}
            {hasScore && (
              <div className="flex items-center gap-5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-5 py-4">
                <div>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl md:text-5xl font-black text-white tabular-nums leading-none">
                      {Math.round(scoreAfter)}
                    </span>
                    <span className="text-lg font-black text-fuchsia-300">%</span>
                  </div>
                  <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    JD Match Score
                  </div>
                </div>
                {scoreGain !== null && scoreGain >= 0 && (
                  <div className="flex flex-col items-center rounded-xl bg-emerald-500/15 border border-emerald-400/25 px-2.5 py-2">
                    <TrendingUp className="h-4 w-4 text-emerald-300" />
                    <span className="mt-0.5 text-sm font-black text-emerald-300">+{scoreGain}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {hasScore && (
            <div className="relative mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>Before</span>
                  <span className="tabular-nums">{Math.round(scoreBefore)}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white/40 transition-all duration-1000"
                    style={{ width: `${Math.min(100, Math.max(0, scoreBefore))}%` }}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <span>After</span>
                  <span className="tabular-nums text-emerald-300">{Math.round(scoreAfter)}%</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-1000"
                    style={{ width: `${Math.min(100, Math.max(0, scoreAfter))}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-5 md:p-8 space-y-6">
          {/* Improvements */}
          <div>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                What We Improved
              </h3>
            </div>
            <div className="mt-3 space-y-2.5">
              {improvements.map((imp, i) => {
                const styles = IMPROVEMENT_STYLES[imp.tone];
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * i, duration: 0.25 }}
                    className={`flex items-center gap-3 rounded-xl border ${styles.chip} px-4 py-3`}
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${styles.dot}`} />
                    <p className="text-sm font-semibold text-slate-800">{imp.text}</p>
                  </motion.div>
                );
              })}
            </div>
            {reasonChips.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {reasonChips.map((r) => (
                  <span
                    key={r}
                    className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-600"
                  >
                    {formatReasonCode(r)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* JD skill coverage — why these skills are in the tailored resume */}
          {jdSkills.length > 0 && tailoredData && (
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-violet-50/40 p-4 md:p-5">
              <div className="flex items-start gap-2">
                <Target className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    JD Skills Coverage
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    We compared this JD's required skills against your resume and made sure the ones you
                    already have are <span className="font-bold text-indigo-700">placed prominently</span> —
                    highlighted in your skills section and woven into your experience bullets. ResuMatch
                    never invents skills.
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-700">
                <span className="tabular-nums text-indigo-700">{coveredCount}</span>
                <span>of</span>
                <span className="tabular-nums">{jdSkills.length}</span>
                <span>JD skills covered</span>
                <div className="ml-1 h-1.5 flex-1 max-w-[160px] rounded-full bg-white overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-1000"
                    style={{ width: `${jdSkills.length ? Math.round((coveredCount / jdSkills.length) * 100) : 0}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {coverage.map((c) => (
                  <div
                    key={c.skill}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                      c.status === "missing"
                        ? "bg-amber-50/70 border-amber-100"
                        : "bg-white/80 border-indigo-100"
                    }`}
                  >
                    {c.status === "missing" ? (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                        <span className="text-[10px] font-black">!</span>
                      </span>
                    ) : (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{c.skill}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                        c.status === "missing"
                          ? "bg-amber-100 text-amber-700"
                          : c.status === "skills"
                            ? "bg-indigo-100 text-indigo-700"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {c.status === "missing" ? "Not found" : c.status === "skills" ? "In skills" : "Covered"}
                    </span>
                  </div>
                ))}
              </div>

              {suggestedSkills.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-600 shrink-0" />
                    <h4 className="text-xs font-black text-amber-800 uppercase tracking-wider">
                      Suggested to add manually
                    </h4>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-amber-700">
                    These JD skills don't appear anywhere in your resume yet. ResuMatch never invents
                    skills — if you genuinely have them, add them to your resume and tailor again.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {suggestedSkills.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-bold text-amber-800"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats strip */}
          {(skillsAdded > 0 || skillsRemoved > 0 || changedBullets > 0 || diff?.summary) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <StatChip
                label="Skills added"
                value={`+${skillsAdded}`}
                tone="emerald"
                icon={CheckCircle2}
              />
              <StatChip
                label="Skills removed"
                value={`-${skillsRemoved}`}
                tone="rose"
                icon={CheckCircle2}
              />
              <StatChip label="Bullets rewritten" value={`${changedBullets}`} tone="violet" icon={PenLine} />
              <StatChip
                label="Summary"
                value={diff?.summary ? "Updated" : "Unchanged"}
                tone={diff?.summary ? "amber" : "slate"}
                icon={PenLine}
              />
            </div>
          )}

          {/* Diff viewer */}
          {diff && (
            <div className="rounded-2xl border border-slate-200/80 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowDiff((v) => !v)}
                className="flex w-full items-center justify-between gap-2 bg-slate-50 px-4 py-3.5 text-left transition hover:bg-slate-100"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <GitCompare className="h-4 w-4 text-indigo-600" />
                  Line-by-line changes
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${showDiff ? "rotate-180" : ""}`}
                />
              </button>
              {showDiff && (
                <div className="space-y-4 border-t border-slate-100 bg-white p-4 md:p-5">
                  {diff.summary && (diff.summary.removed || diff.summary.added) && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Summary</div>
                      <DiffLine prefix="-" text={diff.summary.removed} />
                      <DiffLine prefix="+" text={diff.summary.added} />
                    </div>
                  )}
                  {(skillsAdded > 0 || skillsRemoved > 0) && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Skills</div>
                      {(skills.removed || []).map((s: string) => (
                        <DiffLine key={`-${s}`} prefix="-" text={s} />
                      ))}
                      {(skills.added || []).map((s: string) => (
                        <DiffLine key={`+${s}`} prefix="+" text={s} />
                      ))}
                    </div>
                  )}
                  {experience.map((entry: any, i: number) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                        {entry.title}
                        {entry.company ? ` · ${entry.company}` : ""}
                      </div>
                      {(entry.bullet_changes || []).map((b: any, j: number) => (
                        <div key={j} className="space-y-1.5">
                          <DiffLine prefix="-" text={b.removed} />
                          <DiffLine prefix="+" text={b.added} />
                          {b.reason && (
                            <div className="pl-3 text-[10px] italic text-slate-400">
                              reason: {formatReasonCode(b.reason.split("|")[0])}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                  {!diff.summary && skillsAdded === 0 && skillsRemoved === 0 && changedBullets === 0 && (
                    <p className="text-xs text-slate-500">No significant changes detected for this version.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Resume preview */}
          {tailoredData && (
            <div className="rounded-2xl border border-slate-200/80 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="flex w-full items-center justify-between gap-2 bg-slate-50 px-4 py-3.5 text-left transition hover:bg-slate-100"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Preview tailored resume
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${showPreview ? "rotate-180" : ""}`}
                />
              </button>
              {showPreview && <ResumePreview data={tailoredData} jdSkills={jdSkills} />}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={downloadingPdf}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:shadow-violet-200 hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
            >
              {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Download PDF
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={downloading}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition hover:shadow-violet-200 hover:opacity-95 active:scale-[0.98] disabled:opacity-60"
            >
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download DOCX
            </button>
            <button
              type="button"
              onClick={onOpenBuilder}
              disabled={building}
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 active:scale-[0.98] disabled:opacity-60"
            >
              {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
              Open in Resume Builder
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatChip({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "violet" | "amber" | "slate";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
    rose: "bg-rose-50 border-rose-100 text-rose-700",
    violet: "bg-violet-50 border-violet-100 text-violet-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    slate: "bg-slate-50 border-slate-100 text-slate-600",
  };
  const iconTones: Record<string, string> = {
    emerald: "text-emerald-500",
    rose: "text-rose-500",
    violet: "text-violet-500",
    amber: "text-amber-500",
    slate: "text-slate-400",
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest opacity-80">
        <Icon className={`h-3 w-3 ${iconTones[tone]}`} />
        {label}
      </div>
      <div className="mt-0.5 text-lg font-black tabular-nums leading-none">{value}</div>
    </div>
  );
}

function DiffLine({ prefix, text }: { prefix: "+" | "-"; text?: string | null }) {
  if (!text) return null;
  const added = prefix === "+";
  return (
    <div
      className={`flex gap-2 rounded-lg px-2.5 py-1.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words ${
        added
          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
          : "bg-rose-50 text-rose-800 border border-rose-200"
      }`}
    >
      <span className={`select-none font-black ${added ? "text-emerald-500" : "text-rose-500"}`}>{prefix}</span>
      <span className="min-w-0">{text}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-[480px] md:min-h-[640px] flex-col items-center justify-center rounded-[1.5rem] md:rounded-[2.5rem] border-2 border-dashed border-indigo-100 bg-white/60 backdrop-blur-xl px-6 text-center"
    >
      <div className="relative">
        <div className="flex h-16 w-16 md:h-20 md:w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-xl shadow-indigo-200">
          <Sparkles className="h-7 w-7 md:h-9 md:w-9" />
        </div>
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-fuchsia-500 text-white shadow-lg">
          <Target className="h-3 w-3" />
        </span>
      </div>
      <h3 className="mt-6 text-lg md:text-xl font-black text-slate-900">Your tailored result appears here</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
        Pick a base resume and paste a job description, then hit{" "}
        <span className="font-bold text-indigo-600">Tailor My Resume</span>. Our AI rewrites your resume to match the
        role, shows exactly what changed, and keeps every version in your history.
      </p>
    </motion.div>
  );
}

/* ── Tailoring History — premium timeline ─────────────────────────────────── */

function TailorHistory({
  versions,
  loadingVersions,
  downloading,
  downloadingPdf,
  building,
  deletingVersion,
  resultVersionId,
  resumeLabel,
  onRefresh,
  onView,
  onDownload,
  onDownloadPdf,
  onOpenBuilder,
  onDelete,
}: {
  versions: VersionRecord[];
  loadingVersions: boolean;
  downloading: boolean;
  downloadingPdf: boolean;
  building: boolean;
  deletingVersion: string | null;
  resultVersionId: string | null;
  resumeLabel: string;
  onRefresh: () => void;
  onView: (versionId: string) => void;
  onDownload: (versionId?: string | null) => void;
  onDownloadPdf: (versionId?: string | null) => void;
  onOpenBuilder: (versionId?: string | null) => void;
  onDelete: (versionId: string) => void;
}) {
  return (
    <Card className="relative z-10 border-0 shadow-xl md:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] rounded-[1.5rem] md:rounded-[2.5rem] bg-white/90 backdrop-blur-3xl overflow-hidden ring-1 ring-white/20">
      <CardHeader className="p-5 md:p-8 pb-2 flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base md:text-xl font-black flex items-center gap-3 text-slate-900">
            <div className="h-8 w-8 md:h-10 md:w-10 rounded-xl md:rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-indigo-200">
              <History className="h-4 w-4 md:h-5 md:w-5" />
            </div>
            Tailoring History
          </CardTitle>
          <p className="text-[11px] md:text-xs text-slate-400 font-semibold mt-1.5 ml-1 flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" />
            {resumeLabel || "Select a resume to see its tailored versions"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          className="text-slate-400 hover:text-indigo-600"
          title="Refresh history"
        >
          <RefreshCw className={`h-4 w-4 ${loadingVersions ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="p-5 md:p-8 pt-4">
        {loadingVersions ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading versions...
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-300">
              <History className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-500">
              No tailored versions for this resume yet.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Every time you tailor, a new version is saved here automatically.
            </p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[27px] top-4 bottom-4 w-[2px] rounded-full bg-gradient-to-b from-indigo-200 via-violet-200 to-transparent" />
            <div className="space-y-5">
              {versions.map((v, idx) => {
                const ds = v.diff_summary || {};
                const bullets = ds.bullets_changed ?? 0;
                const skillsAdded = ds.skills_added ?? 0;
                const skillsRemoved = ds.skills_removed ?? 0;
                const isCurrent = v.version_id === resultVersionId;
                return (
                  <motion.div
                    key={v.version_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.05, 0.3), duration: 0.25 }}
                    className="relative pl-16 md:pl-[76px]"
                  >
                    <div
                      className={`absolute left-0 top-0 flex h-14 w-14 md:h-16 md:w-16 flex-col items-center justify-center rounded-2xl text-white shadow-lg ring-4 ring-white transition ${
                        isCurrent
                          ? "bg-gradient-to-br from-fuchsia-600 to-violet-600 shadow-fuchsia-200"
                          : "bg-gradient-to-br from-indigo-600 to-violet-600 shadow-indigo-200"
                      }`}
                    >
                      <span className="text-[8px] font-black uppercase tracking-wider opacity-70 leading-none">v</span>
                      <span className="text-lg md:text-xl font-black leading-none">{v.version_number}</span>
                    </div>

                    <div
                      className={`rounded-2xl border p-4 md:p-5 transition ${
                        isCurrent
                          ? "border-fuchsia-200 bg-gradient-to-br from-fuchsia-50/70 to-indigo-50/70 shadow-sm"
                          : "border-slate-100 bg-white hover:border-indigo-100 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => onView(v.version_id)}
                          className="text-left min-w-0 flex-1"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs md:text-sm font-black text-slate-900">
                              {v.created_at
                                ? new Date(v.created_at).toLocaleString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "Recently"}
                            </span>
                            {isCurrent && (
                              <span className="rounded-full bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white text-[9px] font-black uppercase px-2 py-0.5 shadow-sm">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="mt-1.5 text-[10px] text-slate-400 uppercase tracking-widest font-black truncate">
                            {v.version_id}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDownloadPdf(v.version_id)}
                            disabled={downloadingPdf}
                            className="h-9 w-9 text-slate-400 hover:text-indigo-600"
                            title="Download PDF"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDownload(v.version_id)}
                            disabled={downloading}
                            className="h-9 w-9 text-slate-400 hover:text-indigo-600"
                            title="Download DOCX"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onOpenBuilder(v.version_id)}
                            disabled={building}
                            className="h-9 w-9 text-slate-400 hover:text-indigo-600"
                            title="Open in Resume Builder"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDelete(v.version_id)}
                            disabled={deletingVersion === v.version_id}
                            className="h-9 w-9 text-slate-300 hover:text-rose-500"
                            title="Delete version"
                          >
                            {deletingVersion === v.version_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {bullets > 0 && (
                          <span className="text-[10px] font-black uppercase tracking-wider text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2.5 py-1">
                            {bullets} bullet{bullets > 1 ? "s" : ""} rewritten
                          </span>
                        )}
                        {skillsAdded > 0 && (
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
                            +{skillsAdded} skills
                          </span>
                        )}
                        {skillsRemoved > 0 && (
                          <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-100 rounded-full px-2.5 py-1">
                            -{skillsRemoved} skills
                          </span>
                        )}
                        {ds.summary_changed && (
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-1">
                            Summary updated
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onView(v.version_id)}
                          className="ml-auto h-8 rounded-lg px-3 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50"
                        >
                          View result
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
