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
  Target
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { toast } from 'sonner';

export default function BuilderDiscovery() {
  const router = useRouter();
  const { user } = useAuth();
  const [targetRole, setTargetRole] = useState('');
  const [yearsOfExp, setYearsOfExp] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
    <div className="min-h-screen bg-slate-50/50 p-6 lg:p-12 flex items-center justify-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl w-full"
      >
        <Card className="border-none shadow-2xl shadow-indigo-100/50 bg-white/80 backdrop-blur-xl rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 pb-0 text-center">
            <div className="mx-auto w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-200">
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
              className="w-full h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-semibold shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Start Building
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

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
