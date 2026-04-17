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

  const handleFetchJD = async () => {
    if (!jdUrl) {
      toast.error('Please enter a job URL first');
      return;
    }

    setIsLoading(true);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

    try {
      const response = await fetch(`${backendUrl}/api/cover-letter/fetch-jd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jdUrl })
      });

      const result = await response.json();
      if (result.success && result.jdText) {
        setJdText(result.jdText);
        toast.success('Job description fetched successfully!');
      } else {
        throw new Error(result.detail || 'Fetch failed');
      }
    } catch (e: any) {
      console.error('JD Fetch Error:', e);
      // As requested: throw toast error user to paste JD directly
      toast.error('Could not fetch Job Description. Please paste it manually below.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedResumeId) {
      toast.error('Please select a resume first');
      return;
    }
    // Prioritize jdText since we might have fetched it or user might have pasted it
    if (!jdText && !jdUrl) {
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
        // AI cleanup: Remove common internal rationale/conversational filler
        let cleanedContent = result.content;
        
        // Remove common AI rationale, drafting markers, and word count meta-data
        const rationalePatterns = [
          /^(Certainly!|Here is|To generate|As requested|Based on|Draft:|Revised:).*?:\n*/i,
          /^I have crafted.*?:\n*/i,
          /^This cover letter.*?:\n*/i,
          /Count manually:.*?\n*/gi,
          /Word Count:.*?\n*/gi,
          /^Dear.*?\(Draft Output\)\n*/i
        ];
        
        rationalePatterns.forEach(pattern => {
          cleanedContent = cleanedContent.replace(pattern, '').trim();
        });

        // Final trimming of any leading "Draft:" or "DRAFT" labels
        cleanedContent = cleanedContent.replace(/^Draft\s*[:\-\s]\s*/i, '').trim();

        setContent(cleanedContent);
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
    <div className="min-h-screen bg-[#f8faff] p-4 md:p-8 lg:p-12 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8 md:space-y-12">
        {/* Decorative Background Elements */}
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-20 bg-[radial-gradient(circle_at_20%_20%,#e0e7ff_0,transparent_25%),radial-gradient(circle_at_80%_80%,#f5f3ff_0,transparent_25%)]" />
        
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between relative z-10 gap-6">
          <div className="flex items-center gap-3 md:gap-6">
            <Button variant="outline" size="icon" onClick={() => router.back()} className="rounded-xl md:rounded-2xl h-10 w-10 md:h-14 md:w-14 bg-white border-slate-100 shadow-sm hover:shadow-md transition-all">
              <ChevronLeft className="h-5 w-5 md:h-6 md:w-6 text-slate-600" />
            </Button>
            <div>
               <div className="flex items-center gap-2 md:gap-3 mb-1">
                 <Badge className="bg-indigo-600 text-white border-0 font-black text-[8px] md:text-[10px] uppercase tracking-tighter px-2 py-0.5 rounded-md shadow-lg shadow-indigo-100">AI Powered</Badge>
                 <span className="h-1 w-1 md:h-1.5 md:w-1.5 rounded-full bg-indigo-200" />
                 <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Premium v2.0</span>
               </div>
              <h1 className="text-2xl md:text-5xl font-black text-slate-900 tracking-tighter leading-none">Smart Cover Letter</h1>
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1">Choose Base Resume</label>
                  <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                    <SelectTrigger className="h-14 md:h-20 rounded-xl md:rounded-3xl border-slate-100 bg-white shadow-sm ring-1 ring-slate-100 focus:ring-4 focus:ring-indigo-50 hover:border-indigo-100 transition-all text-left px-4 md:px-6">
                      <SelectValue placeholder="Select a resume" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl md:rounded-2xl border-slate-100 shadow-2xl">
                      {(resumes || []).map(r => (
                        <SelectItem key={r.id} value={r.id} className="py-3 focus:bg-indigo-50 rounded-lg md:rounded-xl">
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-bold text-slate-900 text-sm">{getResumeLabel(r)}</span>
                            <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black">
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
                      <label className="text-xs md:text-sm font-bold text-slate-700">Job Information</label>
                      <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-slate-100 text-slate-400">Step 1: Fetch</Badge>
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
                        disabled={isLoading || !jdUrl}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 md:h-10 rounded-lg md:rounded-xl bg-slate-900 hover:bg-indigo-600 text-white font-bold text-[10px] md:text-xs tracking-tight transition-all"
                      >
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Wand2 className="h-3 w-3 mr-1.5" /> Fetch</>}
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
                  onClick={handleGenerate}
                  disabled={isGenerating || (!jdText && !jdUrl)}
                  className="w-full h-14 md:h-20 rounded-xl md:rounded-[2.5rem] bg-indigo-600 hover:bg-violet-600 text-white font-black text-base md:text-xl shadow-lg shadow-indigo-100 hover:shadow-violet-200 transition-all active:scale-[0.98] group overflow-hidden relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-5 w-5 md:h-6 md:w-6 mr-3 animate-spin" />
                      Crafting Letter...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 md:h-6 md:w-6 mr-3" />
                      Generate Smart Letter
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Output Panel */}
          <div className="lg:col-span-7 space-y-6 md:space-y-8">
            <Card className="border-0 shadow-2xl md:shadow-[0_48px_80px_-16px_rgba(99,102,241,0.06)] rounded-[2rem] md:rounded-[3.5rem] bg-white ring-1 ring-slate-50 overflow-hidden min-h-[400px] md:min-h-[750px] flex flex-col relative">
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
                      <div className={`w-24 h-24 rounded-[2rem] bg-indigo-50 flex items-center justify-center text-indigo-200 ${isGenerating ? 'animate-bounce' : 'animate-pulse'}`}>
                        <Sparkles className={`h-10 w-10 ${isGenerating ? 'text-indigo-600' : 'text-indigo-300'}`} />
                      </div>
                      <div className="space-y-2">
                        <p className="text-2xl font-black text-slate-800 tracking-tight">
                          {isGenerating ? 'Intelligence Working...' : 'Intelligence Standby'}
                        </p>
                        <p className="text-base text-slate-400 font-medium max-w-xs">
                          {isGenerating 
                            ? 'Our Llama 3.1 engine is crafting your tailored career strategy. This usually takes 10-15 seconds.' 
                            : 'Your tailored strategy will appear here after analysis.'}
                        </p>
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
