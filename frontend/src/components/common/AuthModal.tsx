import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { X, Sparkles, Shield, Zap, Mail, Lock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  description?: string;
}

export function AuthModal({ isOpen, onClose, onSuccess, title, description }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Log for debugging
      console.log('AuthModal received message from:', event.origin);
      
      // Detailed check
      if (event.origin !== window.location.origin) {
        console.warn('AuthModal ignoring message from different origin:', event.origin);
        return;
      }

      if (event.data?.type === 'SUPABASE_AUTH_SUCCESS') {
        console.log('Supabase auth success signal received');
        onClose();
        toast.success('Successfully signed in!');
        
        if (onSuccess) {
          onSuccess();
        } else {
          // Default logic: Small delay to let Supabase sync, then redirect or reload
          setTimeout(() => {
            const currentPath = window.location.pathname;
            console.log('Redirecting/Reloading from path:', currentPath);
            if (currentPath === '/' || currentPath === '/auth/callback') {
              window.location.href = '/dashboard';
            } else {
              window.location.reload();
            }
          }, 500);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onClose]);

  const handleGoogleLogin = async () => {
    try {
      const redirectUrl = `${window.location.origin}/auth/callback`;
      console.log('Initiating Google Login with redirect:', redirectUrl);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      
      if (error) {
        if (error.message.includes('provider is not enabled')) {
          toast.error('Google Auth is not enabled in your Supabase project!', {
            duration: 10000,
            description: 'Go to Authentication > Providers > Google in Supabase Dashboard and enable it.'
          });
        } else {
          throw error;
        }
        return;
      }
      
      if (data?.url) {
        // Open in a popup for better iframe compatibility
        const authWindow = window.open(data.url, '_blank', 'width=600,height=700');
        
        if (!authWindow) {
          toast.error('Popup blocked. Please allow popups for this site.');
          return;
        }

        // Check if the window is closed periodically
        const timer = setInterval(() => {
          if (authWindow.closed) {
            clearInterval(timer);
            // The AuthProvider will pick up the session change automatically
          }
        }, 1000);
      }
    } catch (error: any) {
      console.error('Login failed', error);
      toast.error(error.message || 'Failed to sign in with Google. Please try again.');
    }
  };

  const handleResendEmail = async () => {
    if (!email) {
      toast.error('Please enter your email first');
      return;
    }
    setIsResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });
      if (error) throw error;
      toast.success('Confirmation email resent! Please check your inbox.');
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend email');
    } finally {
      setIsResending(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast.success('Check your email for the confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success('Successfully signed in!');
        onClose();
      }
    } catch (error: any) {
      toast.error(error.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full p-2 text-muted-foreground hover:bg-muted transition-colors z-10"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="p-8">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Sparkles className="h-6 w-6" />
              </div>

              <h2 className="text-h2 font-bold mb-2">
                {mode === 'signup' ? (title || 'Create your account') : 'Welcome back'}
              </h2>
              <p className="text-body text-muted-foreground mb-8">
                {mode === 'signup' 
                  ? (description || 'Join 10,000+ job seekers using ResuMatch AI to land their dream roles.')
                  : 'Sign in to access your resumes and job matches.'}
              </p>

              <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
                <div className="space-y-2">
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-5 w-5 text-subtle" />
                    <input
                      type="email"
                      placeholder="Email address"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-12 pl-11 pr-4 rounded-xl border border-border bg-surface text-body focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-subtle" />
                    <input
                      type="password"
                      placeholder="Password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-12 pl-11 pr-4 rounded-xl border border-border bg-surface text-body focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 rounded-xl text-lg font-bold shadow-lg shadow-brand-500/20"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (mode === 'signup' ? 'Sign Up' : 'Sign In')}
                </Button>

                {mode === 'signup' && (
                  <button
                    type="button"
                    onClick={handleResendEmail}
                    disabled={isResending}
                    className="w-full text-xs text-subtle hover:text-brand-600 transition-colors mt-2"
                  >
                    {isResending ? 'Resending...' : "Didn't get the email? Resend confirmation"}
                  </button>
                )}
              </form>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-subtle">Or continue with</span>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={handleGoogleLogin}
                className="w-full h-12 rounded-xl text-body font-bold border-border hover:bg-muted transition-all"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="mr-2 h-5 w-5" referrerPolicy="no-referrer" />
                Google
              </Button>

              <div className="mt-8 text-center">
                <button
                  onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
                  className="text-small font-bold text-brand-600 hover:underline"
                >
                  {mode === 'signup' ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>
              </div>

              <div className="mt-4 p-3 bg-muted rounded-xl text-[10px] text-subtle break-all">
                <p className="font-bold mb-1 uppercase">Required Supabase Redirect URI:</p>
                <code>{typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback</code>
              </div>

              <p className="mt-6 text-center text-[11px] text-subtle flex items-center justify-center gap-2">
                <Shield className="h-3 w-3" /> Secure & encrypted.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
