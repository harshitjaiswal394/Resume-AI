import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { X, Sparkles, Shield, Zap, Mail, Lock, Loader2, Phone, KeyRound, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  description?: string;
}

type AuthView = 'signin' | 'signup' | 'otp-email' | 'otp-phone' | 'verify-otp' | 'forgot-password';

export function AuthModal({ isOpen, onClose, onSuccess, title, description }: AuthModalProps) {
  const [view, setView] = useState<AuthView>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpTarget, setOtpTarget] = useState<'email' | 'phone'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Resend cooldown timer
  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [resendTimer]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setErrors([]);
      setOtpDigits(['', '', '', '', '', '']);
    }
  }, [isOpen]);

  // Listen for auth success from popup (Google OAuth)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'SUPABASE_AUTH_SUCCESS') {
        onClose();
        toast.success('Successfully signed in!');
        if (onSuccess) {
          onSuccess();
        } else {
          setTimeout(() => {
            const currentPath = window.location.pathname;
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
  }, [onClose, onSuccess]);

  const validatePassword = (pwd: string): string[] => {
    const errs: string[] = [];
    if (pwd.length < 8) errs.push('Min 8 characters');
    if (!/[A-Z]/.test(pwd)) errs.push('1 uppercase letter');
    if (!/[a-z]/.test(pwd)) errs.push('1 lowercase letter');
    if (!/\d/.test(pwd)) errs.push('1 number');
    return errs;
  };

  const handleGoogleLogin = async () => {
    try {
      const redirectUrl = `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) {
        if (error.message.includes('provider is not enabled')) {
          toast.error('Google Auth not enabled in Supabase!', {
            duration: 10000,
            description: 'Go to Authentication > Providers > Google in Supabase Dashboard.'
          });
        } else {
          throw error;
        }
        return;
      }
      if (data?.url) {
        const authWindow = window.open(data.url, '_blank', 'width=600,height=700');
        if (!authWindow) {
          toast.error('Popup blocked. Please allow popups for this site.');
          return;
        }
        const timer = setInterval(() => {
          if (authWindow.closed) clearInterval(timer);
        }, 1000);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign in with Google.');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    setIsLoading(true);
    try {
      if (view === 'signup') {
        const pwdErrors = validatePassword(password);
        if (pwdErrors.length > 0) {
          setErrors(pwdErrors);
          setIsLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { phone: phone || undefined } }
        });
        if (error) throw error;
        toast.success('Check your email for the confirmation link!');
      } else if (view === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success('Successfully signed in!');
        onClose();
        if (onSuccess) onSuccess();
        else setTimeout(() => { window.location.href = '/dashboard'; }, 300);
      }
    } catch (error: any) {
      if (error.message?.includes('already registered')) {
        setErrors(['This email is already registered. Try signing in.']);
      } else if (error.message?.includes('Invalid login')) {
        setErrors(['Incorrect email or password.']);
      } else {
        setErrors([error.message || 'Authentication failed']);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async (type: 'email' | 'phone') => {
    setErrors([]);
    setIsLoading(true);
    try {
      if (type === 'email') {
        if (!email) { setErrors(['Enter your email']); setIsLoading(false); return; }
        const { error } = await supabase.auth.signInWithOtp({ email });
        if (error) throw error;
        toast.success('OTP sent to your email!');
      } else {
        if (!phone) { setErrors(['Enter your phone number']); setIsLoading(false); return; }
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
        toast.success('OTP sent to your phone!');
      }
      setOtpTarget(type);
      setView('verify-otp');
      setResendTimer(60);
    } catch (error: any) {
      if (error.message?.includes('rate')) {
        setErrors(['Too many attempts. Wait a few minutes.']);
      } else {
        setErrors([error.message || 'Failed to send OTP']);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setErrors([]);
    const token = otpDigits.join('');
    if (token.length !== 6) {
      setErrors(['Enter all 6 digits']);
      return;
    }
    setIsLoading(true);
    try {
      const params: any = { token, type: otpTarget === 'email' ? 'email' : 'sms' };
      if (otpTarget === 'email') params.email = email;
      else params.phone = phone;

      const { error } = await supabase.auth.verifyOtp(params);
      if (error) throw error;
      toast.success('Verified! Signing you in...');
      onClose();
      if (onSuccess) onSuccess();
      else setTimeout(() => { window.location.href = '/dashboard'; }, 300);
    } catch (error: any) {
      if (error.message?.includes('expired')) {
        setErrors(['OTP expired. Please request a new one.']);
      } else if (error.message?.includes('invalid') || error.message?.includes('Invalid')) {
        setErrors(['Invalid OTP. Check and try again.']);
      } else {
        setErrors([error.message || 'Verification failed']);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setIsResending(true);
    try {
      if (otpTarget === 'email') {
        const { error } = await supabase.auth.signInWithOtp({ email });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
      }
      toast.success('New OTP sent!');
      setResendTimer(60);
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend');
    } finally {
      setIsResending(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    if (!email) { setErrors(['Enter your email']); return; }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success('Password reset link sent to your email!');
    } catch (error: any) {
      setErrors([error.message || 'Failed to send reset link']);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    // Auto-focus next
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);
    if (pasted.length === 6) otpRefs.current[5]?.focus();
  };

  const goBack = () => {
    setErrors([]);
    setOtpDigits(['', '', '', '', '', '']);
    if (view === 'verify-otp') { setView(otpTarget === 'email' ? 'otp-email' : 'otp-phone'); }
    else if (view === 'otp-email' || view === 'otp-phone' || view === 'forgot-password') { setView('signin'); }
    else { setView('signup'); }
  };

  const renderErrors = () => {
    if (errors.length === 0) return null;
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1">
        {errors.map((err, i) => (
          <p key={i} className="text-rose-600 text-xs font-medium">• {err}</p>
        ))}
      </div>
    );
  };

  const renderView = () => {
    // ----- VERIFY OTP -----
    if (view === 'verify-otp') {
      return (
        <div className="space-y-6">
          <button onClick={goBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 font-medium">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div>
            <h2 className="text-2xl font-bold mb-1">Enter verification code</h2>
            <p className="text-sm text-slate-500">
              Sent to <span className="font-semibold text-slate-700">{otpTarget === 'email' ? email : phone}</span>
            </p>
          </div>
          {renderErrors()}
          <div className="flex justify-center gap-3" onPaste={handleOtpPaste}>
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={el => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                className="h-14 w-12 text-center text-2xl font-black rounded-xl border-2 border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all bg-slate-50"
              />
            ))}
          </div>
          <Button onClick={handleVerifyOtp} disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Verify & Sign In'}
          </Button>
          <div className="text-center">
            <button
              onClick={handleResendOtp}
              disabled={resendTimer > 0 || isResending}
              className="text-xs font-bold text-indigo-600 hover:underline disabled:text-slate-400 disabled:no-underline"
            >
              {resendTimer > 0 ? `Resend in ${resendTimer}s` : isResending ? 'Resending...' : 'Resend code'}
            </button>
          </div>
        </div>
      );
    }

    // ----- FORGOT PASSWORD -----
    if (view === 'forgot-password') {
      return (
        <form onSubmit={handleForgotPassword} className="space-y-5">
          <button type="button" onClick={goBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 font-medium">
            <ArrowLeft className="h-4 w-4" /> Back to login
          </button>
          <div>
            <h2 className="text-2xl font-bold mb-1">Reset your password</h2>
            <p className="text-sm text-slate-500">We'll send a reset link to your email.</p>
          </div>
          {renderErrors()}
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input type="email" placeholder="Email address" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
          </div>
          <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send Reset Link'}
          </Button>
        </form>
      );
    }

    // ----- OTP EMAIL -----
    if (view === 'otp-email') {
      return (
        <div className="space-y-5">
          <button onClick={goBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 font-medium">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div>
            <h2 className="text-2xl font-bold mb-1">Login with Email OTP</h2>
            <p className="text-sm text-slate-500">We'll send a 6-digit code to your email.</p>
          </div>
          {renderErrors()}
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input type="email" placeholder="Email address" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
          </div>
          <Button onClick={() => handleSendOtp('email')} disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send OTP'}
          </Button>
        </div>
      );
    }

    // ----- OTP PHONE -----
    if (view === 'otp-phone') {
      return (
        <div className="space-y-5">
          <button onClick={goBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 font-medium">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div>
            <h2 className="text-2xl font-bold mb-1">Login with Mobile OTP</h2>
            <p className="text-sm text-slate-500">Enter your phone number with country code.</p>
          </div>
          {renderErrors()}
          <div className="relative">
            <Phone className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input type="tel" placeholder="+919876543210" required value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
          </div>
          <Button onClick={() => handleSendOtp('phone')} disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send OTP'}
          </Button>
        </div>
      );
    }

    // ----- SIGN UP / SIGN IN -----
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold mb-1">
            {view === 'signup' ? (title || 'Create your account') : 'Welcome back'}
          </h2>
          <p className="text-sm text-slate-500">
            {view === 'signup'
              ? (description || 'Join 10,000+ job seekers using ResuMatch AI to land their dream roles.')
              : 'Sign in to access your resumes and job matches.'}
          </p>
        </div>

        {renderErrors()}

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input type="email" placeholder="Email address" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input type="password" placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
          </div>
          {view === 'signup' && (
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input type="tel" placeholder="Phone (optional, e.g. +919876543210)" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
            </div>
          )}
          <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-indigo-500/20">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (view === 'signup' ? 'Sign Up' : 'Sign In')}
          </Button>
        </form>

        {view === 'signin' && (
          <button onClick={() => setView('forgot-password')} className="w-full text-xs text-slate-500 hover:text-indigo-600 font-medium">
            Forgot your password?
          </button>
        )}

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400">Or continue with</span></div>
        </div>

        {/* OTP + Google options */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" type="button" onClick={() => setView('otp-email')} className="h-11 rounded-xl text-xs font-bold border-slate-200">
            <KeyRound className="mr-1.5 h-4 w-4" /> Email OTP
          </Button>
          <Button variant="outline" type="button" onClick={() => setView('otp-phone')} className="h-11 rounded-xl text-xs font-bold border-slate-200">
            <Phone className="mr-1.5 h-4 w-4" /> Mobile OTP
          </Button>
        </div>
        <Button variant="outline" onClick={handleGoogleLogin} className="w-full h-12 rounded-xl text-sm font-bold border-slate-200 hover:bg-slate-50 transition-all">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="mr-2 h-5 w-5" referrerPolicy="no-referrer" />
          Google
        </Button>

        {/* Toggle sign in / sign up */}
        <div className="text-center pt-2">
          <button onClick={() => { setView(view === 'signup' ? 'signin' : 'signup'); setErrors([]); }}
            className="text-sm font-bold text-indigo-600 hover:underline">
            {view === 'signup' ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 transition-colors z-10">
              <X className="h-5 w-5" />
            </button>

            <div className="p-8">
              {(view === 'signup' || view === 'signin') && (
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Sparkles className="h-6 w-6" />
                </div>
              )}
              {renderView()}
              <p className="mt-6 text-center text-[11px] text-slate-400 flex items-center justify-center gap-2">
                <Shield className="h-3 w-3" /> Secure & encrypted
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
