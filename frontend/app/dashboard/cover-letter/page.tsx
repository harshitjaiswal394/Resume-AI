"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  FileText, 
  Link as LinkIcon, 
  Copy, 
  Download, 
  ChevronLeft,
  Loader2,
  Wand2,
  CheckCircle2,
  Type
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';

export default function SmartCoverLetter() {
  const router = useRouter();
  const { user } = useAuth();
  const [resumes, setResumes] = useState<any[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [jdUrl, setJdUrl] = useState('');
  const [jdText, setJdText] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchResumes();
    }
  }, [user]);

  const fetchResumes = async () => {
    const { data, error } = await supabase
      .from('resumes')
      .select('id, title, updated_at, parsed_data')
      .order('updated_at', { ascending: false });
    
    if (data) {
      setResumes(data);
      if (data.length > 0) setSelectedResumeId(data[0].id);
    }
  };

  const getResumeLabel = (resume: any) => {
    if (resume.title && resume.title !== 'Untitled Resume') return resume.title;
    const role = resume.parsed_data?.targetRole || 'Professional Resume';
    const date = new Date(resume.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${role} (${date})`;
  };

  const handleGenerate = async () => {
    if (!selectedResumeId) {
      toast.error('Please select a resume first');
      return;
    }
    if (!jdUrl && !jdText) {
      toast.error('Please provide either a Job URL or Job Description text');
      return;
    }

    setIsGenerating(true);
    const selectedResume = resumes.find(r => r.id === selectedResumeId);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

    try {
      const response = await fetch(`${backendUrl}/api/cover-letter/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          resumeId: selectedResumeId,
          resumeData: selectedResume.parsed_data,
          jdUrl: jdUrl,
          jdText: jdText
        })
      });

      const result = await response.json();
      if (result.success) {
        setContent(result.content);
        toast.success('Smart Cover Letter generated!');
      } else {
        throw new Error(result.detail || 'Generation failed');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!content) return;
    const pdf = new jsPDF();
    const margin = 20;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const cursor = { x: margin, y: 30 };
    
    // Header
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text("COVER LETTER", cursor.x, cursor.y);
    cursor.y += 20;
    
    // Body
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    const splitText = pdf.splitTextToSize(content, pageWidth - (margin * 2));
    pdf.text(splitText, cursor.x, cursor.y);
    
    pdf.save(`Cover_Letter_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`);
    toast.success('Cover Letter downloaded as PDF');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="min-h-screen bg-[#f8faff] p-6 lg:p-12 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Decorative Background Elements */}
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-40 bg-[radial-gradient(circle_at_20%_20%,#e0e7ff_0,transparent_25%),radial-gradient(circle_at_80%_80%,#f5f3ff_0,transparent_25%)]" />
        
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between relative z-10 gap-6">
          <div className="flex items-center gap-4 md:gap-6">
            <Button variant="outline" size="icon" onClick={() => router.back()} className="rounded-2xl h-12 w-12 md:h-14 md:w-14 bg-white border-slate-100 shadow-sm hover:shadow-md transition-all">
              <ChevronLeft className="h-5 w-5 md:h-6 md:w-6 text-slate-600" />
            </Button>
            <div>
               <div className="flex items-center gap-3 mb-1">
                 <Badge className="bg-indigo-600 text-white border-0 font-black text-[9px] md:text-[10px] uppercase tracking-tighter px-2 py-0.5 rounded-md shadow-lg shadow-indigo-100">AI Powered</Badge>
                 <span className="h-1 w-1 md:h-1.5 md:w-1.5 rounded-full bg-indigo-200" />
                 <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">v2.0 Beta</span>
               </div>
              <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tighter leading-none">Smart Cover Letter</h1>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 relative z-10">
          {/* Left: Input Panel */}
          <div className="lg:col-span-5 space-y-6 md:space-y-8">
            <Card className="border-0 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] rounded-[2rem] md:rounded-[3rem] bg-white/70 backdrop-blur-3xl overflow-hidden ring-1 ring-white/20">
              <CardHeader className="p-6 md:p-10 pb-4">
                <CardTitle className="text-lg md:text-xl font-black flex items-center gap-3 text-slate-900">
                  <div className="h-10 w-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  Target Analysis
                </CardTitle>
                <CardDescription className="text-slate-500 font-medium text-sm md:text-base ml-1 md:ml-14">Configure your generation source</CardDescription>
              </CardHeader>
              <CardContent className="p-6 md:p-10 pt-4 md:pt-6 space-y-6 md:space-y-8">
                <div className="space-y-3">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Choose Base Resume</label>
                  <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                    <SelectTrigger className="h-16 md:h-20 rounded-2xl md:rounded-3xl border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 focus:ring-4 focus:ring-indigo-50 hover:border-indigo-100 transition-all text-left px-5 md:px-6">
                      <SelectValue placeholder="Select a resume" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-slate-100 shadow-2xl">
                      {resumes.map(r => (
                        <SelectItem key={r.id} value={r.id} className="py-3 focus:bg-indigo-50 rounded-xl">
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-bold text-slate-900">{getResumeLabel(r)}</span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
                              ID: {r.id.split('-')[0]}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-slate-700">Job Details</label>
                      <div className="flex bg-slate-100 p-1 rounded-lg">
                        <Button size="sm" variant="ghost" className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider">URL</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Text</Button>
                      </div>
                   </div>
                   
                   <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                        <LinkIcon className="h-4 w-4" />
                      </div>
                      <Input 
                        placeholder="Paste Job URL (LinkedIn, Indeed, etc.)"
                        className="pl-12 h-12 rounded-xl border-slate-200 focus:ring-indigo-600/10"
                        value={jdUrl}
                        onChange={(e) => setJdUrl(e.target.value)}
                      />
                   </div>

                   <div className="relative group">
                      <div className="absolute left-4 top-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                        <Type className="h-4 w-4" />
                      </div>
                      <Textarea 
                        placeholder="...or paste the full Job Description text here"
                        className="pl-12 min-h-[200px] rounded-xl border-slate-200 focus:ring-indigo-600/10 resize-none"
                        value={jdText}
                        onChange={(e) => setJdText(e.target.value)}
                      />
                   </div>
                </div>

                <Button 
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full h-16 md:h-20 rounded-2xl md:rounded-[2rem] bg-indigo-600 hover:bg-violet-600 text-white font-black text-lg md:text-xl shadow-2xl shadow-indigo-100 hover:shadow-violet-200 transition-all active:scale-[0.98] group overflow-hidden relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-5 w-5 md:h-6 md:w-6 mr-3 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-5 w-5 md:h-6 md:w-6 mr-3" />
                      Generate
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Output Panel */}
          <div className="lg:col-span-7 space-y-6 md:space-y-8">
            <Card className="border-0 shadow-[0_48px_80px_-16px_rgba(99,102,241,0.06)] rounded-[2.5rem] md:rounded-[3.5rem] bg-white ring-1 ring-slate-50 overflow-hidden min-h-[500px] md:min-h-[700px] flex flex-col">
              <CardHeader className="p-8 md:p-12 pb-4 md:pb-6 flex flex-row items-center justify-between border-b border-indigo-50/50 bg-indigo-50/10">
                <div>
                  <CardTitle className="text-xl md:text-2xl font-black flex items-center gap-3 text-slate-900">
                    <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-indigo-600" />
                    Smart Alignment
                  </CardTitle>
                </div>
                {content && (
                  <div className="flex gap-2 md:gap-3">
                    <Button variant="outline" size="icon" onClick={copyToClipboard} className="h-10 w-10 md:h-12 md:w-12 rounded-xl md:rounded-2xl border-indigo-100 hover:bg-indigo-50 transition-all">
                      <Copy className="h-4 w-4 md:h-5 md:w-5" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleDownloadPDF} className="h-10 w-10 md:h-12 md:w-12 rounded-xl md:rounded-2xl border-indigo-100 hover:bg-indigo-50 transition-all">
                      <Download className="h-4 w-4 md:h-5 md:w-5" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-8 md:p-12 flex-1 relative">
                <AnimatePresence mode="wait">
                  {content ? (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="h-full"
                    >
                      <Textarea 
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="h-full min-h-[400px] md:min-h-[550px] border-none focus-visible:ring-0 p-0 text-slate-700 leading-relaxed text-base md:text-lg font-medium resize-none selection:bg-indigo-50"
                      />
                    </motion.div>
                  ) : (
                    <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-center space-y-6 py-20">
                      <div className="w-24 h-24 rounded-[2rem] bg-indigo-50 flex items-center justify-center text-indigo-200 animate-pulse">
                        <Sparkles className="h-10 w-10 text-indigo-300" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-2xl font-black text-slate-800 tracking-tight">Intelligence Standby</p>
                        <p className="text-base text-slate-400 font-medium max-w-xs">Your tailored strategy will appear here after analysis.</p>
                      </div>
                    </div>
                  )}
                </AnimatePresence>
                
                {/* Floating Feedback Badge */}
                {content && (
                   <div className="absolute bottom-8 right-8">
                      <Badge className="bg-slate-900 text-white font-bold text-[10px] uppercase px-3 py-1.5 rounded-full flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-400" />
                        Target Score: 98% Optimized
                      </Badge>
                   </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
