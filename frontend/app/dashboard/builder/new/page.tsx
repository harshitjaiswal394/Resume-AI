"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import {
  ArrowLeft,
  Check,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileDown,
  FilePlus2,
  FileText,
  GraduationCap,
  List,
  Loader2,
  Lock,
  Mail,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Target,
  Trash2,
  Upload,
  User,
  Wand2
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { secureGet, secureSet, secureRemove } from '@/lib/secureStorage';
import { jsPDF } from 'jspdf';

// --- Types ---
interface Experience {
  title: string;
  company: string;
  duration: string;
  description: string[];
}

interface Education {
  degree: string;
  institution: string;
  year: string;
}

interface Project {
  title: string;
  description: string;
  link: string;
  tech_stack: string[];
}

interface Certification {
  name: string;
  issuer: string;
  year: string;
}

interface Language {
  language: string;
  proficiency: string;
}

interface Internship {
  role: string;
  company: string;
  duration: string;
  description: string[];
}

interface Achievement {
  title: string;
  description: string;
}

interface CustomSection {
  title: string;
  items: string[];
}

interface ResumeData {
  fullName: string;
  email: string;
  phone: string;
  summary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  projects: Project[];
  certifications: Certification[];
  languages: Language[];
  internships: Internship[];
  achievements: Achievement[];
  customSections: CustomSection[];
  sectionOrder: string[];
}

const INITIAL_DATA: ResumeData = {
  fullName: '',
  email: '',
  phone: '',
  summary: '',
  skills: [],
  experience: [{ title: '', company: '', duration: '', description: [''] }],
  education: [{ degree: '', institution: '', year: '' }],
  projects: [{ title: '', description: '', link: '', tech_stack: [] }],
  certifications: [],
  languages: [],
  internships: [],
  achievements: [],
  customSections: [],
  sectionOrder: ['summary', 'skills', 'experience', 'education', 'projects', 'certifications', 'languages', 'achievements', 'internships', 'custom']
};

