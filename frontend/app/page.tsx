"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
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
  Star
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AuthModal } from '@/components/common/AuthModal';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';

export default function LandingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [resumeCount, setResumeCount] = useState<number | null>(null);

  React.useEffect(() => {
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

  const handleGetStarted = () => {
    router.push('/onboarding');
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col items-center bg-[#fcfdff]">
      {/* Hero Section */}
      <section className="container relative overflow-hidden py-20 lg:py-32">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-start text-left"
          >
            <Badge variant="info" className="mb-6 px-4 py-1">
              <Zap className="mr-2 h-3 w-3 fill-brand-600" /> AI-Powered Resume Analysis for Indian Job Market
            </Badge>
            <h1 className="text-display font-bold">
              Get <span className="text-brand-600">3x More</span> <br />
              Interview Calls with AI
            </h1>
            <p className="mt-8 text-body text-muted-foreground max-w-xl">
              Analyze your resume in 30 seconds. Match with the right jobs on Naukri, LinkedIn & more. Know exactly what&apos;s holding you back.
            </p>
            
            <div className="mt-10 flex flex-wrap gap-6">
              <div className="flex items-center gap-2 text-small font-medium">
                <CheckCircle2 className="h-5 w-5 text-accent-500" /> ATS Score
              </div>
              <div className="flex items-center gap-2 text-small font-medium">
                <CheckCircle2 className="h-5 w-5 text-accent-500" /> Job Match %
              </div>
              <div className="flex items-center gap-2 text-small font-medium">
                <CheckCircle2 className="h-5 w-5 text-accent-500" /> Missing Skills
              </div>
              <div className="flex items-center gap-2 text-small font-medium">
                <CheckCircle2 className="h-5 w-5 text-accent-500" /> AI Rewrites
              </div>
            </div>

            <div className="mt-12 flex flex-col sm:flex-row gap-4 w-full sm:w-auto items-center">
              {(!user || resumeCount === 0) ? (
                <Button size="lg" className="w-full sm:w-auto shadow-lg shadow-brand-500/20" onClick={handleGetStarted}>
                  <Upload className="mr-2 h-5 w-5" /> Upload Resume — It&apos;s Free <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              ) : (
                <Button size="lg" variant="secondary" onClick={() => router.push('/dashboard')}>
                  Go to Dashboard
                </Button>
              )}

              {!user && (
                <button 
                  onClick={() => setShowAuthModal(true)}
                  className="text-small font-bold text-muted-foreground hover:text-brand-600 transition-colors"
                >
                  Already have an account? <span className="text-brand-600 underline underline-offset-4">Sign in</span>
                </button>
              )}
            </div>
            
            <p className="mt-6 text-small text-subtle flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent-500" /> आपका डेटा सुरक्षित है — 256-bit encrypted. No spam, ever.
            </p>
          </motion.div>

          {/* Hero Image / Upload Box Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="relative rounded-[2rem] border-2 border-dashed border-primary/20 bg-white p-8 shadow-2xl">
              <div className="flex flex-col items-center justify-center py-12">
                <div className="rounded-2xl bg-primary/10 p-6 mb-6">
                  <Upload className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Drag & drop your resume</h3>
                <p className="text-muted-foreground mb-8">or click to browse files</p>
                <div className="flex gap-3">
                  <Badge variant="outline" className="bg-muted/50">PDF</Badge>
                  <Badge variant="outline" className="bg-muted/50">DOCX</Badge>
                  <Badge variant="outline" className="bg-muted/50">Max 5 MB</Badge>
                </div>
              </div>
              
              <div className="mt-8 pt-8 border-t">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">What you&apos;ll get</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-indigo-50 p-4">
                    <p className="text-2xl font-bold text-primary">78/100</p>
                    <p className="text-xs text-muted-foreground">Resume Score</p>
                  </div>
                  <div className="rounded-xl bg-green-50 p-4">
                    <p className="text-2xl font-bold text-green-600">92%</p>
                    <p className="text-xs text-muted-foreground">ATS Compatible</p>
                  </div>
                  <div className="rounded-xl bg-purple-50 p-4">
                    <p className="text-2xl font-bold text-purple-600">8 roles</p>
                    <p className="text-xs text-muted-foreground">Job Matches</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-4">
                    <p className="text-2xl font-bold text-amber-600">4 found</p>
                    <p className="text-xs text-muted-foreground">Missing Skills</p>
                  </div>
                </div>
              </div>
            </div>
            {/* Floating elements */}
            <div className="absolute -bottom-6 -left-6 rounded-2xl bg-white p-4 shadow-xl border flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                <Star className="h-5 w-5 fill-green-600" />
              </div>
              <div>
                <p className="text-sm font-bold">10,000+ resumes analyzed</p>
                <p className="text-xs text-muted-foreground">No credit card required</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="w-full py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <Badge variant="info" className="mb-4">FEATURES</Badge>
            <h2 className="text-h1 font-bold">Everything you need to land your next role</h2>
            <p className="mt-6 text-body text-muted-foreground max-w-3xl mx-auto">
              Built specifically for the Indian job market — from freshers applying to product companies to experienced professionals targeting FAANG.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            <FeatureCard 
              icon={<Target className="h-6 w-6" />}
              title="Resume Score (0–100)"
              description="Get an instant score across ATS compatibility, keyword density, formatting, and readability. Know exactly where you stand."
              isFree
            />
            <FeatureCard 
              icon={<Sparkles className="h-6 w-6" />}
              title="Job Match %"
              description="AI compares your resume against live job descriptions and shows how well you match each role — with a percentage score."
              isFree
            />
            <FeatureCard 
              icon={<Search className="h-6 w-6" />}
              title="Missing Skills Detection"
              description="See exactly which skills employers are looking for that are absent from your resume — and how to add them effectively."
              isFree
            />
            <FeatureCard 
              icon={<Zap className="h-6 w-6" />}
              title="ATS Optimization"
              description="Ensure your resume passes Applicant Tracking Systems used by top Indian companies like TCS, Infosys, and Google."
              isFree
            />
            <FeatureCard 
              icon={<Sparkles className="h-6 w-6" />}
              title="AI Bullet Point Rewrites"
              description="Weak bullet points rewritten by AI to be impact-focused, quantified, and action-oriented. Copy with one click."
              isPro
            />
            <FeatureCard 
              icon={<FileText className="h-6 w-6" />}
              title="Cover Letter Generator"
              description="Generate a tailored cover letter for any role in seconds. Customized for Indian job market tone and expectations."
              isPro
            />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="w-full py-24 bg-[#fcfdff]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-20">
            <Badge variant="outline" className="mb-4 text-primary border-primary/20">HOW IT WORKS</Badge>
            <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl">From resume to interview in 3 steps</h2>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-center gap-12 max-w-5xl mx-auto">
            <StepItem 
              number="01"
              icon={<Upload className="h-8 w-8 text-white" />}
              title="Upload Your Resume"
              description="Drag and drop your PDF or DOCX. No sign-up required. Takes under 5 seconds."
              color="bg-indigo-600"
            />
            <ChevronRight className="hidden md:block h-8 w-8 text-muted-foreground/30" />
            <StepItem 
              number="02"
              icon={<Sparkles className="h-8 w-8 text-white" />}
              title="AI Analyzes in 30 Seconds"
              description="Our AI scans for ATS compatibility, keywords, formatting, and skill gaps across 200+ data points."
              color="bg-purple-600"
            />
            <ChevronRight className="hidden md:block h-8 w-8 text-muted-foreground/30" />
            <StepItem 
              number="03"
              icon={<Briefcase className="h-8 w-8 text-white" />}
              title="Get Matched & Apply"
              description="See your top job matches with direct apply links to Naukri, LinkedIn, Indeed, and Instahyre."
              color="bg-green-600"
            />
          </div>
        </div>
      </section>
      {/* Pricing Section */}
      <section id="pricing" className="container py-24">
        <div className="text-center mb-16">
          <Badge variant="info" className="mb-4">PRICING</Badge>
          <h2 className="text-h1 font-bold">Simple, India-Friendly Pricing</h2>
        </div>
        <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
          <div className="card flex flex-col p-10">
            <h3 className="text-h3 font-bold">Free</h3>
            <div className="mt-4 flex items-baseline">
              <span className="text-display font-black">₹0</span>
            </div>
            <ul className="mt-8 space-y-4 flex-1">
              <PricingFeature text="2 Resume analyses per month" />
              <PricingFeature text="5 Job matches per analysis" />
              <PricingFeature text="Basic AI insights" />
              <PricingFeature text="Standard support" />
            </ul>
            <Button className="mt-10 w-full h-12" variant="secondary" onClick={handleGetStarted}>
              Start for Free
            </Button>
          </div>
          <div className="card border-2 border-brand-600 flex flex-col p-10 relative overflow-hidden shadow-lift">
            <div className="absolute top-0 right-0 bg-brand-600 text-white text-label px-4 py-1 rounded-bl-xl">Most Popular</div>
            <h3 className="text-h3 font-bold">Pro</h3>
            <div className="mt-4 flex items-baseline">
              <span className="text-display font-black">₹299</span>
              <span className="ml-1 text-muted-foreground font-bold">/month</span>
            </div>
            <ul className="mt-8 space-y-4 flex-1">
              <PricingFeature text="Unlimited resume analyses" />
              <PricingFeature text="Unlimited job matches" />
              <PricingFeature text="Advanced AI gap analysis" />
              <PricingFeature text="Resume optimization tips" />
              <PricingFeature text="AI Cover letter generator" />
              <PricingFeature text="Priority support" />
            </ul>
            <Button className="mt-10 w-full h-12 shadow-lg shadow-brand-500/20" onClick={handleGetStarted}>
              Upgrade to Pro
            </Button>
          </div>
        </div>
      </section>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  );
}

function PricingFeature({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-3">
      <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center text-green-600">
        <CheckCircle2 className="h-3 w-3" />
      </div>
      <span className="text-sm font-medium">{text}</span>
    </li>
  );
}

function FeatureCard({ icon, title, description, isFree, isPro }: any) {
  return (
    <div className="group card transition-all hover:shadow-lift hover:-translate-y-1">
      <div className="flex justify-between items-start mb-6">
        <div className="rounded-2xl bg-brand-50 p-4 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors">
          {icon}
        </div>
        {isFree && <Badge variant="success">Free</Badge>}
        {isPro && <Badge variant="info">Pro</Badge>}
      </div>
      <h3 className="text-h3 font-bold mb-3">{title}</h3>
      <p className="text-small text-muted-foreground">{description}</p>
    </div>
  );
}

function StepItem({ number, icon, title, description, color }: any) {
  return (
    <div className="flex flex-col items-center text-center max-w-xs">
      <div className={`relative h-20 w-20 rounded-[2rem] ${color} flex items-center justify-center mb-6 shadow-xl`}>
        {icon}
        <span className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-white border-2 flex items-center justify-center text-xs font-bold">
          {number}
        </span>
      </div>
      <h3 className="text-xl font-bold mb-3">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
