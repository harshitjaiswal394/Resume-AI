import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImproveResumeSectionProps {
  steps: string[];
}

export function ImproveResumeSection({ steps }: ImproveResumeSectionProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <Card className="rounded-3xl border-none shadow-sm bg-indigo-50/50">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2 text-indigo-700">
          <Lightbulb className="h-6 w-6" /> How to improve your resume
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step, idx) => (
          <div key={idx} className="flex gap-3 items-start group">
            <div className="mt-1 flex-shrink-0">
              <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                {idx + 1}
              </div>
            </div>
            <p className="text-sm text-indigo-900 leading-relaxed font-medium">
              {step}
            </p>
          </div>
        ))}
        
        <div className="mt-6 pt-6 border-t border-indigo-100">
          <Button className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 font-bold h-12 shadow-lg shadow-indigo-500/20">
            <Zap className="mr-2 h-4 w-4 fill-white" /> Optimize with AI Rewriter
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
