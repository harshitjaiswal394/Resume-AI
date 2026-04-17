"use client";

import React, { useState, useEffect, useRef } from 'react';
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
  Sparkles,
  Plus,
  Trash2,
  Save,
  Download,
  ChevronLeft,
  ChevronRight,
  User,
  List,
  Briefcase,
  GraduationCap,
  Eye,
  FileDown,
  Wand2,
  Loader2,
  Upload,
  Mail,
  Phone,
  Copy,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

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
  sectionOrder: ['summary', 'skills', 'experience', 'education', 'projects', 'certifications', 'languages', 'achievements', 'internships']
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
      
      console.log('[Builder] Handshake: Auth is ready. Initiating Cloud Sovereignty check...', { urlId, userId: user?.uid });

      // PHASE 1: Authority Verification (URL Intent)
      if (urlId) {
        console.log('[Builder] Authority: URL ID identified. Restoring cloud record...', urlId);
        if (user) {
          await fetchResume(urlId);
          setIsLoaded(true);
          return;
        }
      }

      // PHASE 2: Cloud Sovereignty (Account Sync)
      // If logged in, we scan the account's master database before trusting any local browser data.
      if (!activeResumeId && user && user.uid !== 'guest') {
        console.log('[Builder] Authority: Logged-in user. Querying Account Master Sync...');
        try {
          const idToken = await auth.currentUser?.getIdToken();
          const response = await fetch(`${backendUrl}/api/resumes?user_id=${user.uid}`, {
            headers: { 'Authorization': `Bearer ${idToken}` }
          });
          const result = await response.json();
          const latestResumes = result.resumes;

          if (latestResumes && latestResumes.length > 0) {
            const cloudId = latestResumes[0].id;
            console.log('[Builder] Authority: Cloud record found! Syncing account state...', cloudId);
            setResumeId(cloudId);
            await fetchResume(cloudId);
            activeResumeId = cloudId;
            
            // Re-sync URL
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('id', cloudId);
            window.history.replaceState({}, '', newUrl.toString());

            window.history.replaceState({}, '', newUrl.toString());
          } else {
            console.log('[Builder] Authority: No cloud drafts found for this account.');
          }
        } catch (e) {
          console.warn('[Builder] Cloud handshake failed:', e);
        }
      }

      // PHASE 3: Browser Cache Fallback (Guest or Offline sessions)
      // Only used if no Cloud data is available for this account.
      if (!activeResumeId) {
        const savedSnapshot = sessionStorage.getItem('resumatch_builder_session') || localStorage.getItem('resumatch_builder_data');
        if (savedSnapshot) {
          try {
            const parsed = JSON.parse(savedSnapshot);
            const restoredData = parsed.data || parsed;
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
  }, [user, isAuthReady]);

  // Auto-save to both localStorage (permanent) and sessionStorage (this session)
  useEffect(() => {
    if (!isLoaded) return; // DON'T SAVE UNTIL LOADED - Prevents overwriting with empty state
    const snapshot = JSON.stringify({ data, resumeId, discovery });
    localStorage.setItem('resumatch_builder_data', snapshot);
    sessionStorage.setItem('resumatch_builder_session', snapshot);
  }, [data, resumeId, discovery, isLoaded]);

  // Optimized Debounced Auto-save to DB
  useEffect(() => {
    if (!isLoaded || !user || user.uid === 'guest') return;

    const timer = setTimeout(() => {
      performSilentSave();
    }, 5000); // 5 second debounce for DB performance

    return () => clearTimeout(timer);
  }, [data, discovery, user]);

  // Save on tab switch/visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (isLoaded && document.visibilityState === 'hidden') {
        performSilentSave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [data, discovery, resumeId]);

  const performSilentSave = async () => {
    if (!user || user.uid === 'guest' || !isLoaded) return;
    
    // Dirty check: only save if state has changed
    const currentState = JSON.stringify({ data, discovery });
    if (currentState === lastSavedRef.current) return;

    try {
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
        certifications: data.certifications,
        languages: data.languages,
        internships: data.internships,
        achievements: data.achievements,
        section_order: data.sectionOrder,
        phone_number: data.phone,
        user_id: user.uid,
        parsed_data: data,
        original_score: originalScore || 0,
        resume_score: currentScore || 0
      };

      const idToken = await auth.currentUser?.getIdToken();
      const response = await fetch(url, {
        method: method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
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

  const fetchResume = async (id: string) => {
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
        restoredData = typeof resume.parsed_data === 'string' 
          ? JSON.parse(resume.parsed_data) 
          : resume.parsed_data;
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
      if (resume.section_order) restoredData.sectionOrder = resume.section_order;
      if (resume.phone_number) restoredData.phone = resume.phone_number;
      if (resume.title && !restoredData.fullName) restoredData.fullName = resume.title.split("'s Resume")[0];
      
      setData(restoredData);
      
      // Restore score metrics
      if (resume.original_score !== undefined) setOriginalScore(resume.original_score);
      if (resume.resume_score !== undefined) setCurrentScore(resume.resume_score || 0);

      // Sync lastSavedRef to prevent immediate auto-save loop
      lastSavedRef.current = JSON.stringify({ data: restoredData, discovery: newDiscovery });
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

  // --- AI Optimizations ---
  const handleOptimizeExperience = async (index: number) => {
    if (!discovery.role) {
      toast.error('Target role is missing. Please go back and set it.');
      return;
    }

    setIsOptimizing(true);
    toast.promise(
      (async () => {
        const response = await fetch(`${backendUrl}/api/builder/optimize-experience`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch(`${backendUrl}/api/builder/generate-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    toast.promise(
      (async () => {
        const response = await fetch(`${backendUrl}/api/builder/optimize-experience`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    setIsSaving(true);
    try {
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
        certifications: data.certifications,
        languages: data.languages,
        internships: data.internships,
        achievements: data.achievements,
        section_order: data.sectionOrder,
        phone_number: data.phone,
        user_id: user?.uid || 'guest',
        parsed_data: data,
        original_score: originalScore || 0,
        resume_score: currentScore || 0
      };

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
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
        throw new Error(result.detail || 'Failed to sync');
      }
    } catch (e: any) {
      console.error('Save error:', e);
      toast.error(`Save failed: ${e.message || 'Server error'}. Progress kept locally.`);
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

  const handleDownloadDocx = () => {
    if (!previewRef.current) return;
    toast.info('Generating compatible Word file...');
    
    // Improved XML template for Word compatibility
    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><meta charset='utf-8'><title>Resume</title>
      <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>90</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.4; }
        h2 { font-size: 28pt; margin: 0; color: #0f172a; text-transform: uppercase; }
        h3 { font-size: 14pt; color: #4f46e5; border-bottom: 1px solid #e1e4e8; padding-bottom: 2pt; }
        .flex { display: flex; }
        .gap-4 { gap: 1rem; }
      </style></head><body>
    `;
    const footer = "</body></html>";
    const source = header + previewRef.current.innerHTML + footer;
    
    // Use the older format for maximum compatibility on localhost
    const blob = new Blob(['\ufeff', source], {
      type: 'application/msword'
    });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(data.fullName || 'Resume').trim().replace(/[^a-z0-9]/gi, '_')}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Word file downloaded!');
  };

  const handleDownloadPDF = async () => {
    if (!previewRef.current) return;
    toast.info('Generating high-fidelity PDF...');

    const originalEl = previewRef.current;
    const originalGCS = window.getComputedStyle;
    
    const oklchToRgb = (val: string) => {
      if (!val || typeof val !== 'string' || !val.includes('oklch')) return val;
      return val.replace(/oklch\([^)]+\)/g, (match) => {
        if (match.includes('0.55')) return 'rgb(79, 70, 229)';   // indigo-600
        if (match.includes('0.64') || match.includes('0.63')) return 'rgb(99, 102, 241)';   // indigo-500
        if (match.includes('0.2')) return 'rgb(15, 23, 42)';    // slate-900
        if (match.includes('0.92')) return 'rgb(241, 245, 249)'; // slate-100
        if (match.includes('0.44')) return 'rgb(71, 85, 105)';   // slate-600
        return 'rgb(79, 70, 229)';
      });
    };

    try {
      (window as any).getComputedStyle = (el: Element, pseudo?: string) => {
        const style = originalGCS(el, pseudo);
        return new Proxy(style, {
          get(target, prop) {
            if (prop === 'getPropertyValue') {
              return (p: string) => {
                const val = target.getPropertyValue(p);
                return (typeof val === 'string' && val.includes('oklch')) ? oklchToRgb(val) : val;
              };
            }
            const val = (target as any)[prop];
            if (typeof val === 'function') return val.bind(target);
            if (typeof val === 'string' && val.includes('oklch')) return oklchToRgb(val);
            return val;
          }
        });
      };

      const canvas = await html2canvas(originalEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          const clonedRoot = clonedDoc.querySelector('[data-resume-preview]');
          
          const resetStyle = clonedDoc.createElement('style');
          resetStyle.innerHTML = `
            * { 
              letter-spacing: normal !important; 
              font-variant-ligatures: none !important;
              font-kerning: none !important;
              word-spacing: normal !important;
              text-rendering: optimizeSpeed !important;
              -webkit-font-smoothing: antialiased !important;
            }
            [style*="oklch"] { color: inherit; }
          `;
          clonedDoc.head.appendChild(resetStyle);

          if (clonedRoot instanceof HTMLElement) {
            clonedRoot.style.width = '210mm';
            clonedRoot.style.transform = 'none';
            clonedRoot.style.position = 'relative';
            clonedRoot.style.margin = '0';
          }
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.85); // Optimized quality for compatibility
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${(data.fullName || 'Resume').trim().replace(/[^a-z0-9]/gi, '_')}.pdf`);
      toast.success('Resume downloaded successfully!');
    } catch (e) {
      console.error('PDF Error:', e);
      toast.error('Export failed - please try one more time');
    } finally {
      (window as any).getComputedStyle = originalGCS;
    }
  };

  const handleReimport = async () => {
    if (!resumeId) return;
    try {
      const { data: resume, error } = await supabase.from('resumes').select('parsed_data').eq('id', resumeId).single();
      if (resume?.parsed_data && !error) {
        const originalData = typeof resume.parsed_data === 'string' ? JSON.parse(resume.parsed_data) : resume.parsed_data;
        setData(originalData);
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
      if (resumeId && user?.uid !== 'guest') {
        const { error } = await supabase.from('resumes').delete().eq('id', resumeId);
        if (error) throw error;
      }

      // Clear local caches and state IMMEDIATELY
      localStorage.removeItem('resumatch_builder_data');
      sessionStorage.removeItem('resumatch_builder_session');
      setResumeId(null);
      setData({} as any);
      
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
      default:
        return null;
    }
  };

  // --- Render Helpers ---
  const steps = [
    { id: 1, name: 'Personal', icon: User },
    { id: 2, name: 'Skills', icon: List },
    { id: 3, name: 'Experience', icon: Briefcase },
    { id: 4, name: 'Education', icon: GraduationCap },
    { id: 5, name: 'Projects', icon: Wand2 },
    { id: 6, name: 'Certifications', icon: Badge },
    { id: 7, name: 'Languages', icon: List },
    { id: 8, name: 'Achievements', icon: Sparkles },
    { id: 9, name: 'Internships', icon: Briefcase }
  ];

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-50 overflow-hidden">
      {/* --- Left Panel: Editor --- */}
      <div className="flex-1 flex flex-col h-full bg-white border-r border-slate-200 overflow-y-auto">
        <header className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur-md sticky top-0 z-10 gap-2">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-slate-900 leading-none mb-1">AI Builder</h1>
              <div className="flex items-center gap-2">
                <div className="group relative flex items-center gap-2 cursor-pointer" onClick={() => {
                  const newRole = prompt("Enter your target role:", discovery.role);
                  if (newRole !== null) setDiscovery({ ...discovery, role: newRole });
                }}>
                  <p className="text-xs md:text-sm text-slate-500 font-medium truncate max-w-[100px] md:max-w-none hover:text-indigo-600 transition-colors">
                    Target: {discovery.role || "Set Role"}
                  </p>
                  <Wand2 className="h-3 w-3 text-slate-300 group-hover:text-indigo-400" />
                </div>
                {originalScore !== null && (
                  <Badge className="bg-green-50 text-green-600 border-green-100 font-black text-[8px] md:text-[10px] uppercase">
                    +{currentScore - originalScore}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleDeleteDraft} className="h-9 md:h-10 rounded-xl text-slate-300 hover:text-rose-500 px-3 md:px-4 transition-colors mr-2">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={handleSave} disabled={isSaving} className="h-9 md:h-10 rounded-xl border-slate-200 px-3 md:px-4">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 md:mr-2" />}
              <span className="hidden md:inline">Save</span>
            </Button>
            <Button variant="outline" onClick={handleReimport} className="h-9 md:h-10 rounded-xl border-slate-200 px-3 md:px-4 text-indigo-600 hover:bg-indigo-50">
              <RefreshCw className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Import Original</span>
            </Button>
            <Button variant="ghost" onClick={handleCopyForWord} className="h-9 md:h-10 rounded-xl text-slate-500 hover:text-indigo-600 px-3 md:px-4 transition-colors">
              <Copy className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Copy</span>
            </Button>
            <Button variant="outline" onClick={handleDownloadDocx} className="h-9 md:h-10 rounded-xl border-slate-200 px-3 md:px-4 text-slate-600 hover:text-slate-900">
              <FileDown className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Word</span>
            </Button>
            <Button onClick={handleDownloadPDF} className="h-9 md:h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 px-3 md:px-4">
              <Download className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">PDF</span>
            </Button>
          </div>
        </header>

        <div className="px-4 md:px-12 py-4 md:py-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex-1 max-w-xl">
            <div className="flex items-center justify-between mb-2">
              {(steps || []).map((s) => (
                <div
                  key={s.id}
                  className={`flex flex-col items-center gap-1.5 md:gap-2 transition-all duration-300 ${step >= s.id ? 'text-indigo-600' : 'text-slate-400'}`}
                >
                  <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center transition-all ${step >= s.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border border-slate-200'}`}>
                    <s.icon className="h-4 w-4 md:h-5 md:w-5" />
                  </div>
                  <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-wider hidden sm:block">{s.name}</span>
                </div>
              ))}
            </div>
            <Progress value={(step / steps.length) * 100} className="h-1 bg-slate-200" />
          </div>

          {originalScore !== null && (
            <div className="hidden sm:flex ml-4 md:ml-12 pl-4 md:pl-12 border-l border-slate-200 items-center gap-3 md:gap-6">
              <div className="text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Initial Score</p>
                <p className="text-xl font-black text-slate-400">{originalScore}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                <ChevronRight className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black text-green-600 uppercase tracking-tighter">Optimized</p>
                <p className="text-2xl font-black text-indigo-600">{currentScore || 85}</p>
              </div>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 p-4 md:p-8 lg:p-12">
          <div className="max-w-2xl mx-auto">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Full Name</label>
                      <Input value={data.fullName} onChange={(e) => setData({ ...data, fullName: e.target.value })} placeholder="Jane Doe" className="h-12 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Email Address</label>
                      <Input value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} placeholder="jane@example.com" className="h-12 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Phone Number</label>
                      <Input value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} placeholder="+1 234 567 890" className="h-12 rounded-xl" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-slate-700">Professional Summary</label>
                      <Button variant="ghost" size="sm" onClick={handleGenerateSummary} className="text-indigo-600 hover:text-indigo-700 h-8 gap-1 p-1">
                        <Wand2 className="h-3 w-3" />
                        AI Generate
                      </Button>
                    </div>
                    <Textarea
                      value={data.summary}
                      onChange={(e) => setData({ ...data, summary: e.target.value })}
                      placeholder="High-impact 3-sentence summary..."
                      className="min-h-[120px] rounded-xl resize-none"
                    />
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="space-y-4">
                    <label className="text-sm font-semibold text-slate-700">Skills & Expertise</label>
                    <div className="flex gap-2">
                      <Input
                        id="skill-input"
                        placeholder="e.g. React, Python, Product Management"
                        className="h-12 rounded-xl"
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
                      <Button onClick={() => {
                        const el = document.getElementById('skill-input') as HTMLInputElement;
                        if (el.value) {
                          setData({ ...data, skills: [...data.skills, el.value] });
                          el.value = '';
                        }
                      }} className="h-12 px-6 rounded-xl bg-slate-900">Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {(data.skills || []).map((s, i) => (
                        <div key={i} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold flex items-center gap-2 border border-indigo-100">
                          {s}
                          <button onClick={() => {
                            const newSkills = [...data.skills]; newSkills.splice(i, 1); setData({ ...data, skills: newSkills });
                          }}><Trash2 className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" className="space-y-8">
                  {(data.experience || []).map((exp, idx) => (
                    <Card key={idx} className="border-slate-100 shadow-sm relative group">
                      <CardContent className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <Input placeholder="Job Title" value={exp.title} onChange={(e) => {
                            const newExp = [...data.experience]; newExp[idx].title = e.target.value; setData({ ...data, experience: newExp });
                          }} className="h-10 border-none bg-slate-50 font-bold" />
                          <Input placeholder="Company" value={exp.company} onChange={(e) => {
                            const newExp = [...data.experience]; newExp[idx].company = e.target.value; setData({ ...data, experience: newExp });
                          }} className="h-10 border-none bg-slate-50" />
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-400 uppercase">Key Achievements</label>
                          <Button
                            onClick={() => handleOptimizeExperience(idx)}
                            variant="outline" size="sm"
                            className="h-8 rounded-lg border-indigo-100 text-indigo-600 hover:bg-indigo-50 font-bold"
                          >
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
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
                              className="min-h-[60px] text-sm border-none focus-visible:ring-0 p-0 shadow-none"
                            />
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleEnhanceBullet(idx, bIdx)}
                              className="h-8 w-8 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50"
                            >
                              <Wand2 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => {
                              const newExp = [...data.experience]; newExp[idx].description.splice(bIdx, 1); setData({ ...data, experience: newExp });
                            }} className="h-8 w-8 text-slate-300 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => {
                          const newExp = [...data.experience]; newExp[idx].description.push(''); setData({ ...data, experience: newExp });
                        }} className="w-full border-dashed border-slate-200 hover:bg-slate-50 text-slate-400 h-8 rounded-lg">
                          <Plus className="h-3 w-3 mr-1" /> Add Bullet
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  <Button onClick={() => setData({ ...data, experience: [...data.experience, { title: '', company: '', duration: '', description: [''] }] })} className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">
                    <Plus className="h-5 w-5 mr-2" /> Add New Work Experience
                  </Button>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                  {(data.education || []).map((edu, idx) => (
                    <Card key={idx} className="border-slate-100 shadow-sm relative group">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-4 right-4 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 z-10"
                        onClick={() => {
                          const newEdu = [...data.education];
                          newEdu.splice(idx, 1);
                          setData({ ...data, education: newEdu });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="p-6 space-y-4">
                        <Input placeholder="Degree (e.g. BS Computer Science)" value={edu.degree} onChange={(e) => {
                          const newEdu = [...data.education]; newEdu[idx].degree = e.target.value; setData({ ...data, education: newEdu });
                        }} className="h-12 rounded-xl" />
                        <div className="grid grid-cols-2 gap-4">
                          <Input placeholder="Institution" value={edu.institution} onChange={(e) => {
                            const newEdu = [...data.education]; newEdu[idx].institution = e.target.value; setData({ ...data, education: newEdu });
                          }} className="h-10 border-none bg-slate-50" />
                          <Input placeholder="Year" value={edu.year} onChange={(e) => {
                            const newEdu = [...data.education]; newEdu[idx].year = e.target.value; setData({ ...data, education: newEdu });
                          }} className="h-10 border-none bg-slate-50" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button onClick={() => setData({ ...data, education: [...data.education, { degree: '', institution: '', year: '' }] })} className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">
                    <Plus className="h-5 w-5 mr-2" /> Add Education
                  </Button>
                </motion.div>
              )}

              {step === 5 && (
                <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  {(data.projects || []).map((proj, idx) => (
                    <Card key={idx} className="border-slate-100 shadow-sm relative group">
                      <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-slate-300 hover:text-red-500" onClick={() => {
                        const newProj = [...data.projects]; newProj.splice(idx, 1); setData({ ...data, projects: newProj });
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="p-6 space-y-4">
                        <Input placeholder="Project Title" value={proj.title} onChange={(e) => {
                          const newProj = [...data.projects]; newProj[idx].title = e.target.value; setData({ ...data, projects: newProj });
                        }} className="h-12 rounded-xl font-bold" />
                        <Input placeholder="Link (Optional)" value={proj.link} onChange={(e) => {
                          const newProj = [...data.projects]; newProj[idx].link = e.target.value; setData({ ...data, projects: newProj });
                        }} className="h-10 border-none bg-slate-50" />
                        <Textarea placeholder="Brief description of your impact..." value={proj.description} onChange={(e) => {
                          const newProj = [...data.projects]; newProj[idx].description = e.target.value; setData({ ...data, projects: newProj });
                        }} className="min-h-[100px] rounded-xl resize-none" />
                      </CardContent>
                    </Card>
                  ))}
                  <Button onClick={() => setData({ ...data, projects: [...data.projects, { title: '', description: '', link: '', tech_stack: [] }] })} className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">
                    <Plus className="h-5 w-5 mr-2" /> Add Project
                  </Button>
                </motion.div>
              )}

              {step === 6 && (
                <motion.div key="step6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  {(data.certifications || []).map((cert, idx) => (
                    <Card key={idx} className="border-slate-100 shadow-sm relative group">
                      <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-slate-300 hover:text-red-500" onClick={() => {
                        const newCerts = [...data.certifications]; newCerts.splice(idx, 1); setData({ ...data, certifications: newCerts });
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="p-6 space-y-4">
                        <Input placeholder="Certification Name" value={cert.name} onChange={(e) => {
                          const newCerts = [...data.certifications]; newCerts[idx].name = e.target.value; setData({ ...data, certifications: newCerts });
                        }} className="h-12 rounded-xl font-bold" />
                        <div className="grid grid-cols-2 gap-4">
                          <Input placeholder="Issuer" value={cert.issuer} onChange={(e) => {
                            const newCerts = [...data.certifications]; newCerts[idx].issuer = e.target.value; setData({ ...data, certifications: newCerts });
                          }} className="h-10 border-none bg-slate-50" />
                          <Input placeholder="Year" value={cert.year} onChange={(e) => {
                            const newCerts = [...data.certifications]; newCerts[idx].year = e.target.value; setData({ ...data, certifications: newCerts });
                          }} className="h-10 border-none bg-slate-50" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button onClick={() => setData({ ...data, certifications: [...data.certifications, { name: '', issuer: '', year: '' }] })} className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">
                    <Plus className="h-5 w-5 mr-2" /> Add Certification
                  </Button>
                </motion.div>
              )}

              {step === 7 && (
                <motion.div key="step7" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(data.languages || []).map((lang, idx) => (
                      <Card key={idx} className="border-slate-100 shadow-sm relative group">
                        <Button variant="ghost" size="icon" className="absolute top-2 right-2 text-slate-300 hover:text-red-500" onClick={() => {
                          const newLangs = [...data.languages]; newLangs.splice(idx, 1); setData({ ...data, languages: newLangs });
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <CardContent className="p-4 space-y-2">
                          <Input placeholder="Language" value={lang.language} onChange={(e) => {
                            const newLangs = [...data.languages]; newLangs[idx].language = e.target.value; setData({ ...data, languages: newLangs });
                          }} className="h-10 rounded-lg font-bold" />
                          <Input placeholder="Proficiency (e.g. Native)" value={lang.proficiency} onChange={(e) => {
                            const newLangs = [...data.languages]; newLangs[idx].proficiency = e.target.value; setData({ ...data, languages: newLangs });
                          }} className="h-8 border-none bg-slate-50 text-xs" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <Button onClick={() => setData({ ...data, languages: [...data.languages, { language: '', proficiency: '' }] })} className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">
                    <Plus className="h-5 w-5 mr-2" /> Add Language
                  </Button>
                </motion.div>
              )}

              {step === 8 && (
                <motion.div key="step8" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                  {(data.achievements || []).map((ach, idx) => (
                    <Card key={idx} className="border-slate-100 shadow-sm relative group">
                      <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-slate-300 hover:text-red-500" onClick={() => {
                        const newAch = [...data.achievements]; newAch.splice(idx, 1); setData({ ...data, achievements: newAch });
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="p-6 space-y-2">
                        <Input placeholder="Title (e.g. Hackathon Winner)" value={ach.title} onChange={(e) => {
                          const newAch = [...data.achievements]; newAch[idx].title = e.target.value; setData({ ...data, achievements: newAch });
                        }} className="h-12 rounded-xl font-bold" />
                        <Textarea placeholder="Describe the accomplishment..." value={ach.description} onChange={(e) => {
                          const newAch = [...data.achievements]; newAch[idx].description = e.target.value; setData({ ...data, achievements: newAch });
                        }} className="min-h-[80px] rounded-xl resize-none" />
                      </CardContent>
                    </Card>
                  ))}
                  <Button onClick={() => setData({ ...data, achievements: [...data.achievements, { title: '', description: '' }] })} className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">
                    <Plus className="h-5 w-5 mr-2" /> Add Achievement
                  </Button>
                </motion.div>
              )}

              {step === 9 && (
                <motion.div key="step9" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                  {(data.internships || []).map((intern, idx) => (
                    <Card key={idx} className="border-slate-100 shadow-sm relative group">
                      <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-slate-300 hover:text-red-500" onClick={() => {
                        const newIntern = [...data.internships]; newIntern.splice(idx, 1); setData({ ...data, internships: newIntern });
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <CardContent className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <Input placeholder="Role" value={intern.role} onChange={(e) => {
                            const newInt = [...data.internships]; newInt[idx].role = e.target.value; setData({ ...data, internships: newInt });
                          }} className="h-10 border-none bg-slate-50 font-bold" />
                          <Input placeholder="Company" value={intern.company} onChange={(e) => {
                            const newInt = [...data.internships]; newInt[idx].company = e.target.value; setData({ ...data, internships: newInt });
                          }} className="h-10 border-none bg-slate-50" />
                        </div>
                        {(intern.description || []).map((bullet, bIdx) => (
                          <div key={bIdx} className="flex gap-2">
                            <Textarea value={bullet} onChange={(e) => {
                              const newInt = [...data.internships]; newInt[idx].description[bIdx] = e.target.value; setData({ ...data, internships: newInt });
                            }} className="min-h-[60px] text-sm border-none focus-visible:ring-0 p-0 shadow-none" />
                            <Button variant="ghost" size="icon" onClick={() => {
                              const newInt = [...data.internships]; newInt[idx].description.splice(bIdx, 1); setData({ ...data, internships: newInt });
                            }}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => {
                          const newInt = [...data.internships]; newInt[idx].description.push(''); setData({ ...data, internships: newInt });
                        }} className="w-full border-dashed border-slate-200 text-slate-400">Add Bullet</Button>
                      </CardContent>
                    </Card>
                  ))}
                  <Button onClick={() => setData({ ...data, internships: [...data.internships, { role: '', company: '', duration: '', description: [''] }] })} className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">
                    <Plus className="h-5 w-5 mr-2" /> Add Internship
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-12 flex items-center justify-between gap-4">
              <Button
                variant="outline"
                disabled={step === 1}
                onClick={() => setStep(step - 1)}
                className="flex-1 h-12 rounded-xl border-slate-200 font-bold"
              >
                Previous Section
              </Button>
              <Button
                disabled={step === steps.length}
                onClick={() => setStep(step + 1)}
                className="flex-1 h-12 rounded-xl bg-slate-900 hover:bg-slate-800 font-bold text-white shadow-lg"
              >
                Next Section
                <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* --- Right Panel: Live Preview (Desktop) --- */}
      <div className="hidden lg:flex flex-1 bg-slate-200/50 p-8 lg:p-12 justify-center overflow-y-auto overflow-x-hidden relative">
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <Badge variant="outline" className="bg-white/80 backdrop-blur-md px-3 py-1 font-bold text-indigo-600 border-indigo-100 shadow-sm">
            <Sparkles className="h-3 w-3 mr-1.5" />
            ATS Optimized
          </Badge>
          <div className="bg-white h-8 w-24 rounded-lg shadow-sm border border-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 gap-2">
            A4 PAPER
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          </div>
        </div>

        <Reorder.Group
          as="div"
          axis="y"
          values={data.sectionOrder}
          onReorder={(newOrder) => setData({ ...data, sectionOrder: newOrder })}
          className="bg-white shadow-[0_40px_100px_rgba(0,0,0,0.1)] w-[210mm] min-h-[297mm] h-fit origin-top scale-[0.6] sm:scale-[0.7] lg:scale-[0.8] xl:scale-[0.9] flex flex-col font-sans"
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
            {(data.sectionOrder || []).map((sectionId) => (
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

      {/* --- Mobile: Live Preview Floating Toggle & Sheet --- */}
      <div className="lg:hidden fixed bottom-6 right-6 z-50">
        <Sheet open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <SheetTrigger asChild>
            <Button variant="default" size="icon" className="h-14 w-14 rounded-full bg-indigo-600 shadow-2xl shadow-indigo-200">
              <Eye className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[90vh] p-0 border-none rounded-t-[32px] overflow-hidden">
            <SheetHeader className="p-6 border-b border-slate-100 flex flex-row items-center justify-between bg-white shrink-0">
              <div>
                <SheetTitle className="text-xl font-black">Live Preview</SheetTitle>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ATS Optimized Analysis</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCopyForWord} variant="ghost" size="sm" className="rounded-xl text-slate-400">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button onClick={handleDownloadDocx} variant="outline" size="sm" className="rounded-xl border-slate-200 text-slate-600 font-bold">
                  <FileDown className="h-4 w-4 mr-2" /> Word
                </Button>
                <Button onClick={handleDownloadPDF} variant="outline" size="sm" className="rounded-xl border-indigo-100 text-indigo-600 font-bold">
                  <Download className="h-4 w-4 mr-2" /> PDF
                </Button>
              </div>
            </SheetHeader>
            <div className="flex-1 bg-slate-100/50 p-4 overflow-y-auto flex justify-center pb-20">
              {/* Scaled Preview for Mobile Sheet */}
              <div className="bg-white shadow-2xl w-[210mm] min-h-[297mm] h-fit origin-top scale-[0.4] sm:scale-[0.6] flex flex-col font-sans" ref={previewRef}>
                {/* We reuse the same content as desktop preview here or refactor it. 
                       For now, since it uses a ref, it will visually match if we put the same content. 
                       Actually, the ref should be on the visible one or shared. 
                       Alternative: use a shared component ResumePreview. 
                   */}
                {/* Restoring the content inside the sheet for mobile view */}
                <div className="h-2 bg-indigo-600 w-full" />
                <div className="p-16 pb-12 space-y-4">
                  <h2 className="text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none">{data.fullName || "Your Name"}</h2>
                  <div className="flex items-center gap-4 text-slate-500 text-xs font-bold tracking-widest uppercase">
                    {data.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-indigo-600" /> {data.email}</span>}
                    {data.phone && <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-indigo-600" /> {data.phone}</span>}
                  </div>
                  <div className="h-px bg-slate-100 w-24 !mt-6" />
                </div>
                {/* ... Simplified version for mobile preview toggle ... */}
                <div className="px-16 pb-16 space-y-10 flex-1">
                  {(data.sectionOrder || []).map((sectionId) => (
                    <div key={sectionId}>
                      {renderResumeSection(sectionId)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
