"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  Upload,
  Loader2,
  Sparkles,
  FileText,
  Search,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  LayoutDashboard,
  Briefcase,
  Settings,
  LogOut,
  Trash2,
  ChevronRight,
  IndianRupee,
  MapPin,
  Clock,
  AlertTriangle,
  Lightbulb,
  Lock,
  Linkedin,
  Github,
  Mail,
  Phone,
  GraduationCap,
  Award
} from 'lucide-react';
import { AuthModal } from '@/components/common/AuthModal';
import { ScoreGauge } from '@/components/resume/ScoreGauge';
import { SkeletonCard, SkeletonGauge, SkeletonJobCard, SkeletonText } from '@/components/ui/skeleton';
import { CoverLetterModal } from '@/components/resume/CoverLetterModal';
import { motion, AnimatePresence } from 'motion/react';
import { extractTextFromFile } from '@/lib/pdf';
import { rewriteBulletPoint } from '@/lib/ai';
import { startResumeAnalysis, completeResumeAnalysis } from '@/app/actions/resume';
import { generateJobLinks } from '@/lib/job-portals';
import { WhyRejectedSection } from '@/components/resume/WhyRejectedSection';
import { ImproveResumeSection } from '@/components/resume/ImproveResumeSection';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRazorpay } from '@/lib/razorpay';

import { PremiumSidebar } from '@/components/dashboard/PremiumSidebar';
import { ScoreAnalytics } from '@/components/dashboard/ScoreAnalytics';
import { StatsColumn } from '@/components/dashboard/StatsColumn';
import { MatchResults } from '@/components/dashboard/MatchResults';
import { PersonalizationCard } from '@/components/dashboard/PersonalizeCard';

