"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
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
  Phone
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

interface ResumeData {
  fullName: string;
  email: string;
  phone: string;
  summary: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
}

export default function AIResumeBuilder() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [discovery, setDiscovery] = useState({ role: '', exp: '' });
  const previewRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<ResumeData>({
    fullName: '',
    email: '',
    phone: '',
    summary: '',
    skills: [],
    experience: [{ title: '', company: '', duration: '', description: [''] }],
    education: [{ degree: '', institution: '', year: '' }]
  });
  const [originalScore, setOriginalScore] = useState<number | null>(null);
  const [currentScore, setCurrentScore] = useState<number>(0);

  useEffect(() => {
    const saved = sessionStorage.getItem('builder_discovery');
    if (saved) setDiscovery(jsonParseSafe(saved));
    
    // If we have a resume ID in the URL, fetch its data including original_score
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id && user) {
       fetchResume(id);
    }
  }, [user]);

  const fetchResume = async (id: string) => {
    const { data: resume, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .single();
    
    if (resume) {
      setData(resume.parsed_data || data);
      setOriginalScore(resume.original_score);
      setCurrentScore(resume.resume_score || 0);
    }
  };

  const jsonParseSafe = (str: string) => {
    try { return JSON.parse(str); } catch (e) { return { role: '', exp: '' }; }
  };

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

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
        error: (err) => { setIsOptimizing(false); return str(err); }
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

  // --- Storage & Flow ---
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${backendUrl}/api/resumes/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${data.fullName}'s Resume - ${discovery.role}`,
          target_role: discovery.role,
          years_of_experience: parseInt(discovery.exp) || 0,
          summary: data.summary,
          skills: data.skills,
          experience: data.experience,
          education: data.education,
          user_id: user?.id || 'guest'
        })
      });
      if (response.ok) {
        toast.success('Resume saved to your dashboard');
      }
    } catch (e) {
      toast.error('Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!previewRef.current) return;
    const canvas = await html2canvas(previewRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, width, height);
    pdf.save(`${data.fullName.replace(/\s+/g, '_')}_Resume.pdf`);
  };

  // --- Render Helpers ---
  const steps = [
    { id: 1, name: 'Personal', icon: User },
    { id: 2, name: 'Skills', icon: List },
    { id: 3, name: 'Experience', icon: Briefcase },
    { id: 4, name: 'Education', icon: GraduationCap }
  ];

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-50 overflow-hidden">
      {/* --- Left Panel: Editor --- */}
      <div className="flex-1 flex flex-col h-full bg-white border-r border-slate-200">
        <header className="p-6 border-b border-slate-100 flex items-center justify-between bg-white/50 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 leading-none mb-1">AI Resume Builder</h1>
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-500 font-medium">Target: {discovery.role}</p>
                {originalScore !== null && (
                  <Badge className="bg-green-50 text-green-600 border-green-100 font-black text-[10px] uppercase">
                    +{currentScore - originalScore} Points Gain
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSave} disabled={isSaving} className="rounded-xl border-slate-200">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Progress
            </Button>
            <Button onClick={handleDownloadPDF} className="rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200">
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </header>

        <div className="px-12 py-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex-1 max-w-xl">
             <div className="flex items-center justify-between mb-2">
               {steps.map((s) => (
                 <div 
                   key={s.id}
                   className={`flex flex-col items-center gap-2 transition-all duration-300 ${step >= s.id ? 'text-indigo-600' : 'text-slate-400'}`}
                 >
                   <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${step >= s.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border border-slate-200'}`}>
                     <s.icon className="h-5 w-5" />
                   </div>
                   <span className="text-[10px] font-bold uppercase tracking-wider">{s.name}</span>
                 </div>
               ))}
             </div>
             <Progress value={(step / steps.length) * 100} className="h-1.5 bg-slate-200" />
          </div>

          {originalScore !== null && (
            <div className="ml-12 pl-12 border-l border-slate-200 flex items-center gap-6">
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

        <ScrollArea className="flex-1 p-8 lg:p-12">
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
                      <Input value={data.fullName} onChange={(e) => setData({...data, fullName: e.target.value})} placeholder="Jane Doe" className="h-12 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Email Address</label>
                      <Input value={data.email} onChange={(e) => setData({...data, email: e.target.value})} placeholder="jane@example.com" className="h-12 rounded-xl" />
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
                      onChange={(e) => setData({...data, summary: e.target.value})} 
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
                              setData({...data, skills: [...data.skills, val]});
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                      <Button onClick={() => {
                        const el = document.getElementById('skill-input') as HTMLInputElement;
                        if (el.value) {
                          setData({...data, skills: [...data.skills, el.value]});
                          el.value = '';
                        }
                      }} className="h-12 px-6 rounded-xl bg-slate-900">Add</Button>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {data.skills.map((s, i) => (
                        <div key={i} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-bold flex items-center gap-2 border border-indigo-100">
                          {s}
                          <button onClick={() => {
                            const newSkills = [...data.skills]; newSkills.splice(i, 1); setData({...data, skills: newSkills});
                          }}><Trash2 className="h-3 w-3" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" className="space-y-8">
                  {data.experience.map((exp, idx) => (
                    <Card key={idx} className="border-slate-100 shadow-sm relative group">
                      <CardContent className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <Input placeholder="Job Title" value={exp.title} onChange={(e) => {
                            const newExp = [...data.experience]; newExp[idx].title = e.target.value; setData({...data, experience: newExp});
                          }} className="h-10 border-none bg-slate-50 font-bold" />
                          <Input placeholder="Company" value={exp.company} onChange={(e) => {
                            const newExp = [...data.experience]; newExp[idx].company = e.target.value; setData({...data, experience: newExp});
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
                        {exp.description.map((bullet, bIdx) => (
                          <div key={bIdx} className="flex gap-2">
                            <Textarea 
                              value={bullet} 
                              onChange={(e) => {
                                const newExp = [...data.experience]; newExp[idx].description[bIdx] = e.target.value; setData({...data, experience: newExp});
                              }}
                              className="min-h-[60px] text-sm border-none focus-visible:ring-0 p-0 shadow-none"
                            />
                            <Button variant="ghost" size="icon" onClick={() => {
                              const newExp = [...data.experience]; newExp[idx].description.splice(bIdx, 1); setData({...data, experience: newExp});
                            }} className="h-8 w-8 text-slate-300 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => {
                          const newExp = [...data.experience]; newExp[idx].description.push(''); setData({...data, experience: newExp});
                        }} className="w-full border-dashed border-slate-200 hover:bg-slate-50 text-slate-400 h-8 rounded-lg">
                          <Plus className="h-3 w-3 mr-1" /> Add Bullet
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  <Button onClick={() => setData({...data, experience: [...data.experience, { title: '', company: '', duration: '', description: [''] }]})} className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">
                    <Plus className="h-5 w-5 mr-2" /> Add New Work Experience
                  </Button>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                  {data.education.map((edu, idx) => (
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
                          const newEdu = [...data.education]; newEdu[idx].degree = e.target.value; setData({...data, education: newEdu});
                        }} className="h-12 rounded-xl" />
                        <div className="grid grid-cols-2 gap-4">
                          <Input placeholder="Institution" value={edu.institution} onChange={(e) => {
                            const newEdu = [...data.education]; newEdu[idx].institution = e.target.value; setData({...data, education: newEdu});
                          }} className="h-10 border-none bg-slate-50" />
                          <Input placeholder="Year" value={edu.year} onChange={(e) => {
                            const newEdu = [...data.education]; newEdu[idx].year = e.target.value; setData({...data, education: newEdu});
                          }} className="h-10 border-none bg-slate-50" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <Button onClick={() => setData({...data, education: [...data.education, { degree: '', institution: '', year: '' }]})} className="w-full h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold">
                    <Plus className="h-5 w-5 mr-2" /> Add Education
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

      {/* --- Right Panel: Live Preview --- */}
      <div className="flex-1 bg-slate-200/50 p-8 lg:p-12 flex justify-center overflow-y-auto overflow-x-hidden relative">
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

        <div className="bg-white shadow-[0_40px_100px_rgba(0,0,0,0.1)] w-[210mm] min-h-[297mm] h-fit origin-top scale-[0.85] lg:scale-[0.8] xl:scale-[0.9] flex flex-col font-sans" ref={previewRef}>
          {/* Top Decorative Bar */}
          <div className="h-2 bg-indigo-600 w-full" />
          
          {/* Header */}
          <div className="p-16 pb-12 space-y-4">
            <h2 className="text-5xl font-black text-slate-900 tracking-tighter uppercase leading-none">{data.fullName || "Your Name"}</h2>
            <div className="flex items-center gap-4 text-slate-500 text-xs font-bold tracking-widest uppercase">
              {data.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-indigo-600" /> {data.email}</span>}
              {data.phone && <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-indigo-600" /> {data.phone}</span>}
            </div>
            <div className="h-px bg-slate-100 w-24 !mt-6" />
          </div>

          <div className="px-16 pb-16 space-y-10 flex-1">
            {/* Summary */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                 <h3 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Profile</h3>
                 <div className="h-px bg-indigo-50 flex-1" />
              </div>
              <p className="text-slate-600 leading-relaxed text-[13px] font-medium">{data.summary || "Add a summary to see the magic..."}</p>
            </section>

            {/* Skills */}
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                 <h3 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Expertise</h3>
                 <div className="h-px bg-indigo-50 flex-1" />
              </div>
              <div className="flex flex-wrap gap-2">
                {data.skills.map((s, i) => (
                  <span key={i} className="text-[11px] font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-100">{s}</span>
                ))}
              </div>
            </section>

            {/* Experience */}
            <section className="space-y-6">
              <div className="flex items-center gap-3">
                 <h3 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Experience</h3>
                 <div className="h-px bg-indigo-50 flex-1" />
              </div>
              <div className="space-y-8">
                {data.experience.map((exp, i) => exp.title && (
                  <div key={i} className="space-y-3 relative">
                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <h4 className="text-[15px] font-extrabold text-slate-900">{exp.title}</h4>
                        <div className="text-[12px] font-bold text-indigo-500 uppercase tracking-wider">{exp.company}</div>
                      </div>
                      {exp.duration && <span className="text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-2 py-1 rounded">{exp.duration}</span>}
                    </div>
                    <ul className="list-none space-y-2">
                      {exp.description.map((b, bi) => b.trim() && (
                        <li key={bi} className="text-[12px] text-slate-600 leading-normal flex gap-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-200 mt-1.5 flex-shrink-0" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            {/* Education */}
            <section className="space-y-4">
              <div className="flex items-center gap-3">
                 <h3 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Education</h3>
                 <div className="h-px bg-indigo-50 flex-1" />
              </div>
              <div className="grid grid-cols-1 gap-6">
                {data.education.map((edu, i) => (
                  <div key={i} className="flex justify-between items-start">
                    <div>
                      <h4 className="text-[14px] font-bold text-slate-800">{edu.degree || "Degree Name"}</h4>
                      <p className="text-[12px] text-slate-400 font-medium">{edu.institution || "University Name"}</p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">{edu.year || "2020"}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          
          {/* Footer Branding (Subtle) */}
          <div className="p-12 border-t border-slate-50 text-center">
             <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Powered by ResuMatch AI • Nemotron Intelligence</p>
          </div>
        </div>
      </div>
    </div>
  );
}
