"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef } from 'react';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  Zap,
  Target,
  Shield,
  ArrowRight,
  Upload,
  FileText,
  Sparkles,
  Search,
  Briefcase,
  ChevronRight,
  Star,
  Menu,
  X,
  Lock,
  Unlock,
  Crown,
  Loader2,
  TrendingUp,
  User,
  Wand2,
  Send,
  Kanban,
  Gauge,
  MailCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AuthModal } from '@/components/common/AuthModal';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { LoadingScreen } from '@/components/ui/loading';
import { completeResumeAnalysis, tailorResume } from '@/app/actions/resume';
import { saveGuestFile, loadGuestFile, clearGuestFile } from '@/lib/guestFile';
import { Logo, BrandMark } from '@/components/brand/Logo';

export default function LandingPage() {
  const GUEST_ONBOARDING_STATE_KEY = 'guestOnboardingState';
  const router = useRouter();
  const { user, profile } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // File Upload & Stream State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  
  // Analyzing Overlay State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysisSteps, setAnalysisSteps] = useState([
    { id: 'parsing', label: 'Parsing resume structure', status: 'pending' },
    { id: 'ats', label: 'Checking ATS compatibility', status: 'pending' },
    { id: 'skills', label: 'Extracting skills & keywords', status: 'pending' },
    { id: 'suggestions', label: 'Generating improvement suggestions', status: 'pending' },
    { id: 'matching', label: 'Matching with 500+ job roles', status: 'pending' },
  ]);

  // Personalization Overlay State
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [personalizeData, setPersonalizeData] = useState({ targetRole: '', experienceLevel: '', location: '' });
  const [isTailoring, setIsTailoring] = useState(false);
  const [fullAnalysisData, setFullAnalysisData] = useState<any>(null);
  const [activeResumeId, setActiveResumeId] = useState('guest');

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (user) {
      const checkResumes = async () => {
        const { count, error } = await supabase
          .from('resumes')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (!error && count !== null) {
          setResumeCount(count);
        }
      };
      checkResumes();
    } else {
      setResumeCount(null);
    }
  }, [user]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setMobileMenuOpen(false);
    }
  };

  // Upload Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const updateStepStatus = (id: string, status: 'pending' | 'loading' | 'done') => {
    setAnalysisSteps(prev => prev.map(step => step.id === id ? { ...step, status } : step));
  };

  const processFile = async (file: File) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    const isAllowedType = allowedTypes.includes(file.type) || file.name.toLowerCase().endsWith('.pdf') || file.name.toLowerCase().endsWith('.docx');

    if (!isAllowedType) return toast.error('Unsupported file type. Please upload a PDF or DOCX resume.');
    if (file.size > 5 * 1024 * 1024) return toast.error('File size exceeds 5MB limit');

    if (user) {
      router.push('/dashboard');
      return; 
    }

    fileRef.current = file;
    saveGuestFile(file);
    setFileName(file.name);
    setIsAnalyzing(true);
    setUploadProgress(10);
    setAnalysisSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${backendUrl}/api/resume/process-stream`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Backend connection failed');
      if (!response.body) throw new Error('No stream available');

      const reader = response.body.getReader();
      const decoder = new (window.TextDecoder || TextDecoder)();
      let done = false;
      let buffer = '';
      let receivedFinalEvent = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() || '';

          for (const frame of frames) {
            if (frame.startsWith('data: ')) {
              try {
                const event = JSON.parse(frame.replace('data: ', ''));

                if (event.type === 'ping') {
                  continue; // Keep connection alive
                }

                if (event.step === 'final') {
                  receivedFinalEvent = true;
                  setFullAnalysisData(event.data);
                  setActiveResumeId('guest');
                  
                  setUploadProgress(100);
                  toast.success('Analysis complete!');
                  setTimeout(() => {
                    setIsAnalyzing(false);
                    sessionStorage.setItem(GUEST_ONBOARDING_STATE_KEY, JSON.stringify({
                      analysisData: event.data,
                      activeResumeId: 'guest',
                      fileName: file.name,
                      fileSize: file.size,
                      fileType: file.type,
                    }));
                    router.push('/onboarding');
                  }, 800);
                } else if (event.step) {
                  updateStepStatus(event.step, event.status);
                  const stepMap: Record<string, number> = { 'parsing': 20, 'ats': 40, 'skills': 60, 'suggestions': 80, 'matching': 95 };
                  if (stepMap[event.step]) setUploadProgress(stepMap[event.step]);
                } else if (event.error) {
                  throw new Error(event.error);
                }
              } catch (e) {
                console.warn('Parsing SSE frame failed', e);
              }
            }
          }
        }
      }

      // Safety Valve: If stream ended but we have data and haven't transitioned yet
      if (receivedFinalEvent && isAnalyzing) {
        setUploadProgress(100);
        setTimeout(() => {
          setIsAnalyzing(false);
          router.push('/onboarding');
        }, 800);
      } else if (!receivedFinalEvent && isAnalyzing) {
         // Something went wrong, stream ended without data
         throw new Error('Analysis stream ended prematurely');
      }

    } catch (error: any) {
      console.error('Analysis failed', error);
      const message = error?.message || 'Failed to process resume. Please try again.';
      const friendlyMessage = message.includes('Unsupported') || message.includes('PDF or DOCX')
        ? 'Unsupported file type. Please upload a PDF or DOCX resume.'
        : message;
      toast.error(friendlyMessage);
      setIsAnalyzing(false);
    }
  };

  // Handle migration after auth
  useEffect(() => {
    if (user && profile && fullAnalysisData && activeResumeId === 'guest' && !isTailoring) {
      handlePersonalizeComplete();
    }
  }, [user, profile, fullAnalysisData]);

  const handlePersonalizeComplete = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setIsTailoring(true);
    try {
      if (!fullAnalysisData) {
        throw new Error('No analysis data found to migrate. Please try uploading again.');
      }

      let resumeId = activeResumeId;

      if (resumeId === 'guest') {
        let file = fileRef.current;

        // The original file may no longer be in memory (e.g. page was refreshed
        // or navigated during the guest analysis). Restore it from IndexedDB so
        // the resume can be uploaded to storage instead of failing silently.
        if (!file) {
          file = await loadGuestFile();
        }

        if (!file) {
          setFullAnalysisData(null);
          setActiveResumeId('guest');
          setIsPersonalizing(false);
          setIsTailoring(false);
          toast.error('Session expired. Please re-upload your resume to link it to your account.');
          return;
        }

        const filePath = `resumes/${user.id}/${Date.now()}_${file.name}`;

        const { error: uploadError } = await supabase.storage.from('resumes').upload(filePath, file);
        if (uploadError) throw new Error(`Migrate upload failed: ${uploadError.message}`);

        const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(filePath);

        const { data: resumeData, error: resumeError } = await supabase
          .from('resumes')
          .insert({
            user_id: user.id,
            file_name: file.name,
            file_url: publicUrl,
            file_type: file.name.endsWith('.pdf') ? 'pdf' : 'docx',
            file_size_bytes: file.size,
            status: 'parsing',
          })
          .select()
          .single();

        if (resumeError) throw resumeError;
        resumeId = resumeData.id;
        setActiveResumeId(resumeId);
      }

      // Persist the guest analysis immediately (fast DB write) so the migration
      // always succeeds even if the tailor call fails below.
      if (resumeId !== 'guest' && fullAnalysisData) {
        await completeResumeAnalysis(user.id, resumeId, fullAnalysisData);
      }

      if (resumeId !== 'guest') {
        // Single tailor call reusing the guest analysis so the backend skips
        // the expensive re-analysis (no duplicate AI pass on migration).
        const result = await tailorResume(
          user.id,
          resumeId,
          personalizeData,
          fullAnalysisData.parsed_data,
          {
            analysis: fullAnalysisData.analysis,
            rawText: fullAnalysisData.raw_text,
          }
        );
        if (!result.success) {
          console.warn('Tailor step failed, but analysis is already persisted:', (result as any).error);
        }
        clearGuestFile();
        sessionStorage.removeItem(GUEST_ONBOARDING_STATE_KEY);
      }

      toast.success('Strategy optimized!');
      
      // Clear migration state before redirecting
      setFullAnalysisData(null);
      setActiveResumeId('guest');
      setIsPersonalizing(false);
      
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Migration Error:', error);
      toast.error(error.message || 'Failed to sync results to your account');
      setIsTailoring(false);
    }
  };

  const NAV_ITEMS = [
    { label: 'Capabilities', section: 'capabilities' },
    { label: 'How it Works', section: 'how-it-works' },
    { label: 'Pipeline', section: 'pipeline' },
    { label: 'Pricing', section: 'pricing' },
  ];

  return (
    <div className="min-h-screen bg-[#0B1220] text-slate-100 selection:bg-teal-500/30 selection:text-white font-sans">
      {/* Navigation */}
      <nav className={`fixed top-0 inset-x-0 z-[100] transition-all duration-300 ${
        scrolled ? 'bg-[#0B1220]/90 backdrop-blur-md border-b border-white/10 py-3 shadow-lg' : 'bg-transparent py-5'
      }`}>
        <div className="container mx-auto px-6 lg:px-12 flex items-center justify-between">
          <Logo size={32} variant="light" textClassName="text-xl font-bold tracking-tight" />

          <div className="hidden md:flex items-center gap-8">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.section}
                onClick={() => scrollToSection(item.section)}
                className="text-sm font-semibold text-slate-300 hover:text-teal-300 transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            {!user ? (
              <>
                <button 
                  onClick={() => setShowAuthModal(true)} 
                  className="px-4 py-2 text-sm font-bold text-slate-200 hover:text-teal-300 transition-colors"
                >
                  Sign In
                </button>
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="h-10 px-6 rounded-xl bg-teal-500 hover:bg-teal-400 text-[#0B1220] font-bold shadow-lg shadow-teal-500/25"
                >
                  Get Started Free
                </Button>
              </>
            ) : (
              <Button 
                onClick={() => router.push('/dashboard')} 
                className="h-10 px-6 rounded-xl bg-teal-500 hover:bg-teal-400 text-[#0B1220] font-bold shadow-lg shadow-teal-500/25"
              >
                Go to Dashboard
              </Button>
            )}
          </div>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-slate-200 hover:bg-white/10 rounded-lg transition-colors relative z-[110]">
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-[105] bg-[#0B1220] md:hidden pt-24 px-6"
            >
              <div className="flex flex-col gap-6 items-center text-center">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.section}
                    onClick={() => scrollToSection(item.section)}
                    className="text-2xl font-bold text-white hover:text-teal-300 active:scale-95 transition-all"
                  >
                    {item.label}
                  </button>
                ))}
                
                <hr className="w-full border-white/10 my-4" />
                
                {!user ? (
                  <div className="flex flex-col gap-4 w-full">
                    <button 
                      onClick={() => { setShowAuthModal(true); setMobileMenuOpen(false); }} 
                      className="w-full py-4 text-xl font-bold text-slate-200"
                    >
                      Sign In
                    </button>
                    <Button 
                      onClick={() => { fileInputRef.current?.click(); setMobileMenuOpen(false); }} 
                      className="w-full h-16 rounded-2xl bg-teal-500 text-[#0B1220] font-bold text-xl shadow-xl"
                    >
                      Get Started Free
                    </Button>
                  </div>
                ) : (
                  <Button 
                    onClick={() => { router.push('/dashboard'); setMobileMenuOpen(false); }} 
                    className="w-full h-16 rounded-2xl bg-teal-500 text-[#0B1220] font-bold text-xl shadow-xl"
                  >
                    Go to Dashboard
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-16 lg:pt-44 lg:pb-24 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-32 -mt-24 w-[400px] h-[400px] sm:w-[700px] sm:h-[700px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)",
            backgroundSize: "36px 36px",
          }}
        />

        <div className="container mx-auto px-4 sm:px-6 lg:px-12 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center lg:items-start text-center lg:text-left gap-6 lg:gap-8"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/30">
                <span className="flex h-2 w-2 rounded-full bg-teal-400 animate-pulse"></span>
                <span className="text-[10px] sm:text-xs font-bold text-teal-300 uppercase tracking-wide">AI Resume Copilot · India</span>
              </div>
              
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight leading-[1.05]">
                Your entire job hunt.{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-300 to-amber-300">
                  Amplified.
                </span>
              </h1>
              
              <p className="text-base sm:text-lg lg:text-xl text-slate-400 max-w-lg leading-relaxed">
                ATS score, JD-tailored rewrites, live job matches, cover letters and a Kanban pipeline — one workspace from upload to offer.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto mt-4">
                {(!user || resumeCount === 0) ? (
                  <Button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="w-full sm:w-auto h-16 px-10 rounded-2xl bg-teal-500 hover:bg-teal-400 text-[#0B1220] font-black text-lg shadow-xl shadow-teal-500/25 transition-all hover:-translate-y-0.5 active:scale-95"
                  >
                    Upload Resume <ArrowRight className="ml-2 h-6 w-6" />
                  </Button>
                ) : (
                  <Button 
                    onClick={() => router.push('/dashboard')} 
                    className="w-full sm:w-auto h-16 px-10 rounded-2xl bg-teal-500 hover:bg-teal-400 text-[#0B1220] font-black text-lg shadow-xl shadow-teal-500/25 transition-all hover:-translate-y-0.5 active:scale-95"
                  >
                    Analyze New Resume <ArrowRight className="ml-2 h-6 w-6" />
                  </Button>
                )}
                <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 font-bold whitespace-nowrap">
                  <Shield className="h-4 w-4 text-emerald-400" /> No credit card required.
                </div>
              </div>

              {/* Mini stats */}
              <div className="grid grid-cols-3 gap-6 pt-6 w-full lg:w-auto text-center lg:text-left">
                {[
                  { value: '89', label: 'Avg. ATS score after 1 pass', suffix: '/100' },
                  { value: '3.4x', label: 'More interview callbacks' },
                  { value: '25+', label: 'Job boards & ATS portals' },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col gap-1">
                    <span className="text-2xl sm:text-3xl font-black text-white">{s.value}<span className="text-teal-400 text-lg">{s.suffix || ''}</span></span>
                    <span className="text-[10px] sm:text-xs text-slate-500 font-bold leading-tight">{s.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Right Interactive Mockup (Now Active Dropzone) */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative w-full max-w-xl mx-auto lg:ml-auto"
            >
              <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-[32px] sm:rounded-[48px] shadow-2xl overflow-hidden p-3 sm:p-5">
                <div className="bg-[#0E1730] border border-white/5 rounded-[28px] sm:rounded-[40px] overflow-hidden">
                  <div className="bg-white/5 border-b border-white/10 flex items-center px-6 py-4 gap-3">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-400/80" />
                      <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                      <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                    </div>
                    <div className="mx-auto bg-white/5 rounded-full px-4 sm:px-12 py-1 text-[8px] sm:text-[10px] text-slate-500 tracking-[0.2em] font-black uppercase">
                      CAREERAMP_ANALYSIS_V1
                    </div>
                  </div>
                  
                  <div className="p-6 sm:p-12 flex flex-col items-center justify-center">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`relative group cursor-pointer w-full transition-all duration-300 ${isDragging ? 'scale-[1.02]' : ''}`}
                    >
                      <div className="absolute inset-0 bg-teal-500 rounded-3xl blur opacity-0 group-hover:opacity-20 transition-opacity duration-500" />
                      <div className={`relative border-2 border-dashed ${isDragging ? 'border-teal-400 bg-teal-500/10' : 'border-white/15 hover:border-teal-400/60 bg-white/5'} rounded-3xl p-8 sm:p-14 flex flex-col items-center justify-center transition-colors shadow-sm`}>
                        <div className={`h-16 w-16 sm:h-20 sm:w-20 rounded-3xl flex items-center justify-center mb-6 transition-all duration-500 ${isDragging ? 'bg-teal-500 text-[#0B1220] scale-110 shadow-xl' : 'bg-teal-500/15 text-teal-300 group-hover:scale-110'}`}>
                          <Upload className="h-8 w-8 sm:h-10 sm:w-10" />
                        </div>
                        <h3 className="text-xl sm:text-2xl font-black text-white mb-2 truncate max-w-full">Drop resume here</h3>
                        <p className="text-sm text-slate-500 mb-8 select-none font-medium whitespace-nowrap">PDF or DOCX (Max 5MB)</p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <span className="flex items-center gap-1.5 text-[10px] sm:text-xs font-black text-teal-300 bg-teal-500/10 px-3 py-2 rounded-full border border-teal-500/20">
                            <Zap className="h-3.5 w-3.5" /> ATS-READY
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] sm:text-xs font-black text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded-full border border-emerald-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5" /> 100% PRIVATE
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>


      {/* Hidden File Input */}
      <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.docx,.doc" onChange={handleFileSelect} />

      {/* Analyzing Overlay */}
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-[#0B1220]/90 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-5xl w-full bg-[#0E1730] rounded-[40px] shadow-2xl shadow-teal-500/10 border border-white/10 overflow-hidden"
            >
                <div className="flex flex-col lg:flex-row">
                  <div className="lg:w-1/2 bg-teal-500/5 p-12 flex flex-col items-center justify-center border-r border-white/5 relative overflow-hidden">
                    <LoadingScreen compact label="Analyzing…" sublabel={`Our AI is mapping ${fileName} against live jobs`} />
                  </div>
                <div className="lg:w-1/2 p-12 space-y-10 flex flex-col justify-center">
                  <div className="space-y-3">
                    <h2 className="text-[36px] font-black text-white tracking-tight leading-none">Analyzing...</h2>
                    <p className="text-slate-400 font-medium">Our AI is mapping <span className="text-teal-300 font-bold">{fileName}</span> against live jobs.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end"><span className="text-sm font-bold text-teal-300 uppercase tracking-widest">{uploadProgress}% Complete</span></div>
                    <Progress value={uploadProgress} className="h-3 bg-white/5" />
                  </div>
                  <div className="space-y-6">
                    {(analysisSteps || []).map((step) => (
                      <div key={step.id} className="flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm ${step.status === 'done' ? 'bg-emerald-500/10 text-emerald-400' : step.status === 'loading' ? 'bg-teal-500 text-[#0B1220] shadow-lg' : 'bg-white/5 text-slate-600'}`}>
                            {step.status === 'done' ? <CheckCircle2 className="h-6 w-6" /> : step.status === 'loading' ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="h-2.5 w-2.5 rounded-full bg-current opacity-30" />}
                          </div>
                          <span className={`text-[18px] font-bold transition-colors duration-300 ${step.status === 'done' ? 'text-white' : step.status === 'loading' ? 'text-teal-300' : 'text-slate-500'}`}>{step.label}</span>
                        </div>
                        {step.status === 'done' && <Badge className="bg-emerald-500/10 text-emerald-400 border-none font-black text-[10px] tracking-widest uppercase px-3 py-1">Ready</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Personalize Overlay for Non-Logged In Users */}
      <AnimatePresence>
        {isPersonalizing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[200] bg-[#0B1220]/90 backdrop-blur-md flex items-center justify-center p-6 overflow-y-auto"
          >
            <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="max-w-3xl w-full bg-[#0E1730] rounded-[32px] shadow-2xl border border-white/10 p-10 space-y-10 my-8">
              <div className="text-center space-y-4">
                <h1 className="text-[32px] font-extrabold text-white tracking-tight">One last thing</h1>
                <p className="text-slate-400 text-lg">Help us tailor your job matches to the Indian market.</p>
              </div>

              <div className="space-y-10">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-teal-300"><Zap className="h-5 w-5" /><h3 className="font-bold text-white">Your experience level</h3></div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[{ id: '0-1', label: 'Fresher (0–1 yr)' }, { id: '1-3', label: '1–3 years' }, { id: '3-6', label: '3–6 years' }, { id: '6-10', label: '6–10 years' }, { id: '10+', label: '10+ years' }].map((level) => (
                      <button key={level.id} onClick={() => setPersonalizeData({ ...personalizeData, experienceLevel: level.id })} className={`px-4 py-4 rounded-2xl border-2 font-bold text-[15px] transition-all duration-200 ${personalizeData.experienceLevel === level.id ? 'border-teal-500 bg-teal-500/10 text-teal-300 shadow-md' : 'border-white/10 text-slate-400 hover:border-white/20 hover:bg-white/5'}`}>
                        {level.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-teal-300"><Briefcase className="h-5 w-5" /><h3 className="font-bold text-white">Target job role</h3></div>
                  <div className="flex flex-wrap gap-2">
                    {['Software Engineer', 'Product Manager', 'Data Analyst', 'DevOps Engineer'].map((role) => (
                      <button key={role} onClick={() => setPersonalizeData({ ...personalizeData, targetRole: role })} className={`px-5 py-2.5 rounded-full border-2 font-bold text-sm transition-all ${personalizeData.targetRole === role ? 'border-teal-500 bg-teal-500/10 text-teal-300' : 'border-white/10 text-slate-400 hover:border-white/20'}`}>
                        {role}
                      </button>
                    ))}
                  </div>
                  <input type="text" placeholder="Or type a custom role..." className="w-full h-14 px-6 rounded-2xl border-2 border-white/10 bg-white/5 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 outline-none transition-all text-white font-medium placeholder:text-slate-500" value={personalizeData.targetRole} onChange={(e) => setPersonalizeData({ ...personalizeData, targetRole: e.target.value })} />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-teal-300"><User className="h-5 w-5" /><h3 className="font-bold text-white">Location</h3></div>
                  <div className="flex flex-wrap gap-2">
                    {['Bengaluru', 'Mumbai', 'Hyderabad', 'Pune', 'Delhi NCR', 'Remote'].map((loc) => (
                      <button key={loc} onClick={() => setPersonalizeData({ ...personalizeData, location: loc })} className={`px-5 py-2.5 rounded-full border-2 font-bold text-sm transition-all ${personalizeData.location === loc ? 'border-teal-500 bg-teal-500 text-[#0B1220] shadow-lg' : 'border-white/10 text-slate-400 hover:border-white/20'}`}>
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>

                <button disabled={!personalizeData.targetRole || !personalizeData.experienceLevel || !personalizeData.location || isTailoring} className={`w-full h-16 rounded-[20px] text-lg font-bold flex items-center justify-center gap-2 transition-all duration-300 ${(personalizeData.targetRole && personalizeData.experienceLevel && personalizeData.location && !isTailoring) ? 'bg-teal-500 text-[#0B1220] shadow-xl hover:scale-[1.02] active:scale-[0.98]' : 'bg-white/5 text-slate-500 cursor-not-allowed'}`} onClick={handlePersonalizeComplete}>
                  {isTailoring ? <><Loader2 className="h-6 w-6 animate-spin" /> Optimizing Analysis...</> : <>View My Resume Analysis <ArrowRight className="h-6 w-6" /></>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />

      {/* Capabilities Section */}
      <section id="capabilities" className="py-24 bg-[#0B1220] border-t border-white/5">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 text-center">
          <div className="max-w-3xl mx-auto mb-16 sm:mb-20 space-y-4">
            <p className="text-label text-teal-400">Capabilities</p>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight">One workspace. Every tool.</h2>
            <p className="text-base sm:text-lg text-slate-400 font-medium">Built for the Indian job market — freshers to FAANG-track professionals.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {[
              {
                title: "ATS Score (0-100)",
                desc: "Instant scoring across ATS compatibility, keyword density, formatting and readability. Know where you stand before a recruiter does.",
                badge: "Free",
                icon: <Gauge className="h-6 w-6" />,
              },
              {
                title: "Job Match %",
                desc: "AI compares your resume against live job descriptions and shows exactly how well you fit — with a percentage score and skill gaps.",
                badge: "Free",
                icon: <Target className="h-6 w-6" />,
              },
              {
                title: "JD-Tailored Rewrites",
                desc: "Paste any JD. AI rewrites your bullets to mirror the role's language and pushes your match score from 40% to 85% on average.",
                badge: "Pro",
                icon: <Wand2 className="h-6 w-6" />,
              },
              {
                title: "AI Cover Letters",
                desc: "Role-specific cover letters in your voice — with measurable wins, tone presets, and 130–150 word recruiter-tested length.",
                badge: "Pro",
                icon: <FileText className="h-6 w-6" />,
              },
              {
                title: "Job Tracker Pipeline",
                desc: "Kanban pipeline — saved, applied, interviewing, offer. Nudges before recruiters ghost you, notes per role.",
                badge: "Pro",
                icon: <Kanban className="h-6 w-6" />,
              },
              {
                title: "Referral Messages",
                desc: "Generate referral DM scripts that get replies — personalized with the right context and a clear ask.",
                badge: "Pro",
                icon: <Send className="h-6 w-6" />,
              },
            ].map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group relative bg-white/[0.04] p-6 sm:p-8 rounded-[28px] border border-white/10 hover:border-teal-500/30 transition-all duration-500 text-left backdrop-blur-sm"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className={`h-11 w-11 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center bg-teal-500/10 text-teal-300 border border-teal-500/20 group-hover:scale-110 transition-transform duration-300`}>
                    {card.icon}
                  </div>
                  <Badge className={`${card.badge === 'Free' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'} font-bold text-[9px] tracking-widest uppercase px-3 py-1 rounded-full`}>
                    {card.badge}
                  </Badge>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white mb-3 group-hover:text-teal-300 transition-colors">{card.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed font-medium">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* The Shift — CareerAmp vs Traditional */}
      <section className="py-24 bg-[#0E1730] border-t border-white/5">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20 space-y-4">
            <p className="text-label text-teal-400">The Shift</p>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">Job hunting looks different with CareerAmp.</h2>
            <p className="text-base sm:text-lg text-slate-400 font-medium">Most candidates lose to the queue, not to skill. Here's what changes when AI runs your pipeline.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-[28px] border border-teal-500/30 bg-teal-500/5 p-8 space-y-6">
              <div className="flex items-center gap-3">
                <BrandMark size={28} />
                <span className="text-lg font-black text-white">CareerAmp</span>
              </div>
              {[
                ['Resume creation', 'ATS-tuned templates that score 89+'],
                ['ATS scoring', '20+ point live audit mapped to real parsing'],
                ['Resume tailoring', 'Human-like rewrites against any JD'],
                ['Auto-fill', '100+ applications orchestrated daily'],
                ['Job tracking', 'Kanban pipeline + ghost nudges'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-teal-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-white text-sm">{k}</p>
                    <p className="text-sm text-slate-400">{v}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.02] p-8 space-y-6 opacity-70">
              <div className="flex items-center gap-3">
                <div className="h-7 w-7 rounded-lg bg-white/10 flex items-center justify-center text-slate-400 text-xs font-black">T</div>
                <span className="text-lg font-black text-slate-400">Traditional</span>
              </div>
              {[
                ['Resume creation', 'Generic template, manual edits'],
                ['ATS scoring', 'No feedback, blind rejections'],
                ['Resume tailoring', 'One resume for every job'],
                ['Auto-fill', 'Copy-paste, one at a time'],
                ['Job tracking', 'Spreadsheet chaos'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start gap-3">
                  <X className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-slate-400 text-sm">{k}</p>
                    <p className="text-sm text-slate-500">{v}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="py-24 bg-[#0B1220] border-t border-white/5">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20 space-y-4">
            <p className="text-label text-teal-400">How it Works</p>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">Three steps to your next offer</h2>
            <p className="text-base sm:text-lg text-slate-400 font-medium italic">Faster than cooking Maggi.</p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-12 relative">
             <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10" />
             
             {[
               { step: "01", title: "Upload", desc: "Drop your current PDF or Word resume. No formatting needed.", icon: <Upload className="h-8 w-8 text-teal-300" /> },
               { step: "02", title: "AI Scan", desc: "Our models analyze your profile and identify 500+ job matches.", icon: <Sparkles className="h-8 w-8 text-teal-300" /> },
               { step: "03", title: "Amplify", desc: "Rewrite weak bullets, tailor to JDs, and run your pipeline to the offer.", icon: <ArrowRight className="h-8 w-8 text-teal-300" /> }
             ].map((item, i) => (
               <div key={i} className="flex flex-col items-center text-center space-y-6">
                 <div className="h-20 w-20 rounded-[28px] bg-[#0E1730] border border-white/10 shadow-xl flex items-center justify-center relative">
                    <div className="absolute -top-3 -left-3 h-8 w-8 rounded-full bg-teal-500 flex items-center justify-center text-[10px] font-black text-[#0B1220]">{item.step}</div>
                    {item.icon}
                 </div>
                 <div className="space-y-2 px-4">
                    <h4 className="text-xl font-bold text-white">{item.title}</h4>
                    <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                 </div>
               </div>
             ))}
          </div>
        </div>
      </section>

      {/* Pipeline Section */}
      <section id="pipeline" className="py-24 bg-[#0E1730] border-t border-white/5">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <p className="text-label text-teal-400">Job Tracker</p>
              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">Never let an opportunity slip.</h2>
              <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
                Track every application across stages — saved, applied, interviewing, offer. Get nudges before recruiters ghost you.
              </p>
              <ul className="space-y-4">
                {[
                  'Kanban pipeline with one-click stage moves',
                  'Auto-import from Gmail confirmations',
                  'Smart reminders when a follow-up is overdue',
                  'Salary, location, and offer notes per role',
                ].map((f) => (
                  <li key={f} className="flex items-center gap-3 text-slate-300 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => (user ? router.push('/dashboard') : setShowAuthModal(true))}
                className="h-12 px-8 rounded-xl bg-teal-500 hover:bg-teal-400 text-[#0B1220] font-bold shadow-lg shadow-teal-500/25"
              >
                Open Tracker <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </motion.div>

            {/* Kanban mockup */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative"
            >
              <div className="rounded-[28px] border border-white/10 bg-[#0B1220] p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Kanban className="h-5 w-5 text-teal-400" />
                    <span className="font-black text-white">Pipeline · May</span>
                  </div>
                  <div className="flex gap-2">
                    {['Saved 12', 'Applied 28', 'Interview 6', 'Offer 2'].map((s) => (
                      <span key={s} className="text-[10px] font-black text-slate-400 bg-white/5 px-2.5 py-1 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { col: 'Saved', color: 'text-slate-400 border-slate-500/30', items: ['UI Engineer · Freshworks', 'Sr. Frontend · Razorpay'] },
                    { col: 'Applied', color: 'text-teal-300 border-teal-500/30', items: ['Backend Engineer · Swiggy', 'Data Analyst · Zerodha'] },
                    { col: 'Interviewing', color: 'text-amber-300 border-amber-500/30', items: ['Sr. Frontend · Razorpay · R2'] },
                    { col: 'Offer', color: 'text-emerald-300 border-emerald-500/30', items: ['Product Eng · PhonePe'] },
                  ].map((col) => (
                    <div key={col.col} className={`rounded-2xl border ${col.color} bg-white/[0.03] p-3 space-y-2`}>
                      <p className={`text-[10px] font-black uppercase tracking-wider ${col.color.split(' ')[0]}`}>{col.col}</p>
                      {col.items.map((it) => (
                        <div key={it} className="rounded-xl bg-[#0E1730] border border-white/10 p-3">
                          <p className="text-[11px] font-bold text-white leading-tight">{it}</p>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 bg-[#0B1220] border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] bg-teal-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
            <p className="text-label text-teal-400 mb-4">Pricing</p>
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4 text-white">Invest in your career.</h2>
            <p className="text-base sm:text-lg text-slate-400 font-medium">Choose a plan that fits your job search pace.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
             {/* Free Plan */}
             <div className="bg-white/[0.03] backdrop-blur-sm p-8 sm:p-10 rounded-[32px] sm:rounded-[40px] border border-white/10 space-y-8">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-2 text-white">Free</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl sm:text-5xl font-black text-white">₹0</span>
                    <span className="text-slate-500 font-medium text-sm">/forever</span>
                  </div>
                </div>
                <ul className="space-y-4">
                   {["3 Resume Analysis / month", "Basic ATS Scoring", "Top 5 Job Matches", "Basic Profile Dashboard"].map((f, i) => (
                     <li key={i} className="flex items-center gap-3 text-slate-300 text-sm"><CheckCircle2 className="h-4 w-4 text-teal-500" /> {f}</li>
                   ))}
                </ul>
                <Button className="w-full h-14 rounded-2xl bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold" onClick={() => fileInputRef.current?.click()}>Get Started</Button>
             </div>

             {/* Pro Plan */}
             <div className="bg-gradient-to-b from-teal-500/10 to-transparent text-white p-8 sm:p-10 rounded-[32px] sm:rounded-[40px] border border-teal-500/40 shadow-2xl shadow-teal-500/10 space-y-8 relative lg:scale-105">
                <div className="absolute top-6 right-8 bg-teal-500 text-[#0B1220] text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Best Value</div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-2 text-white">Pro</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl sm:text-5xl font-black text-white">₹299</span>
                    <span className="text-slate-400 font-medium text-sm">/month</span>
                  </div>
                </div>
                <ul className="space-y-4">
                   {["Unlimited Resume Analysis", "AI Bullet Point Rewriter", "JD-Tailored Resumes", "Job Tracker Pipeline", "AI Cover Letters", "Referral Messages", "Unlimited Job Matches"].map((f, i) => (
                     <li key={i} className="flex items-center gap-3 text-slate-200 text-sm font-medium"><CheckCircle2 className="h-4 w-4 text-teal-400" /> {f}</li>
                   ))}
                </ul>
                <Button className="w-full h-14 rounded-2xl bg-teal-500 hover:bg-teal-400 text-[#0B1220] font-black text-lg shadow-xl shadow-teal-500/20">Start Pro Now</Button>
             </div>

             {/* Enterprise */}
             <div className="bg-white/[0.03] backdrop-blur-sm p-8 sm:p-10 rounded-[32px] sm:rounded-[40px] border border-white/10 space-y-8 md:col-span-2 lg:col-span-1">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-2 text-white">College</h3>
                  <p className="text-slate-400 text-sm font-medium">For campus placement cells.</p>
                </div>
                <div className="pt-4">
                  <p className="text-slate-300 font-medium text-sm sm:text-base">Custom bulk pricing for institutions and placement officers.</p>
                </div>
                <Button className="w-full h-14 rounded-2xl bg-white/5 text-white border border-white/10 font-bold">Contact Sales</Button>
             </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 sm:py-32 bg-[#0E1730] border-t border-white/5">
        <div className="container mx-auto px-4 sm:px-6 max-w-5xl">
          <div className="bg-gradient-to-br from-teal-600 to-[#0E1730] rounded-[48px] sm:rounded-[64px] p-8 sm:p-16 text-center text-white space-y-8 relative overflow-hidden shadow-2xl border border-teal-500/30">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }} className="absolute -top-32 -right-32 w-64 h-64 border-4 border-white/10 rounded-full" />
            
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-none text-white">Stop sending resumes into the void.</h2>
            <p className="text-lg sm:text-xl text-teal-100/80 font-medium max-w-2xl mx-auto">Join thousands of Indian professionals using CareerAmp to land top-tier roles.</p>
            
            <div className="flex items-center justify-center gap-6 pt-4">
              <Button 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full sm:w-auto h-16 px-12 rounded-3xl bg-white text-teal-700 hover:bg-teal-50 font-black text-xl shadow-2xl transition-all hover:scale-105 active:scale-95"
              >
                Analyze My Resume <ArrowRight className="ml-2 h-6 w-6" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
