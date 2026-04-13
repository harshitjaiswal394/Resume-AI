"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowLeft, 
  Download, 
  ExternalLink, 
  Briefcase, 
  CheckCircle2, 
  AlertTriangle, 
  Lightbulb,
  Linkedin,
  IndianRupee,
  User,
  Bookmark,
  BookmarkCheck,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { ScoreGauge } from '@/components/resume/ScoreGauge';
import { SkillPill } from '@/components/resume/SkillPill';
import { CoverLetterModal } from '@/components/resume/CoverLetterModal';
import { Skeleton, SkeletonCard, SkeletonGauge, SkeletonText } from '@/components/ui/skeleton';
import { motion } from 'motion/react';

export default function ResumeView() {
  const params = useParams();
  const id = params.id as string;
  const [resume, setResume] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCoverLetterOpen, setIsCoverLetterOpen] = useState(false);
  const [activeJobMatch, setActiveJobMatch] = useState<any>(null);

  const handleSaveJob = async (matchId: string, isSaved: boolean) => {
    try {
      const { error } = await supabase
        .from('job_matches')
        .update({ is_saved: isSaved })
        .eq('id', matchId);

      if (error) throw error;
      toast.success(isSaved ? 'Job saved!' : 'Job removed from saved');
    } catch (error) {
      console.error('Error saving job:', error);
      toast.error('Failed to update job');
    }
  };

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setLoading(true);
      
      // Fetch resume
      const { data: resumeData, error: resumeError } = await supabase
        .from('resumes')
        .select('*')
        .eq('id', id)
        .single();

      if (resumeError) {
        console.error('Error fetching resume:', resumeError);
      } else {
        setResume(resumeData);
      }

      // Fetch matches
      const { data: matchesData, error: matchesError } = await supabase
        .from('job_matches')
        .select('*')
        .eq('resume_id', id);

      if (matchesError) {
        console.error('Error fetching matches:', matchesError);
      } else {
        setMatches(matchesData || []);
      }

      setLoading(false);
    };

    fetchData();

    // Realtime subscription for matches
    const subscription = supabase
      .channel(`matches_${id}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'job_matches',
        filter: `resume_id=eq.${id}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMatches(prev => [...prev, payload.new]);
        } else if (payload.eventType === 'DELETE') {
          setMatches(prev => prev.filter(m => m.id !== payload.old.id));
        } else if (payload.eventType === 'UPDATE') {
          setMatches(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [id]);

  if (loading) return (
    <div className="container mx-auto py-10 px-4 space-y-8">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6">
          <SkeletonGauge />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );

  if (!resume) return (
    <div className="container mx-auto py-20 text-center">
      <h2 className="text-2xl font-bold">Resume not found</h2>
      <Link href="/dashboard" className="text-primary hover:underline mt-4 inline-block">Back to Dashboard</Link>
    </div>
  );

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{resume.file_name}</h1>
              <p className="text-muted-foreground">Analysis Report</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => window.open(resume.file_url, '_blank')}>
              <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column: Score & Insights */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="rounded-3xl border-none shadow-sm">
              <CardHeader className="text-center pb-2">
                <p className="text-label text-muted-foreground">Resume Score</p>
              </CardHeader>
              <CardContent className="flex flex-col items-center pb-8">
                <ScoreGauge score={resume.resume_score} />
                <Badge variant={resume.resume_score > 70 ? "success" : "warn"} className="mt-6 py-1 px-4">
                  {resume.resume_score > 70 ? (
                    <CheckCircle2 className="mr-2 h-3 w-3" />
                  ) : (
                    <AlertTriangle className="mr-2 h-3 w-3" />
                  )}
                  {resume.resume_score > 70 ? "Good Profile" : "Needs Improvement"}
                </Badge>
                <p className="mt-6 text-small text-center text-muted-foreground leading-relaxed">
                  Your resume is better than {resume.resume_score}% of applicants in this domain.
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-none shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-h3">
                  <CheckCircle2 className="h-5 w-5 text-accent-500" /> Strengths
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {resume.score_breakdown?.strengths?.map((s: string, i: number) => (
                    <li key={i} className="text-small flex gap-3 leading-relaxed">
                      <span className="text-accent-500 font-bold">•</span> {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-none shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-h3">
                  <AlertTriangle className="h-5 w-5 text-warn-500" /> Weaknesses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {resume.score_breakdown?.weaknesses?.map((w: string, i: number) => (
                    <li key={i} className="text-small flex gap-3 leading-relaxed">
                      <span className="text-warn-500 font-bold">•</span> {w}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-none shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-h3">
                  <Lightbulb className="h-5 w-5 text-brand-600" /> Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {resume.score_breakdown?.recommendations?.map((r: string, i: number) => (
                    <li key={i} className="text-small flex gap-3 leading-relaxed">
                      <span className="text-brand-600 font-bold">•</span> {r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Content & Matches */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="matches" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="matches">Job Matches</TabsTrigger>
                <TabsTrigger value="content">Parsed Content</TabsTrigger>
              </TabsList>
              
              <TabsContent value="matches" className="mt-6">
                <div className="grid gap-6">
                  {matches.map((match) => (
                    <Card key={match.id} className="rounded-3xl border-none shadow-sm">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div>
                              <CardTitle className="text-h3 font-bold">{match.job_title}</CardTitle>
                              <CardDescription className="flex items-center gap-1 mt-1 text-small text-subtle">
                                <Briefcase className="h-3 w-3" /> {match.company}
                              </CardDescription>
                            </div>
                            <button 
                              onClick={() => handleSaveJob(match.id, !match.is_saved)}
                              className={`p-1.5 rounded-lg transition-colors ${match.is_saved ? 'text-brand-600 bg-brand-50' : 'text-subtle hover:bg-muted'}`}
                            >
                              {match.is_saved ? <BookmarkCheck className="h-4 w-4 fill-current" /> : <Bookmark className="h-4 w-4" />}
                            </button>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="success" className="font-bold">
                              {match.match_score}% Match
                            </Badge>
                            <span className="text-label text-subtle flex items-center gap-1">
                              <IndianRupee className="h-3 w-3" /> {match.salary_min} LPA
                            </span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-small text-muted-foreground leading-relaxed">{match.ai_reasoning}</p>
                        
                        <div className="space-y-2">
                          <p className="text-label text-subtle">Missing Skills</p>
                          <div className="flex flex-wrap gap-2">
                            {match.missing_skills?.map((skill: string) => (
                              <SkillPill key={skill} skill={skill} status="missing" />
                            ))}
                          </div>
                        </div>

                        <div className="pt-4 flex flex-wrap items-center justify-between gap-4">
                          <div className="flex flex-wrap gap-2">
                            {match.apply_links && Object.entries(match.apply_links).map(([platform, url]) => (
                              <Button 
                                key={platform} 
                                size="sm" 
                                variant="secondary" 
                                className="capitalize font-bold h-9 px-4 rounded-xl"
                                onClick={() => window.open(url as string, '_blank')}
                              >
                                {platform === 'linkedin' ? <Linkedin className="mr-2 h-4 w-4" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                                {platform}
                              </Button>
                            ))}
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="font-bold h-9 px-4 rounded-xl border-brand-200 text-brand-600 hover:bg-brand-50"
                            onClick={() => {
                              setActiveJobMatch(match);
                              setIsCoverLetterOpen(true);
                            }}
                          >
                            <Sparkles className="mr-2 h-4 w-4" /> Cover Letter
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="content" className="mt-6">
                <Card className="rounded-3xl border-none shadow-sm">
                  <CardContent className="p-8 space-y-8">
                    <section>
                      <h3 className="text-h3 font-bold mb-4 flex items-center gap-2">
                        <User className="h-5 w-5 text-brand-600" /> Profile Summary
                      </h3>
                      <p className="text-body text-muted-foreground leading-relaxed">{resume.parsed_data?.summary}</p>
                    </section>

                    <section>
                      <h3 className="text-h3 font-bold mb-4 flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-brand-600" /> Experience
                      </h3>
                      <div className="space-y-6">
                        {resume.parsed_data?.experience?.map((exp: any, i: number) => (
                          <div key={i} className="border-l-2 border-brand-100 pl-6 relative">
                            <div className="absolute -left-[5px] top-0 h-2 w-2 rounded-full bg-brand-600" />
                            <h4 className="text-h4 font-bold">{exp.title}</h4>
                            <p className="text-small font-medium text-brand-600 mb-2">{exp.company} • {exp.duration}</p>
                            <ul className="space-y-2">
                              {exp.description?.map((desc: string, j: number) => (
                                <li key={j} className="text-small text-muted-foreground flex gap-2">
                                  <span className="text-brand-600">•</span> {desc}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <h3 className="text-h3 font-bold mb-4 flex items-center gap-2">
                        <Lightbulb className="h-5 w-5 text-brand-600" /> Skills
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {resume.parsed_data?.skills?.map((skill: string) => (
                          <SkillPill key={skill} skill={skill} status="present" />
                        ))}
                      </div>
                    </section>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
      <CoverLetterModal 
        isOpen={isCoverLetterOpen}
        onClose={() => setIsCoverLetterOpen(false)}
        resume={resume}
        jobMatch={activeJobMatch}
      />
    </div>
  );
}
