import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Copy, Check, Download, FileText, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { generateCoverLetter, ParsedResume } from '@/lib/ai';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/AuthProvider';

interface CoverLetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  resume: any;
  jobMatch: any;
}

export function CoverLetterModal({ isOpen, onClose, resume, jobMatch }: CoverLetterModalProps) {
  const { user } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [coverLetter, setCoverLetter] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  const handleGenerate = async () => {
    if (!resume || !jobMatch) return;
    
    setIsGenerating(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
      
      const response = await fetch(`${backendUrl}/api/cover-letter/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          resumeId: resume.id,
          resumeData: resume.parsed_data,
          jdText: `${jobMatch.job_title} at ${jobMatch.company}. ${jobMatch.job_description || ''}`,
        })
      });

      if (!response.ok) throw new Error('Generation failed');
      const data = await response.json();
      setCoverLetter(data.content);
      
    } catch (error) {
      console.error('Failed to generate cover letter', error);
      toast.error('Failed to generate cover letter. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(coverLetter);
    setIsCopied(true);
    toast.success('Cover letter copied to clipboard');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([coverLetter], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `Cover_Letter_${jobMatch.job_title.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-3xl">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-brand-600" /> AI Cover Letter
          </DialogTitle>
          <DialogDescription>
            Tailored for {jobMatch?.job_title} at {jobMatch?.company}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden p-6 pt-2">
          {!coverLetter && !isGenerating ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-brand-50 flex items-center justify-center">
                <FileText className="h-8 w-8 text-brand-600" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-lg">Ready to generate?</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Our AI will use your resume and the job details to write a compelling cover letter.
                </p>
              </div>
              <Button onClick={handleGenerate} className="rounded-xl px-8 font-bold shadow-lg shadow-brand-500/20">
                Generate with AI
              </Button>
            </div>
          ) : isGenerating ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <Loader2 className="h-10 w-10 animate-spin text-brand-600" />
              <p className="text-sm font-medium text-muted-foreground animate-pulse">
                Crafting your perfect cover letter...
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] w-full rounded-xl border bg-muted/30 p-4">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {coverLetter}
              </div>
            </ScrollArea>
          )}
        </div>

        {coverLetter && (
          <DialogFooter className="p-6 pt-2 flex flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={handleDownload} className="flex-1 sm:flex-none font-bold rounded-xl">
              <Download className="mr-2 h-4 w-4" /> Download
            </Button>
            <Button onClick={handleCopy} className="flex-1 sm:flex-none font-bold rounded-xl">
              {isCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {isCopied ? 'Copied' : 'Copy Text'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
