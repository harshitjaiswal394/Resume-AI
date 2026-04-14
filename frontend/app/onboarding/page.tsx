"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload,
  FileText,
  Shield,
  CheckCircle2,
  Loader2,
  Sparkles,
  Briefcase,
  User,
  Zap,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { AuthModal } from '@/components/common/AuthModal';
import { extractTextFromFile } from '@/lib/pdf';
import { startResumeAnalysis, completeResumeAnalysis, tailorResume } from '@/app/actions/resume';
import { generateJobLinks } from '@/lib/job-portals';

type Step = 'upload' | 'analyzing' | 'personalize';

export default function OnboardingFlow() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState<Step>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [analysisSteps, setAnalysisSteps] = useState([
    { id: 'parsing', label: 'Parsing resume structure', status: 'pending' },
    { id: 'ats', label: 'Checking ATS compatibility', status: 'pending' },
    { id: 'skills', label: 'Extracting skills & keywords', status: 'pending' },
    { id: 'suggestions', label: 'Generating improvement suggestions', status: 'pending' },
    { id: 'matching', label: 'Matching with 500+ job roles', status: 'pending' },
  ]);

  const [personalizeData, setPersonalizeData] = useState({
    targetRole: '',
    experienceLevel: '',
    location: '',
  });

  const [fullAnalysisData, setFullAnalysisData] = useState<any>(null);
  const [activeResumeId, setActiveResumeId] = useState('guest');
  const [isTailoring, setIsTailoring] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const updateStepStatus = (id: string, status: 'pending' | 'loading' | 'done') => {
    setAnalysisSteps(prev => prev.map(step => step.id === id ? { ...step, status } : step));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const processFile = async (file: File) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    const isAllowedType = allowedTypes.includes(file.type) ||
      file.name.endsWith('.pdf') ||
      file.name.endsWith('.docx') ||
      file.name.endsWith('.doc');

    if (!isAllowedType) {
      toast.error('Please upload a PDF or DOCX file');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error('File size exceeds 5MB limit');
      return;
    }

    fileRef.current = file;
    setFileName(file.name);
    setCurrentStep('analyzing');
    setUploadProgress(10);

    // Reset steps
    setAnalysisSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));

    try {
      // 1. Create initial record if user is logged in
      let resumeId = 'guest';
      if (user) {
        console.log('User is logged in, starting authenticated upload flow...');

        // Ensure profile exists (retry once if just created)
        let userProfile = profile;
        if (!userProfile) {
          console.log('Profile not found in state, attempting manual fetch...');
          const { data: pData } = await supabase.from('users').select('*').eq('id', user.id).single();
          userProfile = pData as any;
        }

        if (!userProfile) {
          throw new Error('User profile not found. Please try refreshing the page.');
        }

        const filePath = `resumes/${user.id}/${Date.now()}_${file.name}`;

        // Storage Upload
        const { error: uploadError } = await supabase.storage.from('resumes').upload(filePath, file);
        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          throw new Error(`Cloud storage upload failed: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(filePath);

        // Database Insert
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

        if (resumeError) {
          console.error('Database insert error:', resumeError);
          throw new Error(`Failed to save resume record: ${resumeError.message}`);
        }

        resumeId = resumeData.id;
        console.log('Authenticated upload successful, Resume ID:', resumeId);
      }

      // 2. Start Streaming Server Pipeline
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
      const formData = new FormData();
      formData.append('file', file);

      // Pass user_id and resume_id to backend for server-side persistence (same as dashboard)
      const streamUrl = (user && resumeId !== 'guest')
        ? `${backendUrl}/api/resume/process-stream?user_id=${user.id}&resume_id=${resumeId}`
        : `${backendUrl}/api/resume/process-stream`;

      const response = await fetch(streamUrl, {
        method: 'POST',
        body: formData,
      });

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

                if (event.step === 'final') {
                  setFullAnalysisData(event.data);
                  setActiveResumeId(resumeId);
                  const persistenceResult = await completeResumeAnalysis(user?.id || 'guest', resumeId, event.data);
                  if (!persistenceResult.success) throw new Error((persistenceResult as any).error || 'Failed to save analysis');

                  setUploadProgress(100);
                  toast.success('Analysis complete!');
                  setTimeout(() => setCurrentStep('personalize'), 800);
                } else if (event.step) {
                  updateStepStatus(event.step, event.status);
                  // Update progress bar based on step - Final ordering sync
                  const stepMap: Record<string, number> = {
                    'parsing': 20,
                    'ats': 40,
                    'skills': 60,
                    'suggestions': 80,
                    'matching': 95
                  };
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
      setCurrentStep('upload');
    }
  };

  // Handle post-login migration for guests
  useEffect(() => {
    if (user && fullAnalysisData && activeResumeId === 'guest' && !isTailoring) {
      console.log('User authenticated during onboarding, migrating guest data...');
      handlePersonalizeComplete();
    }
  }, [user, fullAnalysisData]);

  const handlePersonalizeComplete = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setIsTailoring(true);
    try {
      let resumeId = activeResumeId;

      // If this was a guest analysis, we need to save it to the DB now for the new user
      if (resumeId === 'guest' && fileRef.current) {
        console.log('Saving guest analysis to new user record...');
        const file = fileRef.current;
        const filePath = `resumes/${user.id}/${Date.now()}_${file.name}`;

        // 1. Upload to storage
        const { error: uploadError } = await supabase.storage.from('resumes').upload(filePath, file);
        if (uploadError) throw new Error(`Migrate upload failed: ${uploadError.message}`);

        const { data: { publicUrl } } = supabase.storage.from('resumes').getPublicUrl(filePath);

        // 2. Insert resume record
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

        // 3. Persist the analysis data received earlier as a guest
        await completeResumeAnalysis(user.id, resumeId, fullAnalysisData);
      }

      if (resumeId !== 'guest') {
        const result = await tailorResume(user.id, resumeId, personalizeData, fullAnalysisData.parsed_data);
        if (!result.success) throw new Error(result.error || 'Failed to tailor results');
      }

      toast.success('Strategy optimized!');
      router.push('/dashboard');
    } catch (error: any) {
      console.error('Migration/Tailor Error:', error);
      toast.error(error.message || 'Failed to sync results to your account');
      setIsTailoring(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans">
      {/* Header */}
      <header className="h-16 border-b bg-white px-8 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900">ResumeAI</span>
        </div>

        {/* Stepper */}
        <div className="hidden md:flex items-center gap-8">
          <StepItem number={1} label="Upload" active={currentStep === 'upload'} completed={currentStep !== 'upload'} />
          <div className="h-px w-8 bg-slate-200" />
          <StepItem number={2} label="Analyzing" active={currentStep === 'analyzing'} completed={currentStep === 'personalize'} />
          <div className="h-px w-8 bg-slate-200" />
          <StepItem number={3} label="Personalize" active={currentStep === 'personalize'} completed={false} />
        </div>

        <div className="text-sm font-medium text-slate-400">
          No sign-up required
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {currentStep === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-3xl w-full space-y-10 text-center"
            >
              <div className="space-y-3">
                <h1 className="text-[40px] font-extrabold tracking-tight text-[#0f172a] leading-tight">Upload your resume</h1>
                <p className="text-lg text-slate-500">
                  We&apos;ll analyze it in under 30 seconds — no account needed.
                </p>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative group cursor-pointer
                  bg-white rounded-[32px] border-2 border-dashed p-16
                  transition-all duration-300 ease-in-out shadow-sm
                  ${isDragging ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50'}
                `}
              >
                <div className="flex flex-col items-center gap-6">
                  <div className={`
                    h-20 w-20 rounded-2xl flex items-center justify-center
                    transition-all duration-300
                    ${isDragging ? 'bg-indigo-100' : 'bg-indigo-50 group-hover:bg-indigo-100'}
                  `}>
                    <Upload className={`h-10 w-10 ${isDragging ? 'text-indigo-600' : 'text-indigo-500 group-hover:text-indigo-600'}`} />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-[#1e293b]">Drag & drop your resume here</h3>
                    <p className="text-slate-400 font-medium">or click to browse from your device</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500 hover:bg-slate-100 px-4 py-1.5 rounded-xl font-bold text-xs border-none">PDF</Badge>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-500 hover:bg-slate-100 px-4 py-1.5 rounded-xl font-bold text-xs border-none">DOCX</Badge>
                    <span className="text-sm text-slate-400 ml-2 font-medium">Max file size: 5 MB</span>
                  </div>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".pdf,.docx,.doc"
                  onChange={handleFileSelect}
                />
              </div>

              <div className="flex items-center justify-center gap-2 text-slate-400 text-sm font-medium">
                <Shield className="h-4 w-4 text-emerald-500" />
                <span>256-bit encrypted · Your data is never shared · आपका डेटा सुरक्षित है</span>
              </div>

              {/* Don't have resume section */}
              <div className="pt-12 space-y-6">
                <h4 className="text-[11px] font-bold tracking-[0.15em] text-slate-400 uppercase">Don&apos;t have your resume handy?</h4>
                <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  <SampleCard title="Software Engineer (3 YOE)" size="128 KB" />
                  <SampleCard title="Fresher — B.Tech CSE" size="96 KB" />
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-5xl w-full bg-white rounded-[40px] shadow-2xl shadow-indigo-200/50 overflow-hidden"
            >
              <div className="flex flex-col lg:flex-row">
                {/* Left: Illustration */}
                <div className="lg:w-1/2 bg-indigo-50/30 p-12 flex flex-col items-center justify-center border-r border-slate-50">
                  <motion.div
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="relative"
                  >
                    <img
                      src="/assets/scanning.png"
                      alt="Analyzing Resume"
                      className="w-full max-w-sm drop-shadow-2xl"
                    />
                    {/* Floating accent elements */}
                    <motion.div
                      animate={{ y: [0, -10, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute -top-4 -right-4 h-12 w-12 rounded-2xl bg-white shadow-xl flex items-center justify-center"
                    >
                      <FileText className="h-6 w-6 text-indigo-600" />
                    </motion.div>
                  </motion.div>
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
                      <span className="text-sm font-bold text-indigo-600 uppercase tracking-widest">{uploadProgress}% Complete</span>
                    </div>
                    <Progress value={uploadProgress} className="h-3 bg-slate-100" />
                  </div>

                  <div className="space-y-6">
                    {analysisSteps.map((step) => (
                      <div key={step.id} className="flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                          <div className={`
                            h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-300 shadow-sm
                            ${step.status === 'done' ? 'bg-emerald-50 text-emerald-500' :
                              step.status === 'loading' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-slate-50 text-slate-300'}
                          `}>
                            {step.status === 'done' ? <CheckCircle2 className="h-6 w-6" /> :
                              step.status === 'loading' ? <Loader2 className="h-5 w-5 animate-spin" /> :
                                <div className="h-2.5 w-2.5 rounded-full bg-current opacity-30" />}
                          </div>
                          <span className={`
                            text-[18px] font-bold transition-colors duration-300
                            ${step.status === 'done' ? 'text-slate-900' :
                              step.status === 'loading' ? 'text-indigo-600' : 'text-slate-300'}
                          `}>
                            {step.label}
                          </span>
                        </div>
                        {step.status === 'done' && (
                          <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[10px] tracking-widest uppercase px-3 py-1">Ready</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 'personalize' && (
            <motion.div
              key="personalize"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl w-full"
            >
              <div className="bg-white rounded-[40px] shadow-2xl shadow-indigo-200/40 border border-indigo-50/50 overflow-hidden">
                <div className="p-12 lg:p-16 space-y-12">
                  <div className="text-center space-y-4 max-w-2xl mx-auto">
                    <h1 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-tight">One last thing</h1>
                    <p className="text-lg text-slate-500 font-medium">Help our AI precisely match your Profile to the Indian tech market.</p>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-12">
                    <div className="space-y-10">
                      {/* 1. Experience Level */}
                      <div className="space-y-5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                            <Zap className="h-5 w-5" />
                          </div>
                          <h3 className="text-xl font-bold text-slate-900">Your experience level</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { id: '0-1', label: 'Fresher (0–1 yr)' },
                            { id: '1-3', label: '1–3 years' },
                            { id: '3-6', label: '3–6 years' },
                            { id: '6-10', label: '6–10 years' },
                            { id: '10+', label: '10+ years' }
                          ].map((level) => (
                            <button
                              key={level.id}
                              onClick={() => setPersonalizeData({ ...personalizeData, experienceLevel: level.id })}
                              className={`
                                px-4 py-4 rounded-2xl border-2 font-bold text-sm transition-all duration-300
                                ${personalizeData.experienceLevel === level.id
                                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                  : 'border-slate-100 text-slate-500 hover:border-indigo-200 hover:bg-slate-50/50'}
                              `}
                            >
                              {level.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 2. Location */}
                      <div className="space-y-5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                            <User className="h-5 w-5" />
                          </div>
                          <h3 className="text-xl font-bold text-slate-900">Preferred Location</h3>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                          {[
                            'Bengaluru', 'Mumbai', 'Hyderabad', 'Pune', 'Delhi NCR',
                            'Chennai', 'Gurugram', 'Noida', 'Remote'
                          ].map((loc) => (
                            <button
                              key={loc}
                              onClick={() => setPersonalizeData({ ...personalizeData, location: loc })}
                              className={`
                                px-6 py-3 rounded-full border-2 font-bold text-sm transition-all duration-300
                                ${personalizeData.location === loc
                                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                  : 'border-slate-100 text-slate-500 hover:border-indigo-200 hover:bg-slate-50/50'}
                              `}
                            >
                              {loc}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-10">
                      {/* 3. Target Role */}
                      <div className="space-y-5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                            <Briefcase className="h-5 w-5" />
                          </div>
                          <h3 className="text-xl font-bold text-slate-900">Target Role</h3>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                          {[
                            'Software Engineer', 'Product Manager', 'Data Analyst',
                            'DevOps Engineer', 'UI/UX Designer', 'Full Stack Developer'
                          ].map((role) => (
                            <button
                              key={role}
                              onClick={() => setPersonalizeData({ ...personalizeData, targetRole: role })}
                              className={`
                                px-6 py-3 rounded-full border-2 font-bold text-sm transition-all duration-300
                                ${personalizeData.targetRole === role
                                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                                  : 'border-slate-100 text-slate-500 hover:border-indigo-200 hover:bg-slate-50/50'}
                              `}
                            >
                              {role}
                            </button>
                          ))}
                        </div>
                        <div className="relative group pt-4">
                          <input
                            type="text"
                            placeholder="Or type a custom role..."
                            className="w-full h-16 px-6 rounded-2xl border-2 border-slate-100 group-hover:border-slate-200 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-50 outline-none transition-all text-slate-700 font-bold bg-slate-50/30"
                            value={personalizeData.targetRole}
                            onChange={(e) => setPersonalizeData({ ...personalizeData, targetRole: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="pt-4 flex flex-col gap-4">
                        <button
                          disabled={!personalizeData.targetRole || !personalizeData.experienceLevel || !personalizeData.location || isTailoring}
                          className={`
                            relative w-full h-20 rounded-2xl text-xl font-black flex items-center justify-center gap-3 transition-all duration-500 overflow-hidden group
                            ${(personalizeData.targetRole && personalizeData.experienceLevel && personalizeData.location && !isTailoring)
                              ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-1 active:scale-95'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'}
                          `}
                          onClick={handlePersonalizeComplete}
                        >
                          {isTailoring ? (
                            <>
                              <Loader2 className="h-7 w-7 animate-spin" />
                              Optimizing Profile...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-6 w-6 text-indigo-300 group-hover:rotate-12 transition-transform" />
                              View My Analysis <ArrowRight className="h-6 w-6" />
                            </>
                          )}
                          <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white/10 opacity-40 group-hover:animate-shine" />
                        </button>
                        <p className="text-[10px] text-center font-bold text-slate-400 uppercase tracking-widest px-8">No login required to view initial match results</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tailoring Overlay */}
        <AnimatePresence>
          {isTailoring && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
            >
              <div className="max-w-md space-y-8">
                <div className="relative">
                  <div className="h-24 w-24 rounded-3xl bg-indigo-50 flex items-center justify-center mx-auto animate-pulse">
                    <Sparkles className="h-12 w-12 text-indigo-600" />
                  </div>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-2 border-2 border-dashed border-indigo-200 rounded-[32px]"
                  />
                </div>
                <div className="space-y-3">
                  <h2 className="text-2xl font-bold text-slate-900">Fine-tuning your strategy</h2>
                  <p className="text-slate-500 font-medium">We&apos;re matching your specific goals with current market demands in <span className="text-indigo-600">{personalizeData.location}</span>.</p>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 text-indigo-600 animate-spin" />
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Finalizing results...</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => setShowAuthModal(false)}
      />

      {/* Floating help button */}
      <div className="fixed bottom-8 left-8">
        <button className="h-14 w-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
          <Zap className="h-6 w-6 fill-white" />
        </button>
      </div>
    </div>
  );
}

function StepItem({ number, label, active, completed }: { number: number, label: string, active: boolean, completed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`
        h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
        ${active ? 'bg-primary text-white' : completed ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}
      `}>
        {completed ? <CheckCircle2 className="h-4 w-4" /> : number}
      </div>
      <span className={`text-sm font-bold ${active ? 'text-slate-900' : 'text-slate-400'}`}>{label}</span>
    </div>
  );
}

function SampleCard({ title, size }: { title: string, size: string }) {
  return (
    <Card className="border-slate-200 hover:border-primary hover:shadow-md transition-all cursor-pointer group">
      <CardContent className="p-4 flex items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-slate-50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
          <FileText className="h-5 w-5 text-slate-400 group-hover:text-primary" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-slate-700 group-hover:text-slate-900">{title}</p>
          <p className="text-xs text-slate-400">{size}</p>
        </div>
      </CardContent>
    </Card>
  );
}
