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
  User
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AuthModal } from '@/components/common/AuthModal';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { completeResumeAnalysis, tailorResume } from '@/app/actions/resume';

export default function LandingPage() {
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
    const isAllowedType = allowedTypes.includes(file.type) || file.name.endsWith('.pdf') || file.name.endsWith('.docx') || file.name.endsWith('.doc');

    if (!isAllowedType) return toast.error('Please upload a PDF or DOCX file');
    if (file.size > 5 * 1024 * 1024) return toast.error('File size exceeds 5MB limit');

    if (user) {
      router.push('/dashboard');
      return; 
    }

    fileRef.current = file;
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

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const messages = chunk.split('\n\n');

          for (const message of messages) {
            if (message.startsWith('data: ')) {
              try {
                const event = JSON.parse(message.replace('data: ', ''));

                if (event.type === 'ping') {
                  continue; // Keep connection alive
                }

                if (event.step === 'final') {
                  setFullAnalysisData(event.data);
                  setActiveResumeId('guest');
                  
                  setUploadProgress(100);
                  toast.success('Analysis complete!');
                  setTimeout(() => {
                    setIsAnalyzing(false);
                    setIsPersonalizing(true);
                  }, 800);
                } else if (event.step) {
                  updateStepStatus(event.step, event.status);
                  const stepMap: Record<string, number> = { 'parsing': 20, 'ats': 40, 'skills': 60, 'suggestions': 80, 'matching': 95 };
                  if (stepMap[event.step]) setUploadProgress(stepMap[event.step]);
                } else if (event.error) {
                  throw new Error(event.error);
                }
              } catch (e) {
                console.warn('Parsing SSE chunk failed', e);
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Analysis failed', error);
      toast.error('Failed to process resume. Please try again.');
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

      if (resumeId === 'guest' && fileRef.current) {
        const file = fileRef.current;
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

        await completeResumeAnalysis(user.id, resumeId, fullAnalysisData);
      }

      if (resumeId !== 'guest') {
        const result = await tailorResume(user.id, resumeId, personalizeData, fullAnalysisData.parsed_data);
        if (!result.success) throw new Error(result.error || 'Failed to tailor results');
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 font-sans">
      {/* Navigation */}
      <nav className={`fixed top-0 inset-x-0 z-[100] transition-all duration-300 ${
        scrolled ? 'bg-white/90 backdrop-blur-md border-b border-slate-200 py-3 shadow-sm' : 'bg-transparent py-5'
      }`}>
        <div className="container mx-auto px-6 lg:px-12 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">ResuMatch AI</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {['Capabilities', 'Free vs Pro', 'How it Works', 'Pricing'].map((item) => (
              <button
                key={item}
                onClick={() => scrollToSection(item.toLowerCase().replace(/ /g, '-'))}
                className="text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
              >
                {item}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            {!user ? (
              <>
                <button 
                  onClick={() => setShowAuthModal(true)} 
                  className="px-4 py-2 text-sm font-bold text-slate-700 hover:text-indigo-600 transition-colors"
                >
                  Sign In
                </button>
                <Button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="h-10 px-6 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-600/20"
                >
                  Get Started Free
                </Button>
              </>
            ) : (
              <Button 
                onClick={() => router.push('/dashboard')} 
                className="h-10 px-6 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-600/20"
              >
                Go to Dashboard
              </Button>
            )}
          </div>

          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors relative z-[110]">
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
              className="fixed inset-0 z-[105] bg-white md:hidden pt-24 px-6"
            >
              <div className="flex flex-col gap-6 items-center text-center">
                {['Capabilities', 'Free vs Pro', 'How it Works', 'Pricing'].map((item) => (
                  <button
                    key={item}
                    onClick={() => scrollToSection(item.toLowerCase().replace(/ /g, '-'))}
                    className="text-2xl font-bold text-slate-900 hover:text-indigo-600 active:scale-95 transition-all"
                  >
                    {item}
                  </button>
                ))}
                
                <hr className="w-full border-slate-100 my-4" />
                
                {!user ? (
                  <div className="flex flex-col gap-4 w-full">
                    <button 
                      onClick={() => { setShowAuthModal(true); setMobileMenuOpen(false); }} 
                      className="w-full py-4 text-xl font-bold text-slate-700"
                    >
                      Sign In
                    </button>
                    <Button 
                      onClick={() => { fileInputRef.current?.click(); setMobileMenuOpen(false); }} 
                      className="w-full h-16 rounded-2xl bg-indigo-600 text-white font-bold text-xl shadow-xl shadow-indigo-100"
                    >
                      Get Started Free
                    </Button>
                  </div>
                ) : (
                  <Button 
                    onClick={() => { router.push('/dashboard'); setMobileMenuOpen(false); }} 
                    className="w-full h-16 rounded-2xl bg-indigo-600 text-white font-bold text-xl shadow-xl shadow-indigo-100"
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
      <section className="relative pt-32 pb-16 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] bg-indigo-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[250px] h-[250px] sm:w-[500px] sm:h-[500px] bg-purple-100/50 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 sm:px-6 lg:px-12 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center lg:items-start text-center lg:text-left gap-6 lg:gap-8"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100/50">
                <span className="flex h-2 w-2 rounded-full bg-indigo-600 animate-pulse"></span>
                <span className="text-[10px] sm:text-xs font-bold text-indigo-700 uppercase tracking-wide">Optimized for Indian Tech roles</span>
              </div>
              
              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
                Beat the ATS. <br className="hidden sm:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                  Land the Interview.
                </span>
              </h1>
              
              <p className="text-base sm:text-lg lg:text-xl text-slate-600 max-w-lg leading-relaxed">
                Scan your resume against live JDs in seconds. Let AI fix formatting, identify missing skills, and rewrite weak bullet points.
              </p>

              <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto mt-4">
                {(!user || resumeCount === 0) ? (
                  <Button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="w-full sm:w-auto h-16 px-10 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-lg shadow-xl shadow-slate-900/10 transition-all hover:-translate-y-0.5 active:scale-95"
                  >
                    Upload Resume <ArrowRight className="ml-2 h-6 w-6" />
                  </Button>
                ) : (
                  <Button 
                    onClick={() => router.push('/dashboard')} 
                    className="w-full sm:w-auto h-16 px-10 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-lg shadow-xl shadow-slate-900/10 transition-all hover:-translate-y-0.5 active:scale-95"
                  >
                    Analyze New Resume <ArrowRight className="ml-2 h-6 w-6" />
                  </Button>
                )}
                <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-bold whitespace-nowrap">
                  <Shield className="h-4 w-4 text-emerald-500" /> No credit card required.
                </div>
              </div>
            </motion.div>

            {/* Right Interactive Mockup (Now Active Dropzone) */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative w-full max-w-xl mx-auto lg:ml-auto"
            >
              <div className="bg-white rounded-[32px] sm:rounded-[48px] border border-slate-200 shadow-2xl overflow-hidden p-3 sm:p-5">
                <div className="bg-slate-50 border border-slate-100 rounded-[28px] sm:rounded-[40px] overflow-hidden">
                  <div className="bg-white/50 border-b border-slate-100 flex items-center px-6 py-4 gap-3">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-400" />
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <div className="w-3 h-3 rounded-full bg-emerald-400" />
                    </div>
                    <div className="mx-auto bg-slate-100/50 rounded-full px-4 sm:px-12 py-1 text-[8px] sm:text-[10px] text-slate-400 tracking-[0.2em] font-black uppercase">
                      AI_ANALYSIS_ENGINE_V2
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
                      <div className="absolute inset-0 bg-indigo-600 rounded-3xl blur opacity-0 group-hover:opacity-10 transition-opacity duration-500" />
                      <div className={`relative border-2 border-dashed ${isDragging ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 hover:border-indigo-500 bg-white'} rounded-3xl p-8 sm:p-14 flex flex-col items-center justify-center transition-colors shadow-sm`}>
                        <div className={`h-16 w-16 sm:h-20 sm:w-20 rounded-3xl flex items-center justify-center mb-6 transition-all duration-500 ${isDragging ? 'bg-indigo-600 text-white scale-110 shadow-xl shadow-indigo-100' : 'bg-indigo-50 text-indigo-600 group-hover:scale-110'}`}>
                          <Upload className="h-8 w-8 sm:h-10 sm:w-10" />
                        </div>
                        <h3 className="text-xl sm:text-2xl font-black text-slate-900 mb-2 truncate max-w-full">Drop resume here</h3>
                        <p className="text-sm text-slate-500 mb-8 select-none font-medium whitespace-nowrap">PDF or DOCX (Max 5MB)</p>
                        <div className="flex flex-wrap items-center justify-center gap-3">
                          <span className="flex items-center gap-1.5 text-[10px] sm:text-xs font-black text-indigo-700 bg-indigo-50 px-3 py-2 rounded-full">
                            <Zap className="h-3.5 w-3.5" /> FAST PARSE
                          </span>
                          <span className="flex items-center gap-1.5 text-[10px] sm:text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-2 rounded-full">
                            <CheckCircle2 className="h-3.5 w-3.5" /> 100% SECURE
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

      {/* Analyzing Overlay (Identical to Dashboard & Onboarding) */}
      <AnimatePresence>
        {isAnalyzing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-white/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-5xl w-full bg-white rounded-[40px] shadow-2xl shadow-indigo-200/50 overflow-hidden"
            >
              <div className="flex flex-col lg:flex-row">
                <div className="lg:w-1/2 bg-indigo-50/30 p-12 flex flex-col items-center justify-center border-r border-slate-50">
                  <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }} className="relative">
                    <img src="/assets/scanning.png" alt="Analyzing Resume" className="w-full max-w-sm drop-shadow-2xl" />
                    <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute -top-4 -right-4 h-12 w-12 rounded-2xl bg-white shadow-xl flex items-center justify-center">
                      <FileText className="h-6 w-6 text-indigo-600" />
                    </motion.div>
                  </motion.div>
                </div>
                <div className="lg:w-1/2 p-12 space-y-10 flex flex-col justify-center">
                  <div className="space-y-3">
                    <h2 className="text-[36px] font-black text-[#0f172a] tracking-tight leading-none">Analyzing...</h2>
                    <p className="text-slate-500 font-medium">Our AI is mapping <span className="text-indigo-600 font-bold">{fileName}</span> against live jobs.</p>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end"><span className="text-sm font-bold text-indigo-600 uppercase tracking-widest">{uploadProgress}% Complete</span></div>
                    <Progress value={uploadProgress} className="h-3 bg-slate-100" />
                  </div>
                  <div className="space-y-6">
                    {analysisSteps.map((step) => (
                      <div key={step.id} className="flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm ${step.status === 'done' ? 'bg-emerald-50 text-emerald-500' : step.status === 'loading' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-300'}`}>
                            {step.status === 'done' ? <CheckCircle2 className="h-6 w-6" /> : step.status === 'loading' ? <Loader2 className="h-5 w-5 animate-spin" /> : <div className="h-2.5 w-2.5 rounded-full bg-current opacity-30" />}
                          </div>
                          <span className={`text-[18px] font-bold transition-colors duration-300 ${step.status === 'done' ? 'text-slate-900' : step.status === 'loading' ? 'text-indigo-600' : 'text-slate-300'}`}>{step.label}</span>
                        </div>
                        {step.status === 'done' && <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[10px] tracking-widest uppercase px-3 py-1">Ready</Badge>}
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
            className="fixed inset-0 z-[200] bg-white/90 backdrop-blur-md flex items-center justify-center p-6 overflow-y-auto"
          >
            <motion.div initial={{ y: 20 }} animate={{ y: 0 }} className="max-w-3xl w-full bg-white rounded-[32px] shadow-2xl shadow-slate-200/60 p-10 space-y-10 my-8">
              <div className="text-center space-y-4">
                <h1 className="text-[32px] font-extrabold text-slate-900 tracking-tight">One last thing</h1>
                <p className="text-slate-500 text-lg">Help us tailor your job matches to the Indian market.</p>
              </div>

              <div className="space-y-10">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-indigo-600"><Zap className="h-5 w-5" /><h3 className="font-bold text-slate-800">Your experience level</h3></div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[{ id: '0-1', label: 'Fresher (0–1 yr)' }, { id: '1-3', label: '1–3 years' }, { id: '3-6', label: '3–6 years' }, { id: '6-10', label: '6–10 years' }, { id: '10+', label: '10+ years' }].map((level) => (
                      <button key={level.id} onClick={() => setPersonalizeData({ ...personalizeData, experienceLevel: level.id })} className={`px-4 py-4 rounded-2xl border-2 font-bold text-[15px] transition-all duration-200 ${personalizeData.experienceLevel === level.id ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600 shadow-md' : 'border-slate-100 text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}>
                        {level.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-indigo-600"><Briefcase className="h-5 w-5" /><h3 className="font-bold text-slate-800">Target job role</h3></div>
                  <div className="flex flex-wrap gap-2">
                    {['Software Engineer', 'Product Manager', 'Data Analyst', 'DevOps Engineer'].map((role) => (
                      <button key={role} onClick={() => setPersonalizeData({ ...personalizeData, targetRole: role })} className={`px-5 py-2.5 rounded-full border-2 font-bold text-sm transition-all ${personalizeData.targetRole === role ? 'border-indigo-600 bg-indigo-50/50 text-indigo-600' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}>
                        {role}
                      </button>
                    ))}
                  </div>
                  <input type="text" placeholder="Or type a custom role..." className="w-full h-14 px-6 rounded-2xl border-2 border-slate-100 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-slate-700 font-medium" value={personalizeData.targetRole} onChange={(e) => setPersonalizeData({ ...personalizeData, targetRole: e.target.value })} />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-indigo-600"><User className="h-5 w-5" /><h3 className="font-bold text-slate-800">Location</h3></div>
                  <div className="flex flex-wrap gap-2">
                    {['Bengaluru', 'Mumbai', 'Hyderabad', 'Pune', 'Delhi NCR', 'Remote'].map((loc) => (
                      <button key={loc} onClick={() => setPersonalizeData({ ...personalizeData, location: loc })} className={`px-5 py-2.5 rounded-full border-2 font-bold text-sm transition-all ${personalizeData.location === loc ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'border-slate-100 text-slate-500 hover:border-slate-200'}`}>
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>

                <button disabled={!personalizeData.targetRole || !personalizeData.experienceLevel || !personalizeData.location || isTailoring} className={`w-full h-16 rounded-[20px] text-lg font-bold flex items-center justify-center gap-2 transition-all duration-300 ${(personalizeData.targetRole && personalizeData.experienceLevel && personalizeData.location && !isTailoring) ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 hover:scale-[1.02] active:scale-[0.98]' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`} onClick={handlePersonalizeComplete}>
                  {isTailoring ? <><Loader2 className="h-6 w-6 animate-spin" /> Optimizing Analysis...</> : <>View My Resume Analysis <ArrowRight className="h-6 w-6" /></>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />

      {/* Capabilities Section */}
      <section id="capabilities" className="py-24 bg-slate-50/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 text-center">
          <div className="max-w-3xl mx-auto mb-16 sm:mb-24 space-y-4">
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">Everything you need to land your next role</h2>
            <p className="text-base sm:text-lg text-slate-500 font-medium">Built specifically for the Indian job market — from freshers to professionals targeting FAANG.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {[
              {
                title: "Resume Score (0-100)",
                desc: "Get an instant score across ATS compatibility, keyword density, formatting, and readability. Know exactly where you stand.",
                badge: "Free",
                icon: <Target className="h-6 w-6" />,
                color: "bg-indigo-100/50 text-indigo-600"
              },
              {
                title: "Job Match %",
                desc: "AI compares your resume against live job descriptions and shows how well you match each role — with a percentage score.",
                badge: "Free",
                icon: <TrendingUp className="h-6 w-6" />,
                color: "bg-purple-100/50 text-purple-600"
              },
              {
                title: "Missing Skills Detection",
                desc: "See exactly which skills employers are looking for that are absent from your resume — and how to add them effectively.",
                badge: "Free",
                icon: <Search className="h-6 w-6" />,
                color: "bg-amber-100/50 text-amber-600"
              },
              {
                title: "ATS Optimization",
                desc: "Ensure your resume passes Applicant Tracking Systems used by top Indian companies like TCS, Infosys, Flipkart, and Swiggy",
                badge: "Free",
                icon: <Zap className="h-6 w-6" />,
                color: "bg-blue-100/50 text-blue-600"
              },
              {
                title: "AI Bullet Point Rewrites",
                desc: "Weak bullet points rewritten by AI to be impact-focused, quantified, and action-oriented. Copy with one click",
                badge: "Pro",
                icon: <Sparkles className="h-6 w-6" />,
                color: "bg-rose-100/50 text-rose-600"
              },
              {
                title: "Cover Letter Generator",
                desc: "Generate a tailored cover letter for any role in seconds. Customized for Indian job market tone and format",
                badge: "Pro",
                icon: <FileText className="h-6 w-6" />,
                color: "bg-emerald-100/50 text-emerald-600"
              }
            ].map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group relative bg-white p-6 sm:p-8 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-100/10 transition-all duration-500 text-left"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className={`h-11 w-11 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center ${card.color} group-hover:scale-110 transition-transform duration-300`}>
                    {card.icon}
                  </div>
                  <Badge className={`${card.badge === 'Free' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'} border-none font-bold text-[9px] tracking-widest uppercase px-3 py-1 rounded-full`}>
                    {card.badge}
                  </Badge>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{card.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed font-medium">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12">
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20 space-y-4">
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">Three steps to success</h2>
            <p className="text-base sm:text-lg text-slate-500 font-medium italic">Faster than cooking Maggi.</p>
          </div>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8 sm:gap-12 relative">
             <div className="hidden md:block absolute top-1/2 left-0 w-full h-px bg-slate-100 -z-10" />
             
             {[
               { step: "01", title: "Upload", desc: "Drop your current PDF or Word resume. No formatting needed.", icon: <Upload className="h-8 w-8 text-indigo-600" /> },
               { step: "02", title: "AI Scan", desc: "Our models analyze your profile and identify 500+ job matches.", icon: <Sparkles className="h-8 w-8 text-indigo-600" /> },
               { step: "03", title: "Optimize", desc: "Rewrite weak bullets and apply to jobs where you're a Top 10% match.", icon: <ArrowRight className="h-8 w-8 text-indigo-600" /> }
             ].map((item, i) => (
               <div key={i} className="flex flex-col items-center text-center space-y-6">
                 <div className="h-20 w-20 rounded-[28px] bg-white border border-slate-100 shadow-xl flex items-center justify-center relative">
                    <div className="absolute -top-3 -left-3 h-8 w-8 rounded-full bg-slate-900 flex items-center justify-center text-[10px] font-black text-white">{item.step}</div>
                    {item.icon}
                 </div>
                 <div className="space-y-2 px-4">
                    <h4 className="text-xl font-bold text-slate-900">{item.title}</h4>
                    <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
                 </div>
               </div>
             ))}
          </div>
        </div>
      </section>

      {/* Pricing Section (Detailed) */}
      <section id="pricing" className="py-24 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-12 relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4">Invest in your career.</h2>
            <p className="text-base sm:text-lg text-indigo-200/60 font-medium">Choose a plan that fits your job search pace.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
             {/* Free Plan */}
             <div className="bg-slate-800/50 backdrop-blur-sm p-8 sm:p-10 rounded-[32px] sm:rounded-[40px] border border-white/5 space-y-8">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-2">Free</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl sm:text-5xl font-black">₹0</span>
                    <span className="text-slate-400 font-medium text-sm">/forever</span>
                  </div>
                </div>
                <ul className="space-y-4">
                   {["3 Resume Analysis / month", "Basic ATS Scoring", "Top 5 Job Matches", "Basic Profile Dashboard"].map((f, i) => (
                     <li key={i} className="flex items-center gap-3 text-slate-300 text-sm"><CheckCircle2 className="h-4 w-4 text-slate-500" /> {f}</li>
                   ))}
                </ul>
                <Button className="w-full h-14 rounded-2xl bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold" onClick={() => fileInputRef.current?.click()}>Get Started</Button>
             </div>

             {/* Pro Plan */}
             <div className="bg-white text-slate-900 p-8 sm:p-10 rounded-[32px] sm:rounded-[40px] shadow-2xl space-y-8 relative lg:scale-105">
                <div className="absolute top-6 right-8 bg-indigo-600 text-white text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Best Value</div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-2">Pro</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl sm:text-5xl font-black">₹299</span>
                    <span className="text-slate-500 font-medium text-sm">/month</span>
                  </div>
                </div>
                <ul className="space-y-4">
                   {["Unlimited Resume Analysis", "AI Bullet Point Rewriter", "Unlimited Job Matches", "Deep Skill Gap Detection", "Prioritized Real-time JDs"].map((f, i) => (
                     <li key={i} className="flex items-center gap-3 text-slate-600 text-sm font-medium"><CheckCircle2 className="h-4 w-4 text-indigo-600 text-bold" /> {f}</li>
                   ))}
                </ul>
                <Button className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg shadow-xl shadow-indigo-200">Start Pro Now</Button>
             </div>

             {/* Enterprise */}
             <div className="bg-slate-800/50 backdrop-blur-sm p-8 sm:p-10 rounded-[32px] sm:rounded-[40px] border border-white/5 space-y-8 md:col-span-2 lg:col-span-1">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-2">College</h3>
                  <p className="text-slate-400 text-sm font-medium">For campus placement cells.</p>
                </div>
                <div className="pt-4">
                  <p className="text-slate-200 font-medium text-sm sm:text-base">Custom bulk pricing for institutions and placement officers.</p>
                </div>
                <Button className="w-full h-14 rounded-2xl bg-white/5 text-white border border-white/10 font-bold">Contact Sales</Button>
             </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 sm:py-32 bg-white">
        <div className="container mx-auto px-4 sm:px-6 max-w-5xl">
          <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-[48px] sm:rounded-[64px] p-8 sm:p-16 text-center text-white space-y-8 relative overflow-hidden shadow-2xl">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }} className="absolute -top-32 -right-32 w-64 h-64 border-4 border-white/10 rounded-full" />
            
            <h2 className="text-3xl sm:text-5xl lg:text-7xl font-black tracking-tight leading-none italic uppercase">Don&apos;t wait for recruiters. <br className="hidden sm:block" />Make them wait for you.</h2>
            <p className="text-lg sm:text-xl text-indigo-100/80 font-medium max-w-2xl mx-auto">Join 10,000+ Indian engineers using ResumeAI to land top-tier tech roles.</p>
            
            <div className="flex items-center justify-center gap-6 pt-4">
              <Button 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full sm:w-auto h-16 px-12 rounded-3xl bg-white text-indigo-600 hover:bg-indigo-50 font-black text-xl shadow-2xl transition-all hover:scale-105 active:scale-95"
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

