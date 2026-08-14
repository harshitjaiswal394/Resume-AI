"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Sparkles, 
  Briefcase, 
  Clock, 
  ArrowRight, 
  Upload,
  FileText,
  ChevronRight,
  Target,
  Wand2
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { toast } from 'sonner';
import { secureGet } from '@/lib/secureStorage';

export default function BuilderDiscovery() {
  const router = useRouter();
  const { user } = useAuth();
  const [targetRole, setTargetRole] = useState('');
  const [yearsOfExp, setYearsOfExp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  React.useEffect(() => {
    (async () => {
      const localDraft = await secureGet(localStorage, 'resumatch_builder_data');
      if (localDraft) {
        try {
          const parsed = typeof localDraft === 'string' ? JSON.parse(localDraft) : localDraft;
          // Look for data in both new structure { data: {...} } and old flat structure
          const d = parsed.data || parsed;
          if (d.fullName || d.summary || d.experience?.length > 1) {
            setHasDraft(true);
          }
        } catch (e) {}
      }
    })();
  }, []);

  const handleStart = () => {
    if (!targetRole || !yearsOfExp) {
      toast.error('Please fill in both fields to proceed');
      return;
    }
    
    // Store Discovery data in session storage for the builder to pick up
    sessionStorage.setItem('builder_discovery', JSON.stringify({ 
      role: targetRole, 
      exp: yearsOfExp 
    }));
    
    // Redirect to the actual builder interface
    router.push('/dashboard/builder/new');
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#eef4fb] via-[var(--bg-base)] to-[var(--bg-base)] p-6 lg:p-12 flex items-center justify-center">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-indigo-100/50 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-accent-50/70 blur-3xl" />
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, var(--border-soft) 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-xl"
      >
        <Card className="border-none shadow-2xl shadow-indigo-900/10 bg-white/85 backdrop-blur-xl rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 pb-0 text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-indigo-500 to-indigo-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-600/25">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-3xl font-bold text-slate-900 mb-2">
              Let's Build Your Elite Resume
            </CardTitle>
            <CardDescription className="text-slate-500 text-lg">
              To make your resume highly ATS-friendly, we need to know what you're targeting.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-8 space-y-6">
            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                  <Target className="h-5 w-5" />
                </div>
                <Input 
                  placeholder="Target Job Role (e.g. Senior Frontend Engineer)"
                  className="pl-12 h-14 rounded-2xl border-slate-200 focus:border-indigo-600 focus:ring-indigo-600/10 transition-all text-lg"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                />
              </div>

              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors">
                  <Clock className="h-5 w-5" />
                </div>
                <Input 
                  type="number"
                  placeholder="Years of Experience"
                  className="pl-12 h-14 rounded-2xl border-slate-200 focus:border-indigo-600 focus:ring-indigo-600/10 transition-all text-lg"
                  value={yearsOfExp}
                  onChange={(e) => setYearsOfExp(e.target.value)}
                />
              </div>
            </div>

            <Button 
              onClick={handleStart}
              className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-800 text-white text-lg font-semibold shadow-lg shadow-indigo-600/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Wand2 className="mr-2 h-5 w-5" />
              Build New Resume
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <AnimatePresence>
              {hasDraft && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Button 
                    variant="outline"
                    onClick={() => router.push('/dashboard/builder/new')}
                    className="w-full h-14 rounded-2xl border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold transition-all mt-2"
                  >
                    <Clock className="mr-2 h-5 w-5" />
                    Resume Previous Draft
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-indigo-600">
                  <Upload className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-slate-600">Import Existing</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-indigo-600">
                  <Sparkles className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-slate-600">ATS Optimized</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