export default function AIResumeBuilder() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const [step, setStep] = useState(1);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [discovery, setDiscovery] = useState({ role: '', exp: '' });
  const [isLoaded, setIsLoaded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<ResumeData>(INITIAL_DATA);
  const [originalScore, setOriginalScore] = useState<number | null>(null);
  const [currentScore, setCurrentScore] = useState<number>(0);
  const lastSavedRef = useRef<string>(""); // For dirty checking

  const [activeMode, setActiveMode] = useState<'default' | 'tailored'>('default');
  const [tailoredVersionId, setTailoredVersionId] = useState<string | null>(null);
  const [isLoadingTailored, setIsLoadingTailored] = useState(false);

  // Map a tailored version's parsed_data into the builder's ResumeData shape.
  const mapTailoredToResumeData = (parsed: any): ResumeData => {
    const src = parsed && typeof parsed === 'object' ? parsed : {};
    const mapExp = (list: any[]): Experience[] => (list || []).map((e) => ({
      title: e?.title || '',
      company: e?.company || '',
      duration: e?.duration || e?.location || '',
      description: Array.isArray(e?.bullets)
        ? e.bullets.map((b: any) => (typeof b === 'string' ? b : b?.text || b?.original_bullet || '')).filter(Boolean)
        : Array.isArray(e?.description) ? e.description : [],
    }));
    const mapCert = (list: any[]): Certification[] => (list || []).map((c) =>
      typeof c === 'string' ? { name: c, issuer: '', year: '' } : { name: c?.name || '', issuer: c?.issuer || '', year: c?.year || '' }
    );
    const mapLang = (list: any[]): Language[] => (list || []).map((l) =>
      typeof l === 'string' ? { language: l, proficiency: '' } : { language: l?.language || '', proficiency: l?.proficiency || '' }
    );
    return {
      ...INITIAL_DATA,
      fullName: src.fullName || src.full_name || '',
      email: src.email || '',
      phone: src.phone || src.phone_number || '',
      summary: src.summary || '',
      skills: Array.isArray(src.skills) ? src.skills.map((s: any) => typeof s === 'string' ? s : s?.name || '') : [],
      experience: mapExp(src.experience),
      education: Array.isArray(src.education) ? src.education.map((e: any) =>
        typeof e === 'string' ? { degree: e, institution: '', year: '' }
          : { degree: e?.degree || e?.title || '', institution: e?.institution || '', year: e?.year || '' }
      ) : [],
      projects: Array.isArray(src.projects) ? src.projects.map((p: any) => ({
        title: p?.title || p?.name || '',
        description: Array.isArray(p?.description) ? p.description.join('\n') : p?.description || '',
        link: p?.link || p?.url || '',
        tech_stack: p?.tech_stack || p?.techStack || p?.skills || [],
      })) : [],
      certifications: mapCert(src.certifications),
      languages: mapLang(src.languages),
      internships: Array.isArray(src.internships) ? src.internships.map((i: any) => ({
        role: i?.role || i?.title || '',
        company: i?.company || '',
        duration: i?.duration || '',
        description: Array.isArray(i?.description) ? i.description : [],
      })) : [],
      achievements: Array.isArray(src.achievements) ? src.achievements.map((a: any) =>
        typeof a === 'string' ? { title: a, description: '' }
          : { title: a?.title || a?.name || '', description: a?.description || '' }
      ) : [],
      customSections: Array.isArray(src.custom_sections) || Array.isArray(src.customSections)
        ? (src.custom_sections || src.customSections).map((cs: any) => ({
            title: cs?.title || '',
            items: Array.isArray(cs?.items) ? cs.items.map((i: any) => typeof i === 'string' ? i : i?.text || '') : [],
          }))
        : [],
    };
  };

  const loadTailoredVersion = async (silent = false) => {
    if (!resumeId || activeMode === 'tailored') return;
    setIsLoadingTailored(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");
      const listRes = await fetch(`${backendUrl}/api/agents/resume/${resumeId}/versions`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      if (!listRes.ok) throw new Error("No tailored versions");
      const listJson = await listRes.json();
      const versions: any[] = listJson.versions ?? [];
      if (!versions.length) {
        if (!silent) {
          toast.error('No tailored version available yet. Tailor your resume in Chat first.');
        }
        return;
      }
      const latest = versions[0];
      const dataRes = await fetch(`${backendUrl}/api/agents/resume/version/${latest.version_id}/data`, {
        headers: { "Authorization": `Bearer ${session.access_token}` },
      });
      if (!dataRes.ok) throw new Error("Version data fetch failed");
      const dataJson = await dataRes.json();
      const mapped = mapTailoredToResumeData(dataJson.parsed_data);
      setData(mapped);
      setTailoredVersionId(dataJson.version_id);
      setActiveMode('tailored');
      // Persist the Tailored-mode selection AND a local copy of the tailored
      // data so returning to this page restores the tailored view immediately
      // (even before the backend is re-queried). The mode flag holds only
      // non-PII ids, so it is stored in plain localStorage; the resume data
      // (PII) is encrypted like other drafts.
      try {
        localStorage.setItem('resumatch_tailored_mode', JSON.stringify({ resumeId, versionId: dataJson.version_id }));
      } catch { /* ignore */ }
      secureSet(localStorage, 'resumatch_tailored_data', { resumeId, versionId: dataJson.version_id, data: mapped }).catch(() => {});
      if (!silent) {
        toast.success(`Loaded Tailored Resume v${dataJson.version_number} (${mapped.fullName || 'resume'})`);
      }
    } catch (e: any) {
      console.error('[Builder] Tailored load failed', e);
      if (!silent) {
        toast.error(e.message || 'Could not load tailored version');
      }
    } finally {
      setIsLoadingTailored(false);
    }
  };

  const switchToDefault = async () => {
    setActiveMode('default');
    setTailoredVersionId(null);
    try { localStorage.removeItem('resumatch_tailored_mode'); } catch { /* ignore */ }
    secureRemove(localStorage, 'resumatch_tailored_data');
    if (resumeId) {
      await fetchResume(resumeId);
    }
  };

  // NOTE: this deliberately depends on `user?.id` (a stable string), NOT the
  // `user` object. AuthProvider re-creates the user object on every auth event
  // (including automatic token refresh when returning to this tab/page), so
  // depending on `user` would re-run loadDraft -> fetchResume and clobber the
  // Tailored-mode data with the original resume while the toggle stays Tailored.
  useEffect(() => {
    if (!isAuthReady) return; // WAIT FOR AUTH INITIALIZATION

    const loadDraft = async () => {
      const params = new URLSearchParams(window.location.search);
      const urlId = params.get('id');
      const urlRole = params.get('role');
      let activeResumeId: string | null = urlId;

      // PHASE 0: Pre-sync check (Landing Page / Dashboard intent)
      if (urlRole) {
        console.log('[Builder] Discovery: Intent captured from URL:', urlRole);
        setDiscovery(prev => ({ ...prev, role: urlRole }));
      }
      
      console.log('[Builder] Handshake: Auth is ready. Initiating Cloud Sovereignty check...', { urlId, userId: user?.id });

      // PHASE 1: Authority Verification (URL Intent)
      if (urlId) {
        console.log('[Builder] Authority: URL ID identified. Restoring cloud record...', urlId);
        if (user) {
          await fetchResume(urlId, { skipData: isTailoredResume(urlId) });
          setResumeId(urlId);
          setIsLoaded(true);
          return;
        }
      }

      // PHASE 2: Cloud Sovereignty (Account Sync)
      // If logged in, we scan the account's master database before trusting any local browser data.
      if (!activeResumeId && user && user.id !== 'guest') {
        console.log('[Builder] Authority: Logged-in user. Querying Account Master Sync...');
        try {
          const { data: latestResumes, error } = await supabase
            .from('resumes')
            .select('id')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1);

          if (!error && latestResumes && latestResumes.length > 0) {
            const cloudId = latestResumes[0].id;
            console.log('[Builder] Authority: Cloud record found! Syncing account state...', cloudId);
            setResumeId(cloudId);
            await fetchResume(cloudId, { skipData: isTailoredResume(cloudId) });
            activeResumeId = cloudId;
            
            // Re-sync URL
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('id', cloudId);
            window.history.replaceState({}, '', newUrl.toString());

            window.history.replaceState({}, '', newUrl.toString());
          } else {
            console.log('[Builder] Authority: No cloud drafts found for this account.');
            if (error) console.error('[Builder] Sync error:', error);
          }
        } catch (e) {
          console.warn('[Builder] Cloud handshake failed:', e);
        }
      }

      // PHASE 3: Browser Cache Fallback (Guest or Offline sessions)
      // Only used if no Cloud data is available for this account.
      if (!activeResumeId) {
        const sessionSnapshot = await secureGet(sessionStorage, 'resumatch_builder_session');
        const localSnapshot = await secureGet(localStorage, 'resumatch_builder_data');
        const savedSnapshot = sessionSnapshot || localSnapshot;
        if (savedSnapshot) {
          try {
            const parsed = typeof savedSnapshot === 'string' ? JSON.parse(savedSnapshot) : savedSnapshot;
            const raw = parsed.data || parsed;
            // Merge with defaults so every field (incl. customSections) is an array
            const restoredData = { ...INITIAL_DATA, ...(raw && typeof raw === 'object' ? raw : {}) };
            // 'custom' must always be the final section — old saves lack it
            if (Array.isArray(restoredData.sectionOrder) && !restoredData.sectionOrder.includes('custom')) {
              restoredData.sectionOrder.push('custom');
            }
            const restoredResumeId = parsed.resumeId || null;
            const restoredDiscovery = parsed.discovery || null;

            if (restoredData && (restoredData.fullName || restoredResumeId)) {
              console.log('[Builder] Authority: Cloud empty. Restoring from secondary local cache.');
              setData(restoredData);
              activeResumeId = restoredResumeId;
              if (restoredResumeId) setResumeId(restoredResumeId);
              if (restoredDiscovery) setDiscovery(restoredDiscovery);
              
              lastSavedRef.current = JSON.stringify({ 
                data: restoredData, 
                discovery: restoredDiscovery || { role: '', exp: '' } 
              });
            }
          } catch (e) {
            console.warn('[Builder] Local cache bypass', e);
          }
        }
      }
      
      setIsLoaded(true);
      console.log('[Builder] Handshake: Account state and cache resolved.');
    };

    loadDraft();
  }, [user?.id, isAuthReady]);

  // Auto-open Tailored mode if a pending tailored version exists for this
  // resume (from Chat), or the user previously left the builder in Tailored
  // mode. When we have a locally cached tailored copy we restore it directly
  // (no network, no race with fetchResume); otherwise we re-fetch from the
  // backend. The plain `resumatch_tailored_mode` flag holds only non-PII ids,
  // so it is read synchronously — the PII resume data stays encrypted.
  useEffect(() => {
    if (!isLoaded || !resumeId || activeMode !== 'default') return;
    let pending: any = null;
    try {
      pending = JSON.parse(localStorage.getItem('resumatch_tailored_pending') || 'null');
    } catch { /* ignore */ }
    if (pending && pending.resume_id && pending.version_id && pending.resume_id === resumeId) {
      try {
        localStorage.removeItem('resumatch_tailored_pending');
      } catch { /* ignore */ }
      loadTailoredVersion(true);
      return;
    }
    let flag: { resumeId?: string } | null = null;
    try {
      flag = JSON.parse(localStorage.getItem('resumatch_tailored_mode') || 'null');
    } catch { /* ignore */ }
    if (!flag) {
      // Older builds stored this flag encrypted — read it via secureGet too.
      secureGet(localStorage, 'resumatch_tailored_mode')
        .then((stored) => {
          const old = stored as { resumeId?: string } | null;
          if (old && old.resumeId === resumeId) loadTailoredVersion(true);
        })
        .catch(() => {});
    }
    if (flag && flag.resumeId === resumeId) {
      secureGet(localStorage, 'resumatch_tailored_data')
        .then((stored) => {
          const s = stored as { resumeId?: string; versionId?: string; data?: ResumeData } | null;
          if (s && s.resumeId === resumeId && s.data) {
            setData(s.data);
            setTailoredVersionId(s.versionId || null);
            setActiveMode('tailored');
          } else {
            loadTailoredVersion(true);
          }
        })
        .catch(() => loadTailoredVersion(true));
    }
  }, [isLoaded, resumeId, activeMode]);

  // Auto-save draft (AES-GCM encrypted — resume content contains PII like
  // phone/email/certs and must not sit in browser storage as clear text).
  useEffect(() => {
    if (!isLoaded || activeMode === 'tailored') return; // DON'T SAVE UNTIL LOADED - Prevents overwriting with empty state
    const snapshot = { data, resumeId, discovery };
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      try {
        await secureSet(localStorage, 'resumatch_builder_data', snapshot);
        await secureSet(sessionStorage, 'resumatch_builder_session', snapshot);
      } catch (e) {
        console.warn('[Builder] Encrypted draft save skipped:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [data, resumeId, discovery, isLoaded, activeMode]);

  // Optimized Debounced Auto-save to DB
  useEffect(() => {
    if (!isLoaded || !user || user.id === 'guest' || activeMode === 'tailored') return;

    const timer = setTimeout(() => {
      performSilentSave();
    }, 5000); // 5 second debounce for DB performance

    return () => clearTimeout(timer);
  }, [data, discovery, user?.id, activeMode]);

  // Save on tab switch/visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (isLoaded && activeMode !== 'tailored' && document.visibilityState === 'hidden') {
        performSilentSave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [data, discovery, resumeId, activeMode]);

  const performSilentSave = async () => {
    if (!user || user.id === 'guest' || !isLoaded) return;
    
    // Dirty check: only save if state has changed
    const currentState = JSON.stringify({ data, discovery });
    if (currentState === lastSavedRef.current) return;

    try {
      const token = await getAuthToken();
      const isUpdate = !!resumeId;
      const url = isUpdate ? `${backendUrl}/api/resumes/${resumeId}` : `${backendUrl}/api/resumes/`;
      const method = isUpdate ? 'PUT' : 'POST';

      const payload = {
        title: `${data.fullName || 'Untitled'}'s Resume - ${discovery.role}`,
        target_role: discovery.role,
        years_of_experience: parseInt(discovery.exp) || 0,
        summary: data.summary,
        skills: data.skills,
        experience: data.experience,
        education: data.education,
        projects: data.projects,
        certifications: (data.certifications || []).map(c => 
          typeof c === 'string' ? { name: c, issuer: '', year: '' } : c
        ),
        languages: data.languages,
        internships: data.internships,
        achievements: data.achievements,
        section_order: data.sectionOrder,
        phone_number: data.phone,
        user_id: user.id,
        parsed_data: data,
        original_score: originalScore || 0,
        resume_score: currentScore || 0
      };

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        lastSavedRef.current = currentState;
        if (!isUpdate && result.resume_id) {
          setResumeId(result.resume_id);
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('id', result.resume_id);
          window.history.replaceState({}, '', newUrl.toString());
        }
      }
    } catch (e) {
      console.warn('Silent auto-save failed - state preserved locally');
    }
  };

  // True when the user previously left THIS resume in Tailored mode (plain,
  // non-PII flag in localStorage). Used to stop fetchResume from ever writing
  // the original resume over the Tailored view.
  const isTailoredResume = (id: string | null): boolean => {
    if (!id) return false;
    try {
      const flag = JSON.parse(localStorage.getItem('resumatch_tailored_mode') || 'null');
      return !!flag && flag.resumeId === id;
    } catch { return false; }
  };

  const fetchResume = async (id: string, opts: { skipData?: boolean } = {}) => {
    console.log('[Builder] Fetching resume from DB:', id);
    const { data: resume, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .single();

    if (resume && !error) {
      // Restore Discovery Metadata - Prioritize URL role if it was just passed from Dashboard
      const params = new URLSearchParams(window.location.search);
      const urlRole = params.get('role');
      const urlExp = params.get('exp');
      
      const newDiscovery = {
         role: urlRole || resume.target_role || '',
         exp: urlExp || resume.years_of_experience?.toString() || ''
      };
      setDiscovery(newDiscovery);

      let restoredData: ResumeData = { ...INITIAL_DATA };
      if (resume.parsed_data) {
        const parsed = typeof resume.parsed_data === 'string' 
          ? JSON.parse(resume.parsed_data) 
          : resume.parsed_data;
        // Merge with defaults so no field is ever undefined (keeps inputs controlled)
        restoredData = { ...INITIAL_DATA, ...parsed };
      }
      
      // CRITICAL: Merge individual columns into restoredData to ensure "My Resume" edits reflect here
      if (resume.summary) restoredData.summary = resume.summary;
      if (resume.skills) restoredData.skills = Array.isArray(resume.skills) ? resume.skills : restoredData.skills;
      if (resume.experience) restoredData.experience = Array.isArray(resume.experience) ? resume.experience : restoredData.experience;
      if (resume.education) restoredData.education = Array.isArray(resume.education) ? resume.education : restoredData.education;
      if (resume.projects) restoredData.projects = Array.isArray(resume.projects) ? resume.projects : restoredData.projects;
      if (resume.certifications) restoredData.certifications = Array.isArray(resume.certifications) ? resume.certifications : restoredData.certifications;
      if (resume.languages) restoredData.languages = Array.isArray(resume.languages) ? resume.languages : restoredData.languages;
      if (resume.internships) restoredData.internships = Array.isArray(resume.internships) ? resume.internships : restoredData.internships;
      if (resume.achievements) restoredData.achievements = Array.isArray(resume.achievements) ? resume.achievements : restoredData.achievements;
      if (resume.custom_sections) restoredData.customSections = Array.isArray(resume.custom_sections) ? resume.custom_sections : restoredData.customSections;
      if (resume.section_order) {
        const order = Array.isArray(resume.section_order) ? [...resume.section_order] : [];
        // 'custom' must always be the final section — old saves lack it
        if (!order.includes('custom')) order.push('custom');
        restoredData.sectionOrder = order;
      }
      if (resume.phone_number) restoredData.phone = resume.phone_number;
      if (resume.title && !restoredData.fullName) restoredData.fullName = resume.title.split("'s Resume")[0];
      
      // When the user left this resume in Tailored mode, the original data must
      // NOT overwrite the Tailored view — the auto-open restore below fills in
      // the tailored data instead. Keep discovery/scores, skip the form data.
      if (!opts.skipData) {
        setData(restoredData);
        lastSavedRef.current = JSON.stringify({ data: restoredData, discovery: newDiscovery });
      }
      
      // Restore score metrics
      if (resume.original_score !== undefined) setOriginalScore(resume.original_score);
      if (resume.resume_score !== undefined) setCurrentScore(resume.resume_score || 0);

      console.log('[Builder] State restored from DB');
    } else {
      console.error('[Builder] Fetch resume failed or record missing', error);
    }
  };

  const jsonParseSafe = (str: string) => {
    try { return JSON.parse(str); } catch (e) { return { role: '', exp: '' }; }
  };

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    (typeof window !== 'undefined' && !window.location.hostname.includes('localhost')
      ? window.location.origin
      : 'http://127.0.0.1:8000');

  const getAuthToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || '';
  };

  // --- AI Optimizations ---
  const handleOptimizeExperience = async (index: number) => {
    if (!discovery.role) {
      toast.error('Target role is missing. Please go back and set it.');
      return;
    }

    setIsOptimizing(true);
    const token = await getAuthToken();
    toast.promise(
      (async () => {
        const response = await fetch(`${backendUrl}/api/builder/optimize-experience`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            experience: data.experience[index],
            target_role: discovery.role,
            years_of_experience: parseInt(discovery.exp) || 0
          })
        });
        const result = await response.json();
        if (result.success) {
          const newExp = [...data.experience];
          newExp[index] = result.optimized;
          setData({ ...data, experience: newExp });

          // Update current score (mock calculation for now, or fetch from backend if available)
          setCurrentScore(prev => Math.min(95, prev + 5));

          return 'Work experience optimized for ATS!';
        }
        throw new Error('Optimization failed');
      })(),
      {
        loading: 'Llama 3.1 is optimizing your bullets...',
        success: (msg) => { setIsOptimizing(false); return msg; },
        error: (err) => { setIsOptimizing(false); return String(err); }
      }
    );
  };

  const handleGenerateSummary = async () => {
    setIsOptimizing(true);
    try {
      const token = await getAuthToken();
      const response = await fetch(`${backendUrl}/api/builder/generate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          profileData: data,
          targetRole: discovery.role
        })
      });
      const result = await response.json();
      if (result.success) {
        setData({ ...data, summary: result.summary });
        toast.success('Professional summary generated!');
      }
    } catch (e) {
      toast.error('Failed to generate summary');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleEnhanceBullet = async (expIdx: number, bulletIdx: number) => {
    if (!discovery.role) {
      toast.error('Please set a target role first.');
      return;
    }

    const bullet = data.experience[expIdx].description[bulletIdx];
    if (!bullet.trim()) return;

    setIsOptimizing(true);
    const token = await getAuthToken();
    toast.promise(
      (async () => {
        const response = await fetch(`${backendUrl}/api/builder/optimize-experience`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          // The backend expects an experience object with a description array
          body: JSON.stringify({
            experience: { ...data.experience[expIdx], description: [bullet] },
            target_role: discovery.role,
            years_of_experience: parseInt(discovery.exp) || 0
          })
        });
        const result = await response.json();
        if (result.success && result.optimized.description.length > 0) {
          const newExp = [...data.experience];
          newExp[expIdx].description[bulletIdx] = result.optimized.description[0];
          setData({ ...data, experience: newExp });
          return 'Bullet point enhanced!';
        }
        throw new Error('Enhancement failed');
      })(),
      {
        loading: 'Polishing your bullet point...',
        success: (msg) => { setIsOptimizing(false); return msg; },
        error: (err) => { setIsOptimizing(false); return String(err); }
      }
    );
  };

  // --- Storage & Flow ---
  const handleSave = async () => {
    if (activeMode === 'tailored') {
      toast.info('Switch to Default mode to save manual edits to your resume.');
      return;
    }
    setIsSaving(true);
    try {
      const token = await getAuthToken();
      const isUpdate = !!resumeId;
      const url = isUpdate ? `${backendUrl}/api/resumes/${resumeId}` : `${backendUrl}/api/resumes/`;
      const method = isUpdate ? 'PUT' : 'POST';

      const payload = {
        title: `${data.fullName || 'Untitled'}'s Resume - ${discovery.role}`,
        target_role: discovery.role,
        years_of_experience: parseInt(discovery.exp) || 0,
        summary: data.summary,
        skills: data.skills,
        experience: data.experience,
        education: data.education,
        projects: data.projects,
        certifications: (data.certifications || []).map(c => 
          typeof c === 'string' ? { name: c, issuer: '', year: '' } : c
        ),
        languages: data.languages,
        internships: data.internships,
        achievements: data.achievements,
        custom_sections: data.customSections,
        section_order: data.sectionOrder,
        phone_number: data.phone,
        user_id: user?.id || 'guest',
        parsed_data: data,
        original_score: originalScore || 0,
        resume_score: currentScore || 0
      };

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok) {
        lastSavedRef.current = JSON.stringify({ data, discovery });
        if (!isUpdate && result.resume_id) {
          setResumeId(result.resume_id);
          const newUrl = new URL(window.location.href);
          newUrl.searchParams.set('id', result.resume_id);
          window.history.replaceState({}, '', newUrl.toString());
        }
        toast.success(isUpdate ? 'Progress synced to cloud' : 'Resume saved to cloud dashboard');
      } else {
        const error = new Error(result.detail || `Server error (${response.status})`);
        (error as any).details = result.detail;
        (error as any).status = response.status;
        throw error;
      }
    } catch (e: any) {
      console.error('Save error:', e);
      let errorMsg = e.message || 'Server error';
      
      // Use details if present (populated by handleSave from result.detail)
      const details = e.details || (Array.isArray(e.message) ? e.message : null);
      
      if (details && Array.isArray(details)) {
        errorMsg = details.map((err: any) => {
          const field = err.loc ? err.loc.join('.') : 'unknown';
          return `${field}: ${err.msg}`;
        }).join(', ');
      } else if (typeof details === 'object' && details !== null) {
        errorMsg = JSON.stringify(details);
      }
      
      toast.error(`Save failed: ${errorMsg}. Progress kept locally.`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyForWord = async () => {
    if (!previewRef.current) return;
    try {
      // Use the modern Clipboard API to copy as HTML
      const blob = new Blob([previewRef.current.innerHTML], { type: 'text/html' });
      const data = [new ClipboardItem({ 'text/html': blob })];
      await navigator.clipboard.write(data);
      toast.success('Resume copied! Just paste (Ctrl+V) into Word.');
    } catch (err) {
      console.error('Copy failed:', err);
      toast.error('Copy failed - please try downloading instead');
    }
  };

  // --- Export helpers: clean, null-safe resume document builders ---

  const cleanVal = (v: unknown): string => (v == null ? '' : String(v)).trim();
  const cleanArr = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);
  const escapeHtml = (v: unknown): string =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // Derived section order that ALWAYS keeps 'custom' last, even when the
  // stored order predates the custom-section feature.
  const effectiveSectionOrder = useMemo<string[]>(() => {
    const order = Array.isArray(data.sectionOrder) ? [...data.sectionOrder] : [...INITIAL_DATA.sectionOrder];
    const customIdx = order.indexOf('custom');
    if (customIdx !== -1) order.splice(customIdx, 1);
    order.push('custom');
    return order;
  }, [data.sectionOrder]);

  // True when a custom section has anything to show (title or a non-empty bullet)
  const hasCustomContent = (cs: any): boolean =>
    !!cleanVal(cs?.title) || cleanArr(cs?.items).some((i: any) => !!cleanVal(i));

  const customDocxHtml = (): string => {
    const body = cleanArr(data.customSections)
      .filter(hasCustomContent)
      .map((cs: any) => {
        const items = cleanArr(cs.items).map(cleanVal).filter(Boolean);
        const title = cleanVal(cs.title) || 'Additional Information';
        let html = `<h3>${escapeHtml(title)}</h3>`;
        if (items.length) html += `<ul>${items.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
        return html;
      })
      .join('');
    return body;
  };

  const sectionDocxHtml = (sectionId: string): string => {
    switch (sectionId) {
      case 'summary':
        return cleanVal(data.summary)
          ? `<h3>Profile</h3><p>${escapeHtml(cleanVal(data.summary))}</p>`
          : '';
      case 'skills': {
        const skills = cleanArr(data.skills).map(cleanVal).filter(Boolean);
        return skills.length
          ? `<h3>Expertise</h3><p>${skills.map(escapeHtml).join(' &bull; ')}</p>`
          : '';
      }
      case 'experience': {
        const exps = cleanArr(data.experience).filter((e: any) => cleanVal(e?.title) || cleanVal(e?.company));
        if (!exps.length) return '';
        const body = exps
          .map((exp: any) => {
            const title = cleanVal(exp.title);
            const company = cleanVal(exp.company);
            const duration = cleanVal(exp.duration);
            const bullets = cleanArr(exp.description).map(cleanVal).filter(Boolean);
            const head = [title && `<b>${escapeHtml(title)}</b>`, company && escapeHtml(company)]
              .filter(Boolean)
              .join(' &mdash; ');
            let html = `<h4>${head}${duration ? ` <span class="right">${escapeHtml(duration)}</span>` : ''}</h4>`;
            if (bullets.length) html += `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
            return html;
          })
          .join('');
        return `<h3>Experience</h3>${body}`;
      }
      case 'education': {
        const edus = cleanArr(data.education).filter((e: any) => cleanVal(e?.degree));
        if (!edus.length) return '';
        const body = edus
          .map((edu: any) => {
            const degree = `<b>${escapeHtml(cleanVal(edu.degree))}</b>`;
            const institution = cleanVal(edu.institution) ? ` &mdash; ${escapeHtml(edu.institution)}` : '';
            const year = cleanVal(edu.year) ? ` <span class="right">${escapeHtml(edu.year)}</span>` : '';
            return `<p>${degree}${institution}${year}</p>`;
          })
          .join('');
        return `<h3>Education</h3>${body}`;
      }
      case 'projects': {
        const projects = cleanArr(data.projects).filter((p: any) => cleanVal(p?.title));
        if (!projects.length) return '';
        const body = projects
          .map((proj: any) => {
            const title = `<b>${escapeHtml(cleanVal(proj.title))}</b>`;
            const link = cleanVal(proj.link) ? ` <span class="link">${escapeHtml(proj.link)}</span>` : '';
            const desc = cleanVal(proj.description) ? `<p>${escapeHtml(proj.description)}</p>` : '';
            return `<h4>${title}${link}</h4>${desc}`;
          })
          .join('');
        return `<h3>Projects</h3>${body}`;
      }
      case 'certifications': {
        const certs = cleanArr(data.certifications).filter((c: any) => cleanVal(c?.name));
        if (!certs.length) return '';
        const body = certs
          .map((cert: any) => {
            const name = `<b>${escapeHtml(cleanVal(cert.name))}</b>`;
            const year = cleanVal(cert.year) ? ` <span class="right">${escapeHtml(cert.year)}</span>` : '';
            return `<p>${name}${year}</p>`;
          })
          .join('');
        return `<h3>Certifications</h3>${body}`;
      }
      case 'languages': {
        const langs = cleanArr(data.languages).filter((l: any) => cleanVal(l?.language));
        if (!langs.length) return '';
        const body = langs
          .map((lang: any) => {
            const name = `<b>${escapeHtml(cleanVal(lang.language))}</b>`;
            const prof = cleanVal(lang.proficiency) ? ` &mdash; ${escapeHtml(lang.proficiency)}` : '';
            return `<p>${name}${prof}</p>`;
          })
          .join('');
        return `<h3>Languages</h3>${body}`;
      }
      case 'achievements': {
        const items = cleanArr(data.achievements).filter((a: any) => cleanVal(a?.title) || cleanVal(a?.description));
        if (!items.length) return '';
        const body = items
          .map((ach: any) => {
            const title = cleanVal(ach.title) ? `<h4>${escapeHtml(ach.title)}</h4>` : '';
            const desc = cleanVal(ach.description) ? `<p>${escapeHtml(ach.description)}</p>` : '';
            return `${title}${desc}`;
          })
          .join('');
        return `<h3>Highlights</h3>${body}`;
      }
      case 'internships': {
        const ints = cleanArr(data.internships).filter((i: any) => cleanVal(i?.role));
        if (!ints.length) return '';
        const body = ints
          .map((int: any) => {
            const role = `<b>${escapeHtml(cleanVal(int.role))}</b>`;
            const company = cleanVal(int.company) ? ` &mdash; ${escapeHtml(int.company)}` : '';
            const bullets = cleanArr(int.description).map(cleanVal).filter(Boolean);
            let html = `<h4>${role}${company}</h4>`;
            if (bullets.length) html += `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
            return html;
          })
          .join('');
        return `<h3>Internships</h3>${body}`;
      }
      case 'custom': {
        return customDocxHtml();
      }
      default:
        return '';
    }
  };

  const handleDownloadDocx = async () => {
    if (activeMode === 'tailored' && tailoredVersionId) {
      toast.info('Downloading tailored Word file...');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("No session");
        const res = await fetch(`${backendUrl}/api/agents/resume/version/${tailoredVersionId}/download`, {
          headers: { "Authorization": `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error("Download failed");
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `tailored-resume-${new Date().toISOString().slice(0, 10)}.docx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast.success('Tailored Word file downloaded!');
      } catch (e) {
        console.error('Tailored DOCX download failed', e);
        toast.error('Download failed - please try one more time');
      }
      return;
    }
    if (!previewRef.current) return;
    toast.info('Generating compatible Word file...');

    const name = cleanVal(data.fullName);
    const contacts = [cleanVal(data.email), cleanVal(data.phone)].filter(Boolean);
    const headerBlock = name ? `<h2>${escapeHtml(name)}</h2>` : '';
    const contactBlock = contacts.length ? `<p>${contacts.map(escapeHtml).join(' &bull; ')}</p>` : '';
    const sections = effectiveSectionOrder.map(sectionDocxHtml).filter(Boolean).join('');

    const source =
      `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>` +
      `<head><meta charset='utf-8'><title>Resume</title>` +
      `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->` +
      `<style>` +
      `body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.4; color: #0f172a; }` +
      `h2 { font-size: 28pt; margin: 0 0 4pt; color: #0f172a; text-transform: uppercase; }` +
      `h3 { font-size: 14pt; color: #4f46e5; border-bottom: 1px solid #e1e4e8; padding-bottom: 2pt; text-transform: uppercase; }` +
      `h4 { font-size: 12pt; margin: 10pt 0 2pt; }` +
      `p, li { font-size: 11pt; }` +
      `.right { float: right; }` +
      `.link { color: #4f46e5; }` +
      `</style></head><body>` +
      headerBlock + contactBlock + sections +
      `</body></html>`;

    const blob = new Blob(['\ufeff', source], { type: 'application/msword' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(cleanVal(data.fullName) || 'Resume').replace(/[^a-z0-9]/gi, '_')}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Word file downloaded!');
  };

  const handleDownloadPDF = async () => {
    toast.info('Generating high-fidelity PDF...');

    try {
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      type PdfSettings = {
        mx: number; my: number; bar: number; afterBar: number;
        name: number; contact: number; headerAfter: number;
        section: number; ruleGap: number;
        body: number; gap: number; sectionPad: number;
        head: number; headLine: number; company: number; companyGap: number; itemPad: number;
        bullet: number; bulletGap: number;
      };

      const layouts: Record<'normal' | 'compact', PdfSettings> = {
        normal: {
          mx: 18, my: 18, bar: 4, afterBar: 10,
          name: 22, contact: 9, headerAfter: 7,
          section: 11, ruleGap: 6,
          body: 10, gap: 1.8, sectionPad: 4,
          head: 11, headLine: 0.5, company: 9.5, companyGap: 4.6, itemPad: 3,
          bullet: 10, bulletGap: 4.2,
        },
        compact: {
          mx: 14, my: 11, bar: 3, afterBar: 7,
          name: 17, contact: 8.5, headerAfter: 5,
          section: 10, ruleGap: 5,
          body: 8.5, gap: 1.4, sectionPad: 2.5,
          head: 10, headLine: 0.3, company: 9, companyGap: 3.8, itemPad: 2,
          bullet: 8.5, bulletGap: 3.4,
        },
      };

      // Renders the whole resume into `doc`. When `paint` is false it only
      // simulates layout (identical math, no drawing) so we can measure page count.
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
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(size);
          return doc.splitTextToSize(text, width) as string[];
        };

        const draw = (lines: string | string[], size: number, color: [number, number, number], style: 'normal' | 'bold' | 'italic', lineGap: number, indent = 0) => {
          if (paint) {
            doc.setFont('helvetica', style);
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
          ensure(10, 16); // keep the title together with the first block of content
          if (paint) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(st.section);
            doc.setTextColor(79, 70, 229);
            doc.text(title.toUpperCase(), st.mx, y);
          }
          y += 1.5;
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
            ensure(h + 1); // never split a single bullet across pages
            lines.forEach((ln, li) => {
              if (paint) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(st.bullet);
                doc.setTextColor(71, 85, 105);
                if (li === 0) doc.text('•', st.mx + 1, y);
                doc.text(ln, st.mx + 5, y);
              }
              y += st.bulletGap;
            });
          });
        };

        // Accent bar
        if (paint) {
          doc.setFillColor(79, 70, 229);
          doc.rect(0, 0, pageW, st.bar, 'F');
        }
        y = st.my + st.bar + st.afterBar;

        // Header (only non-empty values)
        const name = cleanVal(data.fullName);
        if (name) {
          ensure(14);
          draw(name.toUpperCase(), st.name, [15, 23, 42], 'bold', 2);
          y += 4;
        }
        const contacts = [cleanVal(data.email), cleanVal(data.phone)].filter(Boolean);
        if (contacts.length) {
          ensure(8);
          draw(contacts.join('   •   '), st.contact, [100, 116, 139], 'bold', 2);
          y += 2;
        }
        if (paint) {
          doc.setDrawColor(241, 245, 249);
          doc.line(st.mx, y, pageW - st.mx, y);
        }
        y += st.headerAfter;

        // Sections (only render non-empty ones — no null/placeholder values)
        const renderSection = (sectionId: string) => {
          switch (sectionId) {
            case 'summary': {
              const text = cleanVal(data.summary);
              if (!text) return;
              sectionTitle('Profile');
              draw(wrap(text, st.body), st.body, [71, 85, 105], 'normal', st.gap);
              y += st.sectionPad;
              return;
            }
            case 'skills': {
              const skills = cleanArr(data.skills).map(cleanVal).filter(Boolean);
              if (!skills.length) return;
              sectionTitle('Expertise');
              draw(wrap(skills.join('  •  '), st.body), st.body, [71, 85, 105], 'normal', st.gap);
              y += st.sectionPad;
              return;
            }
            case 'experience': {
              const exps = cleanArr(data.experience).filter((e: any) => cleanVal(e?.title) || cleanVal(e?.company));
              if (!exps.length) return;
              sectionTitle('Experience');
              exps.forEach((exp: any) => {
                const title = cleanVal(exp.title);
                const company = cleanVal(exp.company);
                const duration = cleanVal(exp.duration);
                const blist = cleanArr(exp.description).map(cleanVal).filter(Boolean);
                const firstBulletH = blist.length ? Math.max(1, wrap(blist[0], st.bullet, contentW - 6).length) * st.bulletGap : 6;
                ensure(12, Math.min(firstBulletH + 4, 18)); // keep header with its first bullet
                if (title) {
                  draw(title, st.head, [15, 23, 42], 'bold', st.headLine);
                  y += st.itemPad;
                }
                if (company || duration) {
                  ensure(8);
                  if (paint) {
                    if (company) {
                      doc.setFont('helvetica', 'italic');
                      doc.setFontSize(st.company);
                      doc.setTextColor(99, 102, 241);
                      doc.text(company, st.mx, y);
                    }
                    if (duration) {
                      doc.setFont('helvetica', 'normal');
                      doc.setFontSize(st.company);
                      doc.setTextColor(100, 116, 139);
                      doc.text(duration, pageW - st.mx, y, { align: 'right' });
                    }
                  }
                  y += st.companyGap;
                }
                bullets(blist);
                y += st.itemPad;
              });
              y += 2;
              return;
            }
            case 'education': {
              const edus = cleanArr(data.education).filter((e: any) => cleanVal(e?.degree));
              if (!edus.length) return;
              sectionTitle('Education');
              edus.forEach((edu: any) => {
                const degree = cleanVal(edu.degree);
                const institution = cleanVal(edu.institution);
                const year = cleanVal(edu.year);
                ensure(8, 6);
                if (degree) {
                  draw(degree, st.head - 0.5, [15, 23, 42], 'bold', st.headLine);
                  y += st.itemPad;
                }
                if (institution || year) {
                  ensure(8);
                  if (paint) {
                    if (institution) {
                      doc.setFont('helvetica', 'normal');
                      doc.setFontSize(st.body);
                      doc.setTextColor(71, 85, 105);
                      doc.text(institution, st.mx, y);
                    }
                    if (year) {
                      doc.setFont('helvetica', 'normal');
                      doc.setFontSize(st.body - 0.5);
                      doc.setTextColor(100, 116, 139);
                      doc.text(year, pageW - st.mx, y, { align: 'right' });
                    }
                  }
                  y += st.companyGap;
                }
                y += 1;
              });
              y += 2;
              return;
            }
            case 'projects': {
              const projects = cleanArr(data.projects).filter((p: any) => cleanVal(p?.title));
              if (!projects.length) return;
              sectionTitle('Projects');
              projects.forEach((proj: any) => {
                const title = cleanVal(proj.title);
                const link = cleanVal(proj.link);
                const desc = cleanVal(proj.description);
                ensure(9, 8);
                if (title) {
                  if (paint) {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(st.head - 0.5);
                    doc.setTextColor(15, 23, 42);
                    doc.text(title, st.mx, y);
                    if (link) {
                      doc.setFont('helvetica', 'normal');
                      doc.setFontSize(st.body - 1);
                      doc.setTextColor(79, 70, 229);
                      doc.text(link, pageW - st.mx, y, { align: 'right' });
                    }
                  }
                  y += st.companyGap;
                }
                if (desc) {
                  draw(wrap(desc, st.body), st.body, [71, 85, 105], 'normal', st.gap);
                  y += 2;
                }
                y += 2;
              });
              y += 2;
              return;
            }
            case 'certifications': {
              const certs = cleanArr(data.certifications).filter((c: any) => cleanVal(c?.name));
              if (!certs.length) return;
              sectionTitle('Certifications');
              certs.forEach((cert: any) => {
                const cname = cleanVal(cert.name);
                const year = cleanVal(cert.year);
                ensure(8);
                if (cname) {
                  if (paint) {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(st.head - 0.5);
                    doc.setTextColor(15, 23, 42);
                    doc.text(cname, st.mx, y);
                    if (year) {
                      doc.setFont('helvetica', 'normal');
                      doc.setFontSize(st.body - 0.5);
                      doc.setTextColor(100, 116, 139);
                      doc.text(year, pageW - st.mx, y, { align: 'right' });
                    }
                  }
                  y += st.companyGap;
                }
                y += 1;
              });
              y += 2;
              return;
            }
            case 'languages': {
              const langs = cleanArr(data.languages).filter((l: any) => cleanVal(l?.language));
              if (!langs.length) return;
              sectionTitle('Languages');
              langs.forEach((lang: any) => {
                const lname = cleanVal(lang.language);
                const prof = cleanVal(lang.proficiency);
                ensure(8);
                if (lname) {
                  if (paint) {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(st.head - 0.5);
                    doc.setTextColor(15, 23, 42);
                    doc.text(lname, st.mx, y);
                    if (prof) {
                      doc.setFont('helvetica', 'normal');
                      doc.setFontSize(st.body - 0.5);
                      doc.setTextColor(79, 70, 229);
                      doc.text(`• ${prof}`, pageW - st.mx, y, { align: 'right' });
                    }
                  }
                  y += st.companyGap;
                }
              });
              y += 2;
              return;
            }
            case 'achievements': {
              const items = cleanArr(data.achievements).filter((a: any) => cleanVal(a?.title) || cleanVal(a?.description));
              if (!items.length) return;
              sectionTitle('Highlights');
              items.forEach((ach: any) => {
                const title = cleanVal(ach.title);
                const desc = cleanVal(ach.description);
                ensure(9, 8);
                if (title) {
                  draw(title, st.head - 0.5, [15, 23, 42], 'bold', st.headLine);
                  y += st.itemPad;
                }
                if (desc) {
                  draw(wrap(desc, st.body), st.body, [71, 85, 105], 'normal', st.gap);
                  y += 2;
                }
                y += 2;
              });
              y += 2;
              return;
            }
            case 'internships': {
              const ints = cleanArr(data.internships).filter((i: any) => cleanVal(i?.role));
              if (!ints.length) return;
              sectionTitle('Internships');
              ints.forEach((int: any) => {
                const role = cleanVal(int.role);
                const company = cleanVal(int.company);
                const blist = cleanArr(int.description).map(cleanVal).filter(Boolean);
                const firstBulletH = blist.length ? Math.max(1, wrap(blist[0], st.bullet, contentW - 6).length) * st.bulletGap : 6;
                ensure(9, Math.min(firstBulletH + 4, 18));
                if (role || company) {
                  if (paint) {
                    if (role) {
                      doc.setFont('helvetica', 'bold');
                      doc.setFontSize(st.head - 0.5);
                      doc.setTextColor(15, 23, 42);
                      doc.text(role, st.mx, y);
                    }
                    if (company) {
                      doc.setFont('helvetica', 'italic');
                      doc.setFontSize(st.company);
                      doc.setTextColor(99, 102, 241);
                      doc.text(company, st.mx + (role ? doc.getTextWidth(role) + 5 : 0), y);
                    }
                  }
                  y += st.companyGap;
                }
                bullets(blist);
                y += st.itemPad;
              });
              y += 2;
              return;
            }
            case 'custom': {
              const customs = cleanArr(data.customSections).filter(hasCustomContent);
              if (!customs.length) return;
              customs.forEach((cs: any) => {
                const items = cleanArr(cs.items).map(cleanVal).filter(Boolean);
                if (!items.length) return;
                sectionTitle(cleanVal(cs.title) || 'Additional Information');
                bullets(items);
                y += st.sectionPad;
              });
              return;
            }
            default:
              return;
          }
        };

        effectiveSectionOrder.forEach(renderSection);
        return pages;
      };

      const probe = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

      // Scale every numeric layout setting by `s` so one pass can shrink the
      // whole page proportionally (fonts, margins, spacing) to force a fit.
      const scaleSettings = (base: PdfSettings, s: number): PdfSettings => {
        const out = {} as PdfSettings;
        (Object.keys(base) as (keyof PdfSettings)[]).forEach((k) => {
          out[k] = base[k] * s;
        });
        return out;
      };

      const pageCount = (st: PdfSettings) => renderLayout(probe, st, false);

      // Fit to exactly one page: try the full-size layout first, then compact,
      // then progressively shrink compact (down to ~0.75x) until it fits.
      const chosen = (() => {
        if (pageCount(layouts.normal) === 1) return layouts.normal;
        if (pageCount(layouts.compact) === 1) return layouts.compact;
        const MIN_SCALE = 0.75;
        let lo = MIN_SCALE;
        let hi = 1;
        let best = layouts.compact;
        for (let i = 0; i < 8; i += 1) {
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

      renderLayout(pdf, chosen, true);
      pdf.save(`${(cleanVal(data.fullName) || 'Resume').replace(/[^a-z0-9]/gi, '_')}.pdf`);
      toast.success('Resume downloaded successfully!');
    } catch (e) {
      console.error('PDF Error:', e);
      toast.error('Export failed - please try one more time');
    }
  };

  const handleReimport = async () => {
    if (!resumeId) return;
    try {
      const { data: resume, error } = await supabase.from('resumes').select('parsed_data').eq('id', resumeId).single();
      if (resume?.parsed_data && !error) {
        const originalData = typeof resume.parsed_data === 'string' ? JSON.parse(resume.parsed_data) : resume.parsed_data;
        setData({ ...INITIAL_DATA, ...originalData });
        if (originalData.targetRole || originalData.target_role) {
          setDiscovery(prev => ({ ...prev, role: originalData.targetRole || originalData.target_role }));
        }
        toast.success('Fields reset to original resume data');
      } else {
        toast.error('No stored resume data found to import');
      }
    } catch (e) {
      toast.error('Failed to re-import data');
    }
  };

  const handleDeleteDraft = async () => {
    if (!resumeId && !data.fullName) {
      // Nothing to delete
      router.push('/dashboard');
      return;
    }

    const confirmed = window.confirm("Are you sure? This will permanently delete this resume draft and all related analysis.");
    if (!confirmed) return;

    setIsSaving(true);
    try {
      if (resumeId && user?.id !== 'guest') {
        const { error } = await supabase.from('resumes').delete().eq('id', resumeId);
        if (error) throw error;
      }

      // Clear local caches and state IMMEDIATELY
      localStorage.removeItem('resumatch_builder_data');
      sessionStorage.removeItem('resumatch_builder_session');
      try { localStorage.removeItem('resumatch_tailored_mode'); } catch { /* ignore */ }
      secureRemove(localStorage, 'resumatch_tailored_data');
      setResumeId(null);
      setData({ ...INITIAL_DATA });
      
      toast.success('Draft deleted successfully');
      router.replace('/dashboard');
    } catch (e: any) {
      console.error('Delete failed:', e);
      toast.error('Failed to delete draft');
    } finally {
      setIsSaving(false);
    }
  };

  const renderResumeSection = (sectionId: string) => {
    switch (sectionId) {
      case 'summary':
        return (
          <section className="space-y-2 md:space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] md:text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Profile</h3>
              <div className="h-px bg-indigo-50 flex-1" />
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px] md:text-[13px] font-medium">{data.summary || "Add a summary to see the magic..."}</p>
          </section>
        );
      case 'skills':
        return (data.skills || []).length > 0 && (
          <section className="space-y-2 md:space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] md:text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Expertise</h3>
              <div className="h-px bg-indigo-50 flex-1" />
            </div>
            <div className="flex flex-wrap gap-1.5 md:gap-2">
              {(data.skills || []).map((s: string, i: number) => (
                <span key={i} className="text-[9px] md:text-[11px] font-bold text-slate-700 bg-slate-50 px-1.5 md:px-2 py-0.5 md:py-1 rounded border border-slate-100">{s}</span>
              ))}
            </div>
          </section>
        );
      case 'experience':
        return (data.experience || []).some(e => e.title) && (
          <section className="space-y-4 md:space-y-6">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] md:text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Experience</h3>
              <div className="h-px bg-indigo-50 flex-1" />
            </div>
            <div className="space-y-6 md:space-y-8">
              {(data.experience || []).map((exp, i) => exp.title && (
                <div key={i} className="space-y-2 md:space-y-3 relative">
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5">
                      <h4 className="text-[13px] md:text-[15px] font-extrabold text-slate-900">{exp.title}</h4>
                      <div className="text-[10px] md:text-[12px] font-bold text-indigo-500 uppercase tracking-wider">{exp.company}</div>
                    </div>
                    {exp.duration && <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-1.5 md:px-2 py-0.5 md:py-1 rounded">{exp.duration}</span>}
                  </div>
                  <ul className="list-none space-y-1.5 md:space-y-2">
                    {(exp.description || []).map((b, bi) => b.trim() && (
                      <li key={bi} className="text-[10px] md:text-[12px] text-slate-600 leading-normal flex gap-2 md:gap-3">
                        <span className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-indigo-200 mt-1 md:mt-1.5 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      case 'education':
        return (data.education || []).some(e => e.degree) && (
          <section className="space-y-3 md:space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] md:text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Education</h3>
              <div className="h-px bg-indigo-50 flex-1" />
            </div>
            <div className="grid grid-cols-1 gap-4 md:gap-6">
              {(data.education || []).map((edu, i) => edu.degree && (
                <div key={i} className="flex justify-between items-start">
                  <div>
                    <h4 className="text-[12px] md:text-[14px] font-bold text-slate-800">{edu.degree}</h4>
                    <p className="text-[10px] md:text-[12px] text-slate-400 font-medium">{edu.institution}</p>
                  </div>
                  <span className="text-[8px] md:text-[10px] font-bold text-slate-300 uppercase tracking-widest">{edu.year}</span>
                </div>
              ))}
            </div>
          </section>
        );
      case 'projects':
        return (data.projects || []).some(p => p.title) && (
          <section className="space-y-3 md:space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] md:text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Projects</h3>
              <div className="h-px bg-indigo-50 flex-1" />
            </div>
            {(data.projects || []).map((proj, i) => proj.title && (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-[12px] md:text-[14px] font-bold text-slate-800">{proj.title}</h4>
                  {proj.link && <span className="text-[8px] text-indigo-500 font-bold uppercase">{proj.link}</span>}
                </div>
                <p className="text-[10px] md:text-[12px] text-slate-600 leading-relaxed">{proj.description}</p>
              </div>
            ))}
          </section>
        );
      case 'certifications':
        return (data.certifications || []).length > 0 && (
          <section className="space-y-3 md:space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] md:text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Certifications</h3>
              <div className="h-px bg-indigo-50 flex-1" />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2">
              {(data.certifications || []).map((cert, i) => (
                <div key={i} className="flex justify-between items-center text-[10px] md:text-[12px]">
                  <span className="font-bold text-slate-800">{cert.name}</span>
                  <span className="text-slate-400 uppercase text-[8px]">{cert.year}</span>
                </div>
              ))}
            </div>
          </section>
        );
      case 'languages':
        return (data.languages || []).length > 0 && (
          <section className="space-y-3 md:space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] md:text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Languages</h3>
              <div className="h-px bg-indigo-50 flex-1" />
            </div>
            <div className="flex flex-wrap gap-4">
              {(data.languages || []).map((lang, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-[10px] md:text-[12px] font-bold text-slate-800">{lang.language}</span>
                  <span className="text-[8px] text-indigo-400 font-bold uppercase">• {lang.proficiency}</span>
                </div>
              ))}
            </div>
          </section>
        );
      case 'achievements':
        return (data.achievements || []).length > 0 && (
          <section className="space-y-3 md:space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] md:text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Highlights</h3>
              <div className="h-px bg-indigo-50 flex-1" />
            </div>
            {(data.achievements || []).map((ach, i) => (
              <div key={i} className="space-y-1">
                <h4 className="text-[11px] md:text-[13px] font-bold text-slate-800">{ach.title}</h4>
                <p className="text-[10px] md:text-[12px] text-slate-600">{ach.description}</p>
              </div>
            ))}
          </section>
        );
      case 'internships':
        return (data.internships || []).some(inr => inr.role) && (
          <section className="space-y-4 md:space-y-6">
            <div className="flex items-center gap-3">
              <h3 className="text-[10px] md:text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Internships</h3>
              <div className="h-px bg-indigo-50 flex-1" />
            </div>
            <div className="space-y-4">
              {(data.internships || []).map((int, i) => int.role && (
                <div key={i} className="space-y-2 relative">
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5">
                      <h4 className="text-[13px] font-extrabold text-slate-900">{int.role}</h4>
                      <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">{int.company}</div>
                    </div>
                  </div>
                  <ul className="list-none space-y-1.5">
                    {(int.description || []).map((b, bi) => b.trim() && (
                      <li key={bi} className="text-[10px] text-slate-600 leading-normal flex gap-2">
                        <span className="w-1 h-1 rounded-full bg-indigo-200 mt-1.5 flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        );
      case 'custom':
        return (data.customSections || []).some(hasCustomContent) && (
          <section className="space-y-4 md:space-y-6">
            {(data.customSections || []).map((cs, ci) => hasCustomContent(cs) && (
              <div key={ci} className="space-y-2 md:space-y-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-[10px] md:text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">{cs.title || 'Additional Information'}</h3>
                  <div className="h-px bg-indigo-50 flex-1" />
                </div>
                <ul className="list-none space-y-1.5 md:space-y-2">
                  {(cs.items || []).map((item, bi) => item.trim() && (
                    <li key={bi} className="text-[10px] md:text-[12px] text-slate-600 leading-normal flex gap-2 md:gap-3">
                      <span className="w-1 md:w-1.5 h-1 md:h-1.5 rounded-full bg-indigo-200 mt-1 md:mt-1.5 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      default:
        return null;
    }
  };

  // --- Render Helpers ---
  const steps = [
    { id: 1, name: 'Personal', icon: User, desc: 'Your name, contact details and a high-impact summary.' },
    { id: 2, name: 'Skills', icon: List, desc: 'Core skills and expertise that match your target role.' },
    { id: 3, name: 'Experience', icon: Briefcase, desc: 'Work history with achievement-driven bullet points.' },
    { id: 4, name: 'Education', icon: GraduationCap, desc: 'Degrees, institutions and graduation years.' },
    { id: 5, name: 'Projects', icon: Wand2, desc: 'Hands-on projects that showcase your real-world impact.' },
    { id: 6, name: 'Certifications', icon: Badge, desc: 'Professional certifications and credentials.' },
    { id: 7, name: 'Languages', icon: List, desc: 'Languages you speak and your proficiency level.' },
    { id: 8, name: 'Achievements', icon: Sparkles, desc: 'Awards, recognitions and standout wins.' },
    { id: 9, name: 'Internships', icon: Briefcase, desc: 'Internships and early-career experience.' },
    { id: 10, name: 'Custom', icon: FilePlus2, desc: 'Your own custom sections — anything you want to add.' }
  ];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--bg-surface)] md:flex-row">
      {/* --- Left Panel: Editor --- */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg-base)] md:border-r md:border-[var(--border-soft)] xl:max-w-[640px]">
        {/* Default / Tailored toggle bar (above the header) */}
        <div className="shrink-0 border-b border-[var(--border-soft)] bg-gradient-to-r from-indigo-50/80 via-white/90 to-indigo-50/80 px-3 py-2 backdrop-blur-xl sm:px-5 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-subtle)] sm:text-[11px]">
              <Settings className="h-3 w-3 text-indigo-600" />
              Resume Version
            </span>
            <div className="flex shrink-0 items-center rounded-full bg-white p-1 shadow-sm ring-1 ring-[var(--border-soft)]">
              <button
                type="button"
                onClick={switchToDefault}
                className={`flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[11px] font-semibold transition-all sm:h-8 sm:px-4 sm:text-xs ${
                  activeMode === 'default'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Check className="h-3 w-3" aria-hidden />
                Default
              </button>
              <button
                type="button"
                onClick={() => loadTailoredVersion()}
                disabled={isLoadingTailored || !resumeId}
                className={`flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[11px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:px-4 sm:text-xs ${
                  activeMode === 'tailored'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-indigo-600'
                }`}
              >
                {isLoadingTailored ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" aria-hidden />
                )}
                Tailored
              </button>
            </div>
          </div>
        </div>
        <header className="sticky top-0 z-20 shrink-0 border-b border-[var(--border-soft)] bg-white/80 backdrop-blur-xl">
          <div className="flex items-center gap-2 px-3 py-2.5 sm:px-5 sm:py-3 lg:px-8">
            {/* Back */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              aria-label="Go back"
              className="h-9 w-9 shrink-0 rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            {/* Title + target role */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-sm sm:h-8 sm:w-8">
                  <FileText className="h-4 w-4" />
                </div>
                <h1 className="truncate text-sm font-semibold leading-none tracking-tight text-[var(--text-primary)] sm:text-base">
                  Resume Builder
                </h1>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newRole = prompt("Enter your target role:", discovery.role);
                  if (newRole !== null) setDiscovery({ ...discovery, role: newRole });
                }}
                title="Edit target role"
                className="group mt-1.5 flex max-w-full items-center gap-1.5 sm:max-w-[300px]"
              >
                <Target className="h-3 w-3 shrink-0 text-indigo-600" />
                <span className="truncate text-[11px] font-medium text-[var(--text-muted)] transition-colors group-hover:text-indigo-600 sm:text-xs">
                  Target: <span className="font-semibold text-indigo-600">{discovery.role || 'Set role'}</span>
                </span>
                <Wand2 className="h-3 w-3 shrink-0 text-[var(--text-subtle)] transition-colors group-hover:text-indigo-500" />
              </button>
            </div>

            {/* Desktop secondary actions */}
            <div className="hidden shrink-0 items-center gap-1 md:flex">
              <Button variant="ghost" size="icon" onClick={handleCopyForWord} title="Copy for Word" className="h-9 w-9 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-indigo-600">
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDownloadDocx} title="Export Word (.doc)" className="h-9 w-9 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-indigo-600">
                <FileDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleReimport} title="Restore original data" className="h-9 w-9 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-indigo-600">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDeleteDraft} title="Delete draft" className="h-9 w-9 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500">
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="mx-1 h-6 w-px bg-[var(--border-soft)]" />
            </div>

            {/* Mobile actions sheet */}
            <div className="shrink-0 md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More actions" className="h-9 w-9 rounded-lg text-[var(--text-muted)]">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-3xl border-t-[var(--border-soft)] px-5 pb-8 pt-6">
                  <SheetHeader className="mb-4 text-left">
                    <SheetTitle className="text-base font-semibold text-[var(--text-primary)]">Builder actions</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-4">
                    <div className="flex items-center rounded-xl bg-[var(--bg-muted)] p-1">
                      <button
                        type="button"
                        onClick={switchToDefault}
                        className={`h-10 flex-1 rounded-lg text-xs font-semibold transition-all ${
                          activeMode === 'default'
                            ? 'bg-white text-[var(--text-primary)] shadow-sm'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        Default
                      </button>
                      <button
                        type="button"
                        onClick={() => loadTailoredVersion()}
                        disabled={isLoadingTailored || !resumeId}
                        className={`h-10 flex-1 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 ${
                          activeMode === 'tailored'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {isLoadingTailored && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                        Tailored
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <Button variant="outline" onClick={handleReimport} className="h-11 justify-start gap-2.5 rounded-lg border-[var(--border-soft)] text-[var(--text-muted)]">
                        <RefreshCw className="h-4 w-4 text-indigo-600" /> Restore Original
                      </Button>
                      <Button variant="outline" onClick={handleCopyForWord} className="h-11 justify-start gap-2.5 rounded-lg border-[var(--border-soft)] text-[var(--text-muted)]">
                        <Copy className="h-4 w-4 text-[var(--text-subtle)]" /> Copy Content
                      </Button>
                      <Button variant="outline" onClick={handleDownloadDocx} className="h-11 justify-start gap-2.5 rounded-lg border-[var(--border-soft)] text-[var(--text-muted)]">
                        <FileDown className="h-4 w-4 text-[var(--text-subtle)]" /> Export Word
                      </Button>
                      <Button variant="outline" onClick={handleDeleteDraft} className="h-11 justify-start gap-2.5 rounded-lg border-danger-200 text-danger-500 hover:bg-danger-50">
                        <Trash2 className="h-4 w-4" /> Delete Draft
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            {/* Save */}
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={isSaving}
              className="h-9 shrink-0 rounded-lg border-[var(--border-soft)] px-2.5 font-medium text-[var(--text-muted)] hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 sm:h-10 sm:px-4"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : <Save className="h-4 w-4 text-indigo-600" />}
              <span className="ml-1.5 hidden md:inline">Save</span>
            </Button>

            {/* Download PDF */}
            <Button
              onClick={handleDownloadPDF}
              className="h-9 shrink-0 rounded-lg bg-indigo-600 px-2.5 text-white shadow-sm hover:bg-indigo-800 active:scale-[0.98] sm:h-10 sm:px-4"
            >
              <Download className="h-4 w-4" />
              <span className="ml-1.5 hidden font-semibold md:inline">PDF</span>
            </Button>
          </div>
        </header>
        <div className="shrink-0 border-b border-[var(--border-soft)] bg-white/60 px-3 py-2.5 backdrop-blur sm:px-5 sm:py-3 lg:px-8">
          <div className="flex items-stretch gap-4 sm:gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-0.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {steps.map((s) => {
                  const isActive = step === s.id;
                  const isDone = s.id < step;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStep(s.id)}
                      aria-current={isActive ? 'step' : undefined}
                      className={`group flex items-center gap-1.5 whitespace-nowrap rounded-full px-1.5 py-1.5 transition-all sm:gap-2 sm:px-2.5 ${
                        isActive ? 'bg-indigo-50' : 'hover:bg-[var(--bg-muted)]'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all sm:h-7 sm:w-7 sm:text-xs ${
                          isDone
                            ? 'bg-indigo-600 text-white'
                            : isActive
                              ? 'bg-indigo-600 text-white shadow-[0_0_0_3px_rgba(79,70,229,0.15)]'
                              : 'bg-[var(--bg-muted)] text-[var(--text-subtle)]'
                        }`}
                      >
                        {isDone ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                      </span>
                      <span
                        className={`text-[11px] font-semibold sm:text-xs ${
                          isActive ? 'text-indigo-700' : isDone ? 'text-[var(--text-primary)]' : 'text-[var(--text-subtle)]'
                        }`}
                      >
                        {s.name}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Progress value={(step / steps.length) * 100} className="h-1.5 flex-1" />
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-[var(--text-subtle)]">
                  {step} of {steps.length}
                </span>
              </div>
            </div>

            {originalScore !== null && (
              <div className="hidden shrink-0 items-center gap-3 border-l border-[var(--border-soft)] pl-4 md:flex sm:pl-6">
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-subtle)]">Initial</p>
                  <p className="text-sm font-bold tabular-nums text-[var(--text-subtle)]">{originalScore}</p>
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600">
                  <ChevronRight className="h-4 w-4" />
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-accent-700">Optimized</p>
                  <p className="flex items-center gap-1.5 text-base font-bold tabular-nums text-indigo-700">
                    {currentScore || 85}
                    {currentScore > originalScore && (
                      <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-bold text-accent-700">
                        +{currentScore - originalScore}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            {(() => {
              const s = steps.find((x) => x.id === step);
              if (!s) return null;
              return (
                <div className="mb-6 sm:mb-8">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-sm sm:h-11 sm:w-11">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-xl">
                        {s.name}
                      </h2>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)] sm:text-sm">{s.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5 sm:space-y-6"
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-sm font-medium text-[var(--text-primary)]">Full Name</label>
                      <Input
                        value={data.fullName}
                        onChange={(e) => setData({ ...data, fullName: e.target.value })}
                        placeholder="Jane Doe"
                        className="h-11 rounded-lg border-[var(--border-soft)] focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30 sm:h-12"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-[var(--text-primary)]">Email Address</label>
                      <Input
                        type="email"
                        value={data.email}
                        onChange={(e) => setData({ ...data, email: e.target.value })}
                        placeholder="jane@example.com"
                        className="h-11 rounded-lg border-[var(--border-soft)] focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30 sm:h-12"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-[var(--text-primary)]">Phone Number</label>
                      <Input
                        type="tel"
                        value={data.phone}
                        onChange={(e) => setData({ ...data, phone: e.target.value })}
                        placeholder="+1 234 567 890"
                        className="h-11 rounded-lg border-[var(--border-soft)] focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30 sm:h-12"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-medium text-[var(--text-primary)]">Professional Summary</label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateSummary}
                        disabled={isOptimizing}
                        className="h-8 gap-1.5 rounded-lg border-indigo-200 bg-indigo-50 px-3 font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        {isOptimizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                        {isOptimizing ? 'Generating...' : 'AI Generate'}
                      </Button>
                    </div>
                    <Textarea
                      value={data.summary}
                      onChange={(e) => setData({ ...data, summary: e.target.value })}
                      placeholder="High-impact 3-sentence summary..."
                      className="min-h-[120px] rounded-lg border-[var(--border-soft)] resize-none focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30"
                    />
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 sm:space-y-6">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Skills & Expertise</label>
                    <div className="flex gap-2">
                      <Input
                        id="skill-input"
                        placeholder="e.g. React, Python, Product Management"
                        className="h-11 rounded-lg border-[var(--border-soft)] focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30 sm:h-12"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value;
                            if (val) {
                              setData({ ...data, skills: [...data.skills, val] });
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                      <Button
                        onClick={() => {
                          const el = document.getElementById('skill-input') as HTMLInputElement;
                          if (el.value) {
                            setData({ ...data, skills: [...data.skills, el.value] });
                            el.value = '';
                          }
                        }}
                        className="h-11 rounded-lg bg-indigo-600 px-6 font-semibold hover:bg-indigo-800 sm:h-12"
                      >
                        Add
                      </Button>
                    </div>
                    <p className="text-xs text-[var(--text-subtle)]">Press Enter to add a skill as a tag.</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(data.skills || []).map((s, i) => (
                        <div key={i} className="group flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 transition-colors hover:border-indigo-200">
                          {s}
                          <button
                            type="button"
                            aria-label={`Remove ${s}`}
                            onClick={() => {
                              const newSkills = [...data.skills]; newSkills.splice(i, 1); setData({ ...data, skills: newSkills });
                            }}
                            className="text-indigo-300 transition-colors hover:text-danger-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" className="space-y-5 sm:space-y-6">
                  {(data.experience || []).map((exp, idx) => (
                    <Card key={idx} className="relative border-[var(--border-soft)] bg-[var(--bg-base)] shadow-[var(--shadow-card)]">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove work experience"
                        onClick={() => {
                          const newExp = [...data.experience];
                          newExp.splice(idx, 1);
                          setData({ ...data, experience: newExp });
                        }}
                        className="absolute right-3 top-3 z-10 h-8 w-8 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="space-y-4 p-4 sm:p-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="Job Title"
                            value={exp.title}
                            onChange={(e) => {
                              const newExp = [...data.experience]; newExp[idx].title = e.target.value; setData({ ...data, experience: newExp });
                            }}
                            className="h-10 rounded-lg border-transparent bg-[var(--bg-muted)]/70 font-semibold focus-visible:border-indigo-300 sm:h-11"
                          />
                          <Input
                            placeholder="Company"
                            value={exp.company}
                            onChange={(e) => {
                              const newExp = [...data.experience]; newExp[idx].company = e.target.value; setData({ ...data, experience: newExp });
                            }}
                            className="h-10 rounded-lg border-transparent bg-[var(--bg-muted)]/70 focus-visible:border-indigo-300 sm:h-11"
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
                          <label className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-subtle)]">Key Achievements</label>
                          <Button
                            onClick={() => handleOptimizeExperience(idx)}
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg border-indigo-200 bg-indigo-50 font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                            Optimize Bullet Points
                          </Button>
                        </div>
                        {(exp.description || []).map((bullet, bIdx) => (
                          <div key={bIdx} className="flex gap-2">
                            <Textarea
                              value={bullet}
                              onChange={(e) => {
                                const newExp = [...data.experience]; newExp[idx].description[bIdx] = e.target.value; setData({ ...data, experience: newExp });
                              }}
                              className="min-h-[60px] rounded-lg border-[var(--border-soft)] text-sm focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Enhance with AI"
                              onClick={() => handleEnhanceBullet(idx, bIdx)}
                              className="h-8 w-8 shrink-0 rounded-lg text-indigo-500 hover:bg-indigo-50 hover:text-indigo-600"
                            >
                              <Wand2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remove bullet"
                              onClick={() => {
                                const newExp = [...data.experience]; newExp[idx].description.splice(bIdx, 1); setData({ ...data, experience: newExp });
                              }}
                              className="h-8 w-8 shrink-0 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newExp = [...data.experience]; newExp[idx].description.push(''); setData({ ...data, experience: newExp });
                          }}
                          className="h-8 w-full rounded-lg border border-dashed border-[var(--border-soft)] text-[var(--text-muted)] hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600"
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add Bullet
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    onClick={() => setData({ ...data, experience: [...data.experience, { title: '', company: '', duration: '', description: [''] }] })}
                    className="h-11 w-full rounded-lg border border-dashed border-[var(--border-soft)] bg-transparent font-semibold text-[var(--text-muted)] shadow-none hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 sm:h-12"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add New Work Experience
                  </Button>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 sm:space-y-6">
                  {(data.education || []).map((edu, idx) => (
                    <Card key={idx} className="relative border-[var(--border-soft)] bg-[var(--bg-base)] shadow-[var(--shadow-card)] group">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove education"
                        className="absolute right-3 top-3 z-10 h-8 w-8 rounded-lg text-[var(--text-subtle)] transition-all hover:bg-danger-50 hover:text-danger-500 lg:opacity-0 lg:group-hover:opacity-100"
                        onClick={() => {
                          const newEdu = [...data.education];
                          newEdu.splice(idx, 1);
                          setData({ ...data, education: newEdu });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="space-y-4 p-4 sm:p-5">
                        <Input
                          placeholder="Degree (e.g. BS Computer Science)"
                          value={edu.degree}
                          onChange={(e) => {
                            const newEdu = [...data.education]; newEdu[idx].degree = e.target.value; setData({ ...data, education: newEdu });
                          }}
                          className="h-11 rounded-lg border-[var(--border-soft)] font-semibold focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30 sm:h-12"
                        />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="Institution"
                            value={edu.institution}
                            onChange={(e) => {
                              const newEdu = [...data.education]; newEdu[idx].institution = e.target.value; setData({ ...data, education: newEdu });
                            }}
                            className="h-10 rounded-lg border-transparent bg-[var(--bg-muted)]/70 focus-visible:border-indigo-300"
                          />
                          <Input
                            placeholder="Year"
                            value={edu.year}
                            onChange={(e) => {
                              const newEdu = [...data.education]; newEdu[idx].year = e.target.value; setData({ ...data, education: newEdu });
                            }}
                            className="h-10 rounded-lg border-transparent bg-[var(--bg-muted)]/70 focus-visible:border-indigo-300"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    onClick={() => setData({ ...data, education: [...data.education, { degree: '', institution: '', year: '' }] })}
                    className="h-11 w-full rounded-lg border border-dashed border-[var(--border-soft)] bg-transparent font-semibold text-[var(--text-muted)] shadow-none hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 sm:h-12"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Education
                  </Button>
                </motion.div>
              )}

              {step === 5 && (
                <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 sm:space-y-6">
                  {(data.projects || []).map((proj, idx) => (
                    <Card key={idx} className="relative border-[var(--border-soft)] bg-[var(--bg-base)] shadow-[var(--shadow-card)] group">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove project"
                        className="absolute right-3 top-3 z-10 h-8 w-8 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100"
                        onClick={() => {
                          const newProj = [...data.projects]; newProj.splice(idx, 1); setData({ ...data, projects: newProj });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="space-y-4 p-4 sm:p-5">
                        <Input
                          placeholder="Project Title"
                          value={proj.title}
                          onChange={(e) => {
                            const newProj = [...data.projects]; newProj[idx].title = e.target.value; setData({ ...data, projects: newProj });
                          }}
                          className="h-11 rounded-lg border-[var(--border-soft)] font-semibold focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30 sm:h-12"
                        />
                        <Input
                          placeholder="Link (Optional)"
                          value={proj.link}
                          onChange={(e) => {
                            const newProj = [...data.projects]; newProj[idx].link = e.target.value; setData({ ...data, projects: newProj });
                          }}
                          className="h-10 rounded-lg border-transparent bg-[var(--bg-muted)]/70 text-indigo-700 focus-visible:border-indigo-300"
                        />
                        <Textarea
                          placeholder="Brief description of your impact..."
                          value={proj.description}
                          onChange={(e) => {
                            const newProj = [...data.projects]; newProj[idx].description = e.target.value; setData({ ...data, projects: newProj });
                          }}
                          className="min-h-[100px] rounded-lg border-[var(--border-soft)] resize-none focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30"
                        />
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    onClick={() => setData({ ...data, projects: [...data.projects, { title: '', description: '', link: '', tech_stack: [] }] })}
                    className="h-11 w-full rounded-lg border border-dashed border-[var(--border-soft)] bg-transparent font-semibold text-[var(--text-muted)] shadow-none hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 sm:h-12"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Project
                  </Button>
                </motion.div>
              )}

              {step === 6 && (
                <motion.div key="step6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 sm:space-y-6">
                  {(data.certifications || []).map((cert, idx) => (
                    <Card key={idx} className="relative border-[var(--border-soft)] bg-[var(--bg-base)] shadow-[var(--shadow-card)] group">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove certification"
                        className="absolute right-3 top-3 z-10 h-8 w-8 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100"
                        onClick={() => {
                          const newCerts = [...data.certifications]; newCerts.splice(idx, 1); setData({ ...data, certifications: newCerts });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="space-y-4 p-4 sm:p-5">
                        <Input
                          placeholder="Certification Name"
                          value={cert.name}
                          onChange={(e) => {
                            const newCerts = [...data.certifications]; newCerts[idx].name = e.target.value; setData({ ...data, certifications: newCerts });
                          }}
                          className="h-11 rounded-lg border-[var(--border-soft)] font-semibold focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30 sm:h-12"
                        />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="Issuer"
                            value={cert.issuer}
                            onChange={(e) => {
                              const newCerts = [...data.certifications]; newCerts[idx].issuer = e.target.value; setData({ ...data, certifications: newCerts });
                            }}
                            className="h-10 rounded-lg border-transparent bg-[var(--bg-muted)]/70 focus-visible:border-indigo-300"
                          />
                          <Input
                            placeholder="Year"
                            value={cert.year}
                            onChange={(e) => {
                              const newCerts = [...data.certifications]; newCerts[idx].year = e.target.value; setData({ ...data, certifications: newCerts });
                            }}
                            className="h-10 rounded-lg border-transparent bg-[var(--bg-muted)]/70 focus-visible:border-indigo-300"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    onClick={() => setData({ ...data, certifications: [...data.certifications, { name: '', issuer: '', year: '' }] })}
                    className="h-11 w-full rounded-lg border border-dashed border-[var(--border-soft)] bg-transparent font-semibold text-[var(--text-muted)] shadow-none hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 sm:h-12"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Certification
                  </Button>
                </motion.div>
              )}

              {step === 7 && (
                <motion.div key="step7" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 sm:space-y-6">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    {(data.languages || []).map((lang, idx) => (
                      <Card key={idx} className="relative border-[var(--border-soft)] bg-[var(--bg-base)] shadow-[var(--shadow-card)] group">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove language"
                          className="absolute right-2 top-2 z-10 h-7 w-7 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100"
                          onClick={() => {
                            const newLangs = [...data.languages]; newLangs.splice(idx, 1); setData({ ...data, languages: newLangs });
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <CardContent className="space-y-2 p-3.5 sm:p-4">
                          <Input
                            placeholder="Language"
                            value={lang.language}
                            onChange={(e) => {
                              const newLangs = [...data.languages]; newLangs[idx].language = e.target.value; setData({ ...data, languages: newLangs });
                            }}
                            className="h-10 rounded-lg border-[var(--border-soft)] font-semibold focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30"
                          />
                          <Input
                            placeholder="Proficiency (e.g. Native)"
                            value={lang.proficiency}
                            onChange={(e) => {
                              const newLangs = [...data.languages]; newLangs[idx].proficiency = e.target.value; setData({ ...data, languages: newLangs });
                            }}
                            className="h-9 rounded-lg border-transparent bg-[var(--bg-muted)]/70 text-xs focus-visible:border-indigo-300"
                          />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Button
                    onClick={() => setData({ ...data, languages: [...data.languages, { language: '', proficiency: '' }] })}
                    className="h-11 w-full rounded-lg border border-dashed border-[var(--border-soft)] bg-transparent font-semibold text-[var(--text-muted)] shadow-none hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 sm:h-12"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Language
                  </Button>
                </motion.div>
              )}

              {step === 8 && (
                <motion.div key="step8" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 sm:space-y-6">
                  {(data.achievements || []).map((ach, idx) => (
                    <Card key={idx} className="relative border-[var(--border-soft)] bg-[var(--bg-base)] shadow-[var(--shadow-card)] group">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove achievement"
                        className="absolute right-3 top-3 z-10 h-8 w-8 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100"
                        onClick={() => {
                          const newAch = [...data.achievements]; newAch.splice(idx, 1); setData({ ...data, achievements: newAch });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="space-y-3 p-4 sm:p-5">
                        <Input
                          placeholder="Title (e.g. Hackathon Winner)"
                          value={ach.title}
                          onChange={(e) => {
                            const newAch = [...data.achievements]; newAch[idx].title = e.target.value; setData({ ...data, achievements: newAch });
                          }}
                          className="h-11 rounded-lg border-[var(--border-soft)] font-semibold focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30 sm:h-12"
                        />
                        <Textarea
                          placeholder="Describe the accomplishment..."
                          value={ach.description}
                          onChange={(e) => {
                            const newAch = [...data.achievements]; newAch[idx].description = e.target.value; setData({ ...data, achievements: newAch });
                          }}
                          className="min-h-[80px] rounded-lg border-[var(--border-soft)] resize-none focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30"
                        />
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    onClick={() => setData({ ...data, achievements: [...data.achievements, { title: '', description: '' }] })}
                    className="h-11 w-full rounded-lg border border-dashed border-[var(--border-soft)] bg-transparent font-semibold text-[var(--text-muted)] shadow-none hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 sm:h-12"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Achievement
                  </Button>
                </motion.div>
              )}

              {step === 9 && (
                <motion.div key="step9" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 sm:space-y-6">
                  {(data.internships || []).map((intern, idx) => (
                    <Card key={idx} className="relative border-[var(--border-soft)] bg-[var(--bg-base)] shadow-[var(--shadow-card)] group">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove internship"
                        className="absolute right-3 top-3 z-10 h-8 w-8 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100"
                        onClick={() => {
                          const newIntern = [...data.internships]; newIntern.splice(idx, 1); setData({ ...data, internships: newIntern });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="space-y-4 p-4 sm:p-5">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <Input
                            placeholder="Role"
                            value={intern.role}
                            onChange={(e) => {
                              const newInt = [...data.internships]; newInt[idx].role = e.target.value; setData({ ...data, internships: newInt });
                            }}
                            className="h-10 rounded-lg border-transparent bg-[var(--bg-muted)]/70 font-semibold focus-visible:border-indigo-300 sm:h-11"
                          />
                          <Input
                            placeholder="Company"
                            value={intern.company}
                            onChange={(e) => {
                              const newInt = [...data.internships]; newInt[idx].company = e.target.value; setData({ ...data, internships: newInt });
                            }}
                            className="h-10 rounded-lg border-transparent bg-[var(--bg-muted)]/70 focus-visible:border-indigo-300 sm:h-11"
                          />
                        </div>
                        {(intern.description || []).map((bullet, bIdx) => (
                          <div key={bIdx} className="flex gap-2">
                            <Textarea
                              value={bullet}
                              onChange={(e) => {
                                const newInt = [...data.internships]; newInt[idx].description[bIdx] = e.target.value; setData({ ...data, internships: newInt });
                              }}
                              className="min-h-[60px] rounded-lg border-[var(--border-soft)] text-sm focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remove bullet"
                              onClick={() => {
                                const newInt = [...data.internships]; newInt[idx].description.splice(bIdx, 1); setData({ ...data, internships: newInt });
                              }}
                              className="h-8 w-8 shrink-0 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newInt = [...data.internships]; newInt[idx].description.push(''); setData({ ...data, internships: newInt });
                          }}
                          className="h-8 w-full rounded-lg border border-dashed border-[var(--border-soft)] text-[var(--text-muted)] hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600"
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add Bullet
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    onClick={() => setData({ ...data, internships: [...data.internships, { role: '', company: '', duration: '', description: [''] }] })}
                    className="h-11 w-full rounded-lg border border-dashed border-[var(--border-soft)] bg-transparent font-semibold text-[var(--text-muted)] shadow-none hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 sm:h-12"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Internship
                  </Button>
                </motion.div>
              )}

              {step === 10 && (
                <motion.div key="step10" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5 sm:space-y-6">
                  {(data.customSections || []).map((cs, ci) => (
                    <Card key={ci} className="relative border-[var(--border-soft)] bg-[var(--bg-base)] shadow-[var(--shadow-card)] group">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove custom section"
                        className="absolute right-3 top-3 z-10 h-8 w-8 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100"
                        onClick={() => {
                          const newCustom = [...data.customSections]; newCustom.splice(ci, 1); setData({ ...data, customSections: newCustom });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="space-y-4 p-4 sm:p-5">
                        <Input
                          placeholder="Section title (e.g. Volunteer Work, Publications)"
                          value={cs.title}
                          onChange={(e) => {
                            const newCustom = [...data.customSections]; newCustom[ci].title = e.target.value; setData({ ...data, customSections: newCustom });
                          }}
                          className="h-10 rounded-lg border-transparent bg-[var(--bg-muted)]/70 font-semibold focus-visible:border-indigo-300 sm:h-11"
                        />
                        {(cs.items || []).map((item, iIdx) => (
                          <div key={iIdx} className="flex gap-2">
                            <Textarea
                              value={item}
                              placeholder="Bullet point..."
                              onChange={(e) => {
                                const newCustom = [...data.customSections]; newCustom[ci].items[iIdx] = e.target.value; setData({ ...data, customSections: newCustom });
                              }}
                              className="min-h-[60px] rounded-lg border-[var(--border-soft)] text-sm focus-visible:border-indigo-300 focus-visible:ring-indigo-500/30"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Remove bullet"
                              onClick={() => {
                                const newCustom = [...data.customSections]; newCustom[ci].items.splice(iIdx, 1); setData({ ...data, customSections: newCustom });
                              }}
                              className="h-8 w-8 shrink-0 rounded-lg text-[var(--text-subtle)] hover:bg-danger-50 hover:text-danger-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const newCustom = [...data.customSections]; newCustom[ci].items = newCustom[ci].items || []; newCustom[ci].items.push(''); setData({ ...data, customSections: newCustom });
                          }}
                          className="h-8 w-full rounded-lg border border-dashed border-[var(--border-soft)] text-[var(--text-muted)] hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600"
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> Add Bullet
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  <Button
                    onClick={() => setData({ ...data, customSections: [...(data.customSections || []), { title: '', items: [''] }] })}
                    className="h-11 w-full rounded-lg border border-dashed border-[var(--border-soft)] bg-transparent font-semibold text-[var(--text-muted)] shadow-none hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 sm:h-12"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Custom Section
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-8 flex items-center justify-between gap-3 sm:mt-10">
              <Button
                variant="outline"
                disabled={step === 1}
                onClick={() => setStep(step - 1)}
                className="h-11 flex-1 rounded-lg border-[var(--border-soft)] font-medium text-[var(--text-muted)] hover:border-indigo-300 hover:text-indigo-600 sm:h-12"
              >
                <ChevronLeft className="mr-1.5 h-4 w-4" />
                Previous
              </Button>
              {step < steps.length && (
                <Button
                  onClick={() => setStep(step + 1)}
                  className="h-11 flex-1 rounded-lg bg-indigo-600 font-semibold text-white shadow-sm hover:bg-indigo-800 sm:h-12"
                >
                  Next Section
                  <ChevronRight className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-subtle)]">
              <Lock className="h-3 w-3" /> Your draft is auto-saved and encrypted locally.
            </p>
          </div>
        </ScrollArea>
      </div>

      {/* --- Right Panel: Live Preview (Desktop) --- */}
      <div className="hidden min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg-surface)] md:flex">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-soft)] bg-white/70 px-4 py-2.5 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <Eye className="h-4 w-4 shrink-0 text-indigo-600" />
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">Live Preview</span>
            <Badge variant="info" className="hidden shrink-0 md:inline-flex">
              <Sparkles className="h-3 w-3" /> ATS Optimized
            </Badge>
            <span className="hidden shrink-0 items-center gap-1.5 text-[10px] font-bold tracking-widest text-[var(--text-subtle)] xl:inline-flex">
              A4 PAPER <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={handleCopyForWord} title="Copy for Word" className="h-8 rounded-lg px-2.5 text-[var(--text-muted)] hover:text-indigo-600">
              <Copy className="h-3.5 w-3.5" /> <span className="hidden 2xl:inline">Copy</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDownloadDocx} title="Export Word (.doc)" className="h-8 rounded-lg px-2.5 text-[var(--text-muted)] hover:text-indigo-600">
              <FileDown className="h-3.5 w-3.5" /> <span className="hidden 2xl:inline">Word</span>
            </Button>
            <Button size="sm" onClick={handleDownloadPDF} className="h-8 rounded-lg bg-indigo-600 px-3 font-semibold text-white shadow-sm hover:bg-indigo-800">
              <Download className="h-3.5 w-3.5" /> <span className="hidden 2xl:inline">PDF</span>
            </Button>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 justify-center overflow-auto p-6 lg:p-8 xl:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ backgroundImage: 'radial-gradient(circle, rgba(15,23,42,0.07) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
          />
          <Reorder.Group
          as="div"
          axis="y"
          values={effectiveSectionOrder}
          onReorder={(newOrder) => setData({ ...data, sectionOrder: newOrder })}
          className="bg-white shadow-[0_40px_100px_rgba(0,0,0,0.1)] w-[210mm] min-h-[297mm] h-fit origin-top scale-[0.6] sm:scale-[0.7] md:scale-[0.5] lg:scale-[0.7] xl:scale-[0.8] 2xl:scale-[0.9] flex flex-col font-sans"
          ref={previewRef as any}
          data-resume-preview
        >
          {/* Top Decorative Bar */}
          <div className="h-2 bg-indigo-600 w-full shrink-0" />

          {/* Header (Fixed) */}
          <div className="p-8 md:p-16 pb-8 md:pb-12 space-y-4 shrink-0">
            <h2 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none">{data.fullName || "Your Name"}</h2>
            <div className="flex items-center gap-2 md:gap-4 text-slate-500 text-[10px] md:text-xs font-bold tracking-widest uppercase">
              {data.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-indigo-600" /> {data.email}</span>}
              {data.phone && <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-indigo-600" /> {data.phone}</span>}
            </div>
            <div className="h-px bg-slate-100 w-16 md:w-24 !mt-4 md:!mt-6" />
          </div>

          <div className="px-8 md:px-16 pb-8 md:pb-16 space-y-6 md:space-y-10 flex-1">
            {effectiveSectionOrder.map((sectionId) => (
              <Reorder.Item as="div" key={sectionId} value={sectionId} className="cursor-grab active:cursor-grabbing">
                {renderResumeSection(sectionId)}
              </Reorder.Item>
            ))}
          </div>

          {/* Footer Branding (Subtle) */}
          <div className="p-8 md:p-12 border-t border-slate-50 text-center shrink-0">
            <p className="text-[8px] md:text-[10px] font-bold text-slate-300 uppercase tracking-widest">Powered by ResuMatch AI • Nemotron Intelligence</p>
          </div>
          </Reorder.Group>
        </div>
      </div>

      {/* --- Mobile: Live Preview Floating Toggle & Sheet --- */}
      <div className="fixed bottom-5 right-5 z-50 md:hidden">
        <Sheet open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <SheetTrigger asChild>
            <Button
              variant="default"
              size="icon"
              aria-label="Open live preview"
              className="h-14 w-14 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-[0_12px_30px_rgba(79,70,229,0.4)] active:scale-95"
            >
              <Eye className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-[28px] border-none p-0">
            <SheetHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b border-[var(--border-soft)] bg-white px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-2">
                <Eye className="h-4 w-4 shrink-0 text-indigo-600" />
                <SheetTitle className="truncate text-base font-semibold text-[var(--text-primary)]">Live Preview</SheetTitle>
                <Badge variant="info" className="hidden shrink-0 sm:inline-flex">
                  <Sparkles className="h-3 w-3" /> ATS
                </Badge>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button onClick={handleCopyForWord} variant="ghost" size="icon" aria-label="Copy for Word" className="h-9 w-9 rounded-lg text-[var(--text-muted)]">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button onClick={handleDownloadDocx} variant="outline" size="sm" className="h-9 rounded-lg border-[var(--border-soft)] text-[var(--text-muted)]">
                  <FileDown className="mr-1.5 h-4 w-4" /> Word
                </Button>
                <Button onClick={handleDownloadPDF} size="sm" className="h-9 rounded-lg bg-indigo-600 font-semibold text-white hover:bg-indigo-800">
                  <Download className="mr-1.5 h-4 w-4" /> PDF
                </Button>
              </div>
            </SheetHeader>
            <div className="flex justify-center bg-[var(--bg-surface)] p-4 pb-32">
              {/* Scaled Preview for Mobile Sheet */}
              <div className="h-fit w-[210mm] min-h-[297mm] origin-top scale-[0.4] flex flex-col bg-white font-sans shadow-2xl sm:scale-[0.55]">
                <div className="h-2 w-full bg-indigo-600" />
                <div className="space-y-4 p-16 pb-12">
                  <h2 className="text-5xl font-black uppercase leading-none tracking-tighter text-slate-900">{data.fullName || "Your Name"}</h2>
                  <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-slate-500">
                    {data.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-indigo-600" /> {data.email}</span>}
                    {data.phone && <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-indigo-600" /> {data.phone}</span>}
                  </div>
                  <div className="h-px w-24 !mt-6 bg-slate-100" />
                </div>
                <Reorder.Group
                  as="div"
                  axis="y"
                  values={effectiveSectionOrder}
                  onReorder={(newOrder) => setData({ ...data, sectionOrder: newOrder })}
                  className="flex-1 space-y-10 px-16 pb-16"
                >
                  {effectiveSectionOrder.map((sectionId) => (
                    <Reorder.Item as="div" key={sectionId} value={sectionId} className="cursor-grab active:cursor-grabbing">
                      {renderResumeSection(sectionId)}
                    </Reorder.Item>
                  ))}
                </Reorder.Group>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