export default function Dashboard() {
  const { user, profile, isAuthReady } = useAuth();
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { initiatePayment } = useRazorpay();
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
  const [resumes, setResumes] = useState<any[]>([]);
  const [selectedResume, setSelectedResume] = useState<any>(null);
  const [jobMatches, setJobMatches] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCoverLetterOpen, setIsCoverLetterOpen] = useState(false);
  const [activeJobMatch, setActiveJobMatch] = useState<any>(null);
  const [optimizingIndex, setOptimizingIndex] = useState<string | null>(null);

  const handleOptimizeBullet = async (expIndex: number, bulletIndex: number, currentText: string) => {
    if (!currentText || !selectedResume) return;

    setOptimizingIndex(`${expIndex}-${bulletIndex}`);
    try {
      const response = await fetch(`${backendUrl}/api/resume/rewrite-bullet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bullet: currentText,
          targetRole: preferences.targetRole || 'Software Engineer'
        })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || 'Failed to rewrite bullet');
      }

      console.log('AI Optimization Result:', result);

      if (result.success && result.optimized) {
        // Create a deep copy to avoid mutations
        const rawData = selectedResume?.parsedData || selectedResume?.parsed_data || {};
        const newParsedData = JSON.parse(JSON.stringify(rawData));

        if (newParsedData.experience && newParsedData.experience[expIndex]) {
          newParsedData.experience[expIndex].description[bulletIndex] = result.optimized;

          // Update both keys to stay safe
          const updatedResume = {
            ...selectedResume,
            parsedData: newParsedData,
            parsed_data: newParsedData
          };

          console.log('Updating state with enhanced content...');
          setSelectedResume(updatedResume);

          // Update parent resumes list to sync across the whole dashboard
          setResumes(prev => prev.map(r => r.id === selectedResume.id ? updatedResume : r));

          // Persist to DB
          await supabase.from('resumes')
            .update({ parsed_data: newParsedData })
            .eq('id', selectedResume.id);

          toast.success('Bullet point optimized!');
        }
      }
    } catch (err: any) {
      console.error('Optimization detailed error:', {
        message: err.message,
        resumeId: selectedResume?.id,
        expIndex,
        bulletIndex
      });
      toast.error(err.message || 'Failed to optimize bullet point');
      // No state change here ensures the original text remains visible
    } finally {
      setOptimizingIndex(null);
    }
  };

  const [isTailoring, setIsTailoring] = useState(false);
  const [preferences, setPreferences] = useState<any>({
    targetRole: '',
    experienceLevel: '1-3 years',
    location: ['Bangalore', 'Remote']
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisSteps, setAnalysisSteps] = useState([
    { id: 'parsing', label: 'Parsing resume structure', status: 'pending' },
    { id: 'ats', label: 'Checking ATS compatibility', status: 'pending' },
    { id: 'skills', label: 'Extracting skills & keywords', status: 'pending' },
    { id: 'suggestions', label: 'Generating improvement suggestions', status: 'pending' },
    { id: 'matching', label: 'Matching with 500+ job roles', status: 'pending' },
  ]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Elapsed time counter during analysis
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isAnalyzing) {
      setElapsedSeconds(0);
      timer = setInterval(() => setElapsedSeconds(prev => prev + 1), 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [isAnalyzing]);

  const formatElapsed = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getStatusMessage = () => {
    if (elapsedSeconds < 15) return 'Starting AI analysis...';
    if (elapsedSeconds < 45) return 'Parsing your resume with AI...';
    if (elapsedSeconds < 90) return 'Analyzing skills & generating insights...';
    if (elapsedSeconds < 150) return 'Matching with job database — this takes a moment...';
    return 'Almost there — finalizing your results...';
  };

  const updateStepStatus = (id: string, status: 'pending' | 'loading' | 'done') => {
    setAnalysisSteps(prev => prev.map(step => step.id === id ? { ...step, status } : step));
  };

  useEffect(() => {
    if (isAuthReady && !user) {
      router.push('/');
    }
  }, [user, isAuthReady, router]);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    const fetchResumes = async () => {
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setResumes(data);
        if (data.length > 0 && !selectedResume) setSelectedResume(data[0]);
      }
    };

    fetchResumes();
  }, [user, isAuthReady]);

  useEffect(() => {
    if (!selectedResume) return;
    const fetchMatches = async () => {
      const { data, error } = await supabase
        .from('job_matches')
        .select('*')
        .eq('resume_id', selectedResume.id)
        .order('match_score', { ascending: false });
      if (!error) setJobMatches(data || []);
    };
    fetchMatches();
  }, [selectedResume]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleTailor = async (newPrefs: any) => {
    if (!selectedResume) return;

    setIsTailoring(true);
    setPreferences(newPrefs);

    // Removed redundant toast loading as per user request

    try {
      const response = await fetch(`${backendUrl}/api/resume/tailor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeId: selectedResume.id,
          userId: user?.id,
          preferences: newPrefs,
          parsedData: selectedResume.parsed_data || { skills: [], summary: "" }
        })
      });

      const result = await response.json();
      if (result.success) {
        const updatedResume = {
          ...selectedResume,
          resume_score: result.data.analysis.score,
          score_breakdown: result.data.analysis
        };

        setSelectedResume(updatedResume);

        // Sort matches by match_score descending
        const sortedMatches = [...(result.data.matches || [])].sort(
          (a: any, b: any) => (b.match_score || b.matchScore || 0) - (a.match_score || a.matchScore || 0)
        );
        setJobMatches(sortedMatches);

        toast.success('Analysis updated successfully!', {
          description: `Found ${sortedMatches.length} tailored job matches`,
        });
      } else {
        toast.error('Failed to update analysis');
      }
    } catch (err) {
      toast.error('Failed to update analysis. Please try again.');
    } finally {
      setIsTailoring(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const cleanupUserStorage = async () => {
    if (!user) return;
    try {
      const { data: files, error: listError } = await supabase.storage
        .from('resumes')
        .list(user.id);
      
      if (listError) throw listError;
      if (files && files.length > 0) {
        const pathsToDelete = files.map(file => `${user.id}/${file.name}`);
        const { error: deleteError } = await supabase.storage
          .from('resumes')
          .remove(pathsToDelete);
        
        if (deleteError) throw deleteError;
      }
    } catch (err) {
      console.error('Storage cleanup failed:', err);
    }
  };

  const processFile = async (file: File) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.pdf') && !file.name.endsWith('.docx')) {
      toast.error('Please upload a PDF or DOCX file');
      return;
    }

    setFileName(file.name);
    setIsAnalyzing(true);
    setAnalysisProgress(10);
    setAnalysisSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));

    try {
      // 0. Single-Resume Policy: Delete all previous records and physical files
      await cleanupUserStorage();
      await supabase.from('resumes').delete().eq('user_id', user!.id);
      setResumes([]);
      setSelectedResume(null);
      setJobMatches([]);

      // 1. Storage Upload
      const filePath = `resumes/${user!.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('resumes').upload(filePath, file);
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(filePath);

      // 2. Database Record
      const { data: resumeData, error: resumeError } = await supabase
        .from('resumes')
        .insert({
          user_id: user!.id,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.name.endsWith('.pdf') ? 'pdf' : 'docx',
          file_size_bytes: file.size,
          status: 'parsing',
        })
        .select()
        .single();

      if (resumeError) throw resumeError;
      const resumeId = resumeData.id;

      // 3. Streaming Backend call
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${backendUrl}/api/resume/process-stream?user_id=${user!.id}&resume_id=${resumeId}`, {
        method: 'POST',
        body: formData,
      });


      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No response body');
        console.error(`Backend error: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`Backend processing failed (${response.status}): ${errorText.substring(0, 200)}`);
      }
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let done = false;

      let buffer = '';
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          buffer += decoder.decode(value, { stream: true });

          // Process full frames from the buffer
          let frames = buffer.split('\n\n');

          // Keep the last partial frame in the buffer
          buffer = frames.pop() || '';

          for (const frame of frames) {
            if (frame.startsWith('data: ')) {
              try {
                const event = JSON.parse(frame.replace('data: ', ''));

                if (event.step === 'final') {
                  const resultData = event.data;

                  // Update UI immediately with the data we just received
                  setSelectedResume(prev => ({
                    ...prev,
                    status: 'complete',
                    parsedData: resultData.parsed_data,
                    resume_score: resultData.analysis.score,
                    score_breakdown: resultData.analysis,
                    rawText: resultData.raw_text
                  }));

                  // Sort matches descending by score
                  const sortedMatches = [...(resultData.matches || [])].sort(
                    (a: any, b: any) => (b.match_score || b.matchScore || 0) - (a.match_score || a.matchScore || 0)
                  );
                  setJobMatches(sortedMatches);
                  setAnalysisProgress(100);
                  toast.success('Analysis complete!');

                  // Hide analysis modal after a short delay
                  setTimeout(() => {
                    setIsAnalyzing(false);
                    // Refresh the resumes list in the background
                    supabase.from('resumes').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
                      .then(({ data }) => { if (data) setResumes(data); });
                  }, 800);
                } else if (event.step) {
                  updateStepStatus(event.step, 'done');
                  const stepMap: any = { 'parsing': 20, 'ats': 40, 'skills': 60, 'suggestions': 80, 'matching': 95 };
                  if (stepMap[event.step]) setAnalysisProgress(stepMap[event.step]);

                  // Move next step to loading
                  const stepsSet = ['parsing', 'ats', 'skills', 'suggestions', 'matching'];
                  const currentIndex = stepsSet.indexOf(event.step);
                  if (currentIndex < stepsSet.length - 1) {
                    updateStepStatus(stepsSet[currentIndex + 1], 'loading');
                  }
                }
              } catch (e) {
                console.warn('Incomplete frame or parsing error:', e);
              }
            }
          }
        }
      }

    } catch (err: any) {
      toast.error(err.message || 'Analysis failed');
      setIsAnalyzing(false);
    }
  };

  const handleDeleteResume = async () => {
    // Single-Resume Policy: Wipe database and storage instantly
    await cleanupUserStorage();
    await supabase.from('resumes').delete().eq('user_id', user!.id);
    setResumes([]);
    setSelectedResume(null);
    setJobMatches([]);
    toast.success('All data and files cleared');
  };

  const handleSaveJob = async (jobId: string, isSaved: boolean) => {
    if (!user) return;
    const { error } = await supabase
      .from('job_matches')
      .update({ is_saved: isSaved })
      .eq('id', jobId);

    if (error) {
      toast.error('Failed to update job');
      return;
    }

    setJobMatches(prev => prev.map(m => m.id === jobId ? { ...m, is_saved: isSaved } : m));
    toast.success(isSaved ? 'Job saved!' : 'Removed from saved jobs');
  };

  const handleOpenCoverLetter = (match: any) => {
    setActiveJobMatch(match);
    setIsCoverLetterOpen(true);
  };

  if (!isAuthReady || !user) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      <PremiumSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        jobCount={jobMatches.length}
        suggestionCount={5}
        onLogout={handleLogout}
        onDeleteResume={handleDeleteResume}
        onPlanUpgrade={() => initiatePayment(299, 'Pro Plan')}
      />

      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-10 sticky top-0 z-10">
          <div className="space-y-1">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Resume Analysis</h1>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
              <span className="text-slate-600 truncate max-w-[200px]">{selectedResume?.file_name || 'Loading...'}</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span>Last analyzed: Today, 6:41 PM</span>
              <Badge className="bg-amber-50 text-amber-600 border-amber-100 ml-2">Free Plan</Badge>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => {
                handleTailor(preferences);
              }}
              disabled={isTailoring}
              variant="outline"
              className="h-11 px-6 rounded-xl border-slate-200 font-bold text-sm text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-all disabled:opacity-50 gap-2"
            >
              {isTailoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isTailoring ? 'Analyzing...' : 'Re-analyze'}
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="h-11 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-sm text-white shadow-lg shadow-indigo-100 transition-all"
            >
              Upload New
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.docx,.doc"
              onChange={handleFileSelect}
            />
          </div>
        </header>

        <div className="p-10 max-w-7xl mx-auto space-y-10">
          {activeTab === 'dashboard' && (
            <>
              {/* Personalization Section */}
              <section>
                <PersonalizationCard
                  onApply={handleTailor}
                  isLoading={isTailoring}
                  initialPreferences={preferences}
                />
              </section>

              {/* Main Analytics Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="xl:col-span-2 overflow-hidden">
                  <ScoreAnalytics
                    score={selectedResume?.resume_score || selectedResume?.score || 0}
                    atsScore={selectedResume?.score_breakdown?.atsScore || 0}
                    keywordScore={selectedResume?.score_breakdown?.keywordScore || 0}
                    readabilityScore={selectedResume?.score_breakdown?.readabilityScore || 0}
                    scoreBreakdown={selectedResume?.score_breakdown}
                  />
                </div>
                <div className="xl:col-span-1">
                  <StatsColumn
                    keywordsFound={`${jobMatches[0]?.matching_skills?.length || 0} skills`}
                    resumeLength={selectedResume?.raw_text ? `${Math.max(1, Math.ceil(selectedResume.raw_text.length / 3000))} page(s)` : "1 page"}
                    skillGaps={jobMatches[0]?.missing_skills?.length || 0}
                    weakBullets={selectedResume?.score_breakdown?.weaknesses?.length || 0}
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === 'jobs' && (
            <section className="pt-6">
              <MatchResults
                matches={jobMatches}
                isPro={profile?.plan === 'pro'}
                onUpgrade={() => initiatePayment(299, 'Pro Plan')}
                onSave={handleSaveJob}
                onGenerateCoverLetter={handleOpenCoverLetter}
              />
            </section>
          )}

          {activeTab === 'ai' && (
            <section className="grid grid-cols-1 xl:grid-cols-3 gap-8 pb-20">
              <div className="xl:col-span-2 bg-white rounded-[32px] p-8 shadow-sm border border-slate-50">
                <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600" /> AI Improvement Suggestions
                </h3>
                <div className="space-y-6">
                  {selectedResume?.score_breakdown?.weaknesses?.map((w: string, i: number) => (
                    <div key={i} className="bg-rose-50/50 p-6 rounded-[24px] border border-rose-50 space-y-2">
                      <div className="flex items-center gap-2">
                         <Badge className="bg-rose-100 text-rose-600 border-none font-black text-[10px] uppercase tracking-tighter">High Priority</Badge>
                         <span className="text-xs font-bold text-slate-400">Work Experience</span>
                      </div>
                      <p className="text-sm font-medium text-slate-700 leading-relaxed">
                        {typeof w === 'string' ? w : JSON.stringify(w)}
                      </p>
                    </div>
                  ))}
                  {selectedResume?.score_breakdown?.recommendations?.map((r: string, i: number) => (
                    <div key={`rec-${i}`} className="bg-indigo-50/50 p-6 rounded-[24px] border border-indigo-50 space-y-2">
                      <div className="flex items-center gap-2">
                         <Badge className="bg-indigo-100 text-indigo-600 border-none font-black text-[10px] uppercase tracking-tighter">Suggestion</Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-700 leading-relaxed">
                        {typeof r === 'string' ? r : JSON.stringify(r)}
                      </p>
                    </div>
                  ))}
                  {(!selectedResume?.score_breakdown?.weaknesses?.length && !selectedResume?.score_breakdown?.recommendations?.length) && (
                    <p className="text-slate-500 font-medium">No suggestions found. Your resume looks good!</p>
                  )}
                </div>
              </div>

              <div className="xl:col-span-1 bg-white rounded-[32px] p-8 shadow-sm border border-slate-50 relative overflow-hidden">
                <h3 className="text-xl font-black text-slate-900 mb-6">Cover Letter Generator</h3>
                <div className={`${profile?.plan !== 'pro' ? 'blur-[2px] opacity-20 pointer-events-none' : ''}`}>
                  <div className="flex flex-col gap-4">
                    <p className="text-sm text-slate-600">Select a matched job from the Job Matches tab to generate a highly tailored cover letter using AI.</p>
                    <Button
                      disabled={jobMatches.length === 0}
                      onClick={() => setActiveTab('jobs')}
                      className="rounded-xl bg-indigo-600 w-fit"
                    >
                      View Job Matches
                    </Button>
                  </div>
                </div>
                {profile?.plan !== 'pro' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-white/40 backdrop-blur-[2px]">
                    <div className="h-14 w-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                      <Lock className="h-7 w-7 text-indigo-600" />
                    </div>
                    <h4 className="font-black text-slate-900 mb-2">Pro Feature</h4>
                    <p className="text-sm font-medium text-slate-500 mb-6">Generate tailored cover letters for any role in seconds</p>
                    <Button className="rounded-xl bg-indigo-600 px-8" onClick={() => initiatePayment(299, 'Pro Plan')}>Upgrade to Pro</Button>
                  </div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'resume' && (
            <section className="space-y-8 pb-20">
              <div className="bg-white rounded-[40px] p-10 shadow-sm border border-slate-50 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8">
                  <Badge className="bg-indigo-50 text-indigo-600 border-none font-black text-[10px] tracking-widest uppercase px-4 py-2">AI Optimizer Active</Badge>
                </div>

                <div className="max-w-3xl">
                  <h3 className="text-3xl font-black text-slate-900 mb-2">Smart Resume Optimizer</h3>
                  <p className="text-slate-500 font-medium mb-10">Select any achievement bullet below to enhance its impact using NVIDIA AI.</p>
                  <div className="space-y-12">
                    {/* 1. Profile Header & Links (Static) */}
                    <div className="bg-slate-50/50 p-8 rounded-[32px] border border-slate-100 flex flex-col md:flex-row justify-between gap-6">
                      <div className="space-y-3">
                        <h4 className="text-2xl font-black text-slate-900">{selectedResume?.parsedData?.fullName || selectedResume?.parsed_data?.fullName || "Candidate Name"}</h4>
                        <div className="flex flex-wrap gap-4">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                            <Mail className="h-4 w-4 text-indigo-500" />
                            {selectedResume?.parsedData?.email || selectedResume?.parsed_data?.email || "No email detected"}
                          </div>
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                            <Phone className="h-4 w-4 text-indigo-500" />
                            {selectedResume?.parsedData?.phone || selectedResume?.parsed_data?.phone || "No phone detected"}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {['linkedin', 'github', 'portfolio'].map((type) => {
                          const links = selectedResume?.parsedData?.links || selectedResume?.parsed_data?.links || {};
                          const url = links[type];
                          if (!url) return null;

                          const Icon = type === 'linkedin' ? Linkedin : type === 'github' ? Github : ExternalLink;
                          return (
                            <a
                              key={type}
                              href={url.startsWith('http') ? url : `https://${url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                            >
                              <Icon className="h-5 w-5" />
                            </a>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Professional Summary (Static - No Enhance for now per user request for static fields) */}
                    {(selectedResume?.parsedData?.summary || selectedResume?.parsed_data?.summary) && (
                      <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                          <FileText className="h-3 w-3" /> Professional Summary
                        </h4>
                        <p className="text-slate-700 font-medium leading-relaxed bg-white border border-slate-100 p-6 rounded-2xl">
                          {selectedResume?.parsedData?.summary || selectedResume?.parsed_data?.summary}
                        </p>
                      </div>
                    )}

                    {/* 3. Work Experience (Enhanced) */}
                    <div className="space-y-10">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Briefcase className="h-3 w-3" /> Work Experience
                      </h4>
                      {(selectedResume?.parsedData?.experience || selectedResume?.parsed_data?.experience || []).map((exp: any, expIdx: number) => (
                        <div key={expIdx} className="space-y-5">
                          <div>
                            <div className="flex items-center gap-3">
                              <h4 className="text-xl font-black text-slate-900">{exp.title}</h4>
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-200" />
                              <span className="text-xs font-bold text-slate-400">{exp.duration}</span>
                            </div>
                            <p className="text-indigo-600 font-bold text-sm tracking-tight">{exp.company}</p>
                          </div>

                          <div className="space-y-3">
                            {exp.description?.map((bullet: string, bulletIdx: number) => (
                              <div key={bulletIdx} className="group relative bg-white border border-slate-100 hover:shadow-xl hover:shadow-indigo-100/30 p-5 rounded-[20px] transition-all duration-300">
                                <p className="text-slate-700 font-medium leading-relaxed pr-24 text-[15px]">{bullet}</p>
                                <Button
                                  size="sm"
                                  disabled={optimizingIndex === `${expIdx}-${bulletIdx}`}
                                  onClick={() => handleOptimizeBullet(expIdx, bulletIdx, bullet)}
                                  className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 font-bold text-[10px] tracking-tight h-8 px-4 transition-all"
                                >
                                  {optimizingIndex === `${expIdx}-${bulletIdx}` ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <><Sparkles className="h-3 w-3 mr-1.5" /> Enhance</>
                                  )}
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 4. Education & Certifications (Static) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {/* Education Area */}
                      <div className="space-y-6">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                          <GraduationCap className="h-3 w-3" /> Education
                        </h4>
                        <div className="space-y-4">
                          {(selectedResume?.parsedData?.education || selectedResume?.parsed_data?.education || []).map((edu: any, i: number) => (
                            <div key={i} className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm">
                              <h5 className="font-black text-slate-900 text-sm">{edu.degree}</h5>
                              <p className="text-xs font-bold text-slate-500 mb-1">{edu.institution}</p>
                              <p className="text-[10px] font-black text-indigo-600">{edu.year}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Certifications Area */}
                      <div className="space-y-6">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Award className="h-3 w-3" /> Certifications & Awards
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {(selectedResume?.parsedData?.certifications || selectedResume?.parsed_data?.certifications || []).map((cert: string, i: number) => (
                            <Badge key={i} className="bg-slate-50 text-slate-600 border border-slate-100 py-2 px-4 rounded-xl font-bold text-xs shadow-sm hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                              {cert}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden">
                <div className="absolute -right-20 -bottom-20 h-64 w-64 bg-indigo-500/20 rounded-full blur-3xl" />
                <h3 className="text-xl font-black mb-2">Pro Tip: Impact over Responsibility</h3>
                <p className="text-slate-400 font-medium max-w-xl">AI-optimized bullets focus on quantifiable results. Try to include percentages, dollar amounts, or time saved in your original text for the best results.</p>
              </div>
            </section>
          )}

          {activeTab === 'settings' && (
            <section className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-50">
              <h3 className="text-xl font-black text-slate-900 mb-6">Account Settings</h3>
              <p className="text-slate-500">Logged in as {user.email}</p>
              <Button onClick={handleLogout} variant="danger" className="mt-4 rounded-xl">Sign Out</Button>
            </section>
          )}
        </div>

        {/* Analyzing Overlay */}
        <AnimatePresence>
          {isAnalyzing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-md flex items-center justify-center p-6"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="max-w-5xl w-full bg-white rounded-[40px] shadow-2xl shadow-indigo-200/50 overflow-hidden"
              >
                <div className="flex flex-col lg:flex-row">
                  <div className="lg:w-1/2 bg-indigo-50/30 p-12 flex flex-col items-center justify-center border-r border-slate-50 relative overflow-hidden">
                    {/* Animated Scanning Effect */}
                    <div className="relative w-48 h-48">
                      <motion.div
                        animate={{ 
                          scale: [1, 1.3, 1],
                          opacity: [0.3, 0.1, 0.3]
                        }}
                        transition={{ duration: 4, repeat: Infinity }}
                        className="absolute inset-0 bg-indigo-500/10 rounded-full blur-3xl"
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative z-10 w-full h-full rounded-[3rem] bg-white border border-white/80 shadow-[0_25px_60px_rgba(79,70,229,0.12)] flex items-center justify-center"
                      >
                        <div className="relative">
                          <FileText className="h-24 w-24 text-indigo-600" />
                          <motion.div
                            animate={{ 
                              top: ["0%", "100%", "0%"]
                            }}
                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                            className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent blur-[1px]"
                          />
                        </div>
                      </motion.div>
                    </div>
                  </div>

                  {/* Right: Progress Content */}
                  <div className="lg:w-1/2 p-12 space-y-10 flex flex-col justify-center">
                    <div className="space-y-3">
                      <h2 className="text-[36px] font-black text-[#0f172a] tracking-tight leading-none">Analyzing...</h2>
                      <p className="text-slate-500 font-medium">
                        Our AI is currently matching <span className="text-indigo-600 font-bold">{fileName}</span> with your career goals.
                      </p>
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em]">Progress</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Elapsed: {formatElapsed(elapsedSeconds)}</span>
                      </div>
                      <Progress value={analysisProgress} className="h-2 bg-slate-100" />

                      <div className="flex items-center gap-2 py-2">
                        <motion.div
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="h-2 w-2 rounded-full bg-indigo-600"
                        />
                        <span className="text-xs font-bold text-slate-500 italic">{getStatusMessage()}</span>
                      </div>
                    </div>

                    <div className="space-y-6 pt-4">
                      {analysisSteps.map((step) => (
                        <div key={step.id} className="flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                            <div className={`
                              h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-500
                              ${step.status === 'done' ? 'bg-emerald-50 text-emerald-500 scale-95' :
                                step.status === 'loading' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 ring-4 ring-indigo-50' :
                                  'bg-slate-50 text-slate-200'}
                            `}>
                              {step.status === 'done' ? <CheckCircle2 className="h-7 w-7" /> :
                                step.status === 'loading' ? <Loader2 className="h-6 w-6 animate-spin" /> :
                                  <div className="h-3 w-3 rounded-full bg-current opacity-20" />}
                            </div>
                            <span className={`
                              text-[17px] font-black tracking-tight transition-colors duration-500
                              ${step.status === 'done' ? 'text-slate-900' :
                                step.status === 'loading' ? 'text-indigo-600 scale-105 origin-left' : 'text-slate-300'}
                            `}>
                              {step.label}
                            </span>
                          </div>
                          {step.status === 'done' && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                            >
                              <Badge className="bg-emerald-500 text-white border-none font-black text-[9px] tracking-widest uppercase px-2 py-0.5">Done</Badge>
                            </motion.div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <CoverLetterModal
          isOpen={isCoverLetterOpen}
          onClose={() => setIsCoverLetterOpen(false)}
          resume={selectedResume}
          jobMatch={activeJobMatch}
        />
      </main>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick, count }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between w-full px-4 py-3 rounded-xl text-sm font-medium transition-all ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/50'
        }`}
    >
      <div className="flex items-center gap-3">
        {React.cloneElement(icon, { className: 'h-5 w-5' })}
        {label}
      </div>
      {count !== undefined && (
        <Badge variant="secondary" className="h-5 min-w-5 px-1 flex items-center justify-center rounded-full bg-muted text-[10px]">
          {count}
        </Badge>
      )}
    </button>
  );
}

function MetricCard({ icon, title, score, color, feedback }: any) {
  return (
    <Card className="rounded-3xl border-none shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--bg-muted)]">{icon}</div>
            <h4 className="text-h4 font-bold">{title}</h4>
          </div>
          <span className="text-h2 font-black">{score}</span>
        </div>
        <Progress value={score} className="h-2 mb-4" />
        <div className="rounded-xl bg-[var(--bg-muted)] p-4 flex gap-3 items-start">
          <div className="mt-0.5"><AlertCircle className="h-4 w-4 text-subtle" /></div>
          <p className="text-small text-muted-foreground leading-relaxed">{feedback}</p>
        </div>
      </CardContent>
    </Card>
  );
}


