import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { auth, googleProvider } from '@/lib/firebase';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';
import { X, Sparkles, Shield, Zap, Mail, Lock, Loader2, Phone, KeyRound, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  description?: string;
  defaultView?: 'signin' | 'signup';
}

type AuthView = 'signin' | 'signup' | 'otp-email' | 'otp-phone' | 'verify-otp' | 'forgot-password';

export function AuthModal({ isOpen, onClose, onSuccess, title, description, defaultView = 'signup' }: AuthModalProps) {
  const [view, setView] = useState<AuthView>(defaultView);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpTarget, setOtpTarget] = useState<'email' | 'phone'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [mounted, setMounted] = useState(false);

  // Client-side only portal mount
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Sync defaultView whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setView(defaultView);
    }
  }, [isOpen, defaultView]);

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
      setShowPassword(false);
    }
  }, [isOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Firebase handles auth state globally, so we don't need a custom window listener
  // for popups in the same way Supabase did.

  const validatePassword = (pwd: string): string[] => {
    const errs: string[] = [];
    if (pwd.length < 8) errs.push('Min 8 characters');
    if (!/[A-Z]/.test(pwd)) errs.push('1 uppercase letter');
    if (!/[a-z]/.test(pwd)) errs.push('1 lowercase letter');
    if (!/\d/.test(pwd)) errs.push('1 number');
    return errs;
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        toast.success('Successfully signed in with Google!');
        onClose();
        if (onSuccess) onSuccess();
        else setTimeout(() => { window.location.href = '/dashboard'; }, 300);
      }
    } catch (error: any) {
      console.error('Google Auth Error:', error);
      toast.error(error.message || 'Failed to sign in with Google.');
    } finally {
      setIsLoading(false);
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
        const result = await createUserWithEmailAndPassword(auth, email, password);
        if (result.user) {
          await sendEmailVerification(result.user);
          toast.success('Account created! Please verify your email.');
          onClose();
          if (onSuccess) onSuccess();
        }
      } else if (view === 'signin') {
        const result = await signInWithEmailAndPassword(auth, email, password);
        if (result.user) {
          toast.success('Successfully signed in!');
          onClose();
          if (onSuccess) onSuccess();
          else setTimeout(() => { window.location.href = '/dashboard'; }, 300);
        }
      }
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        setErrors(['This email is already registered. Try signing in.']);
      } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
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
      await sendPasswordResetEmail(auth, email);
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

  // ================================
  // Shared UI helpers
  // ================================

  const inputClass = "w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50/80 text-sm font-medium placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white outline-none transition-all duration-200";

  const renderErrors = () => {
    if (errors.length === 0) return null;
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-rose-50 border border-rose-200/60 rounded-xl p-3.5 space-y-1"
      >
        {errors.map((err, i) => (
          <p key={i} className="text-rose-600 text-xs font-semibold flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0" />
            {err}
          </p>
        ))}
      </motion.div>
    );
  };

  const renderView = () => {
    // ----- VERIFY OTP -----
    if (view === 'verify-otp') {
      return (
        <motion.div key="verify-otp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }} className="space-y-6">
          <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-semibold transition-colors group">
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" /> Back
          </button>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">Enter verification code</h2>
            <p className="text-sm text-slate-500">
              Sent to <span className="font-semibold text-slate-700">{otpTarget === 'email' ? email : phone}</span>
            </p>
          </div>
          {renderErrors()}
          <div className="flex justify-center gap-2.5 sm:gap-3" onPaste={handleOtpPaste}>
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
                className="h-13 w-11 sm:h-14 sm:w-12 text-center text-xl sm:text-2xl font-black rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-slate-50 hover:border-slate-300"
              />
            ))}
          </div>
          <Button onClick={handleVerifyOtp} disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/30">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Verify & Sign In'}
          </Button>
          <div className="text-center">
            <button
              onClick={handleResendOtp}
              disabled={resendTimer > 0 || isResending}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline disabled:text-slate-400 disabled:no-underline transition-colors"
            >
              {resendTimer > 0 ? `Resend in ${resendTimer}s` : isResending ? 'Resending...' : 'Resend code'}
            </button>
          </div>
        </motion.div>
      );
    }

    // ----- FORGOT PASSWORD -----
    if (view === 'forgot-password') {
      return (
        <motion.div key="forgot-password" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <button type="button" onClick={goBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-semibold transition-colors group">
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" /> Back to login
            </button>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">Reset your password</h2>
              <p className="text-sm text-slate-500">We'll send a reset link to your email.</p>
            </div>
            {renderErrors()}
            <div className="relative group">
              <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input type="email" placeholder="Email address" required value={email} onChange={e => setEmail(e.target.value)}
                className={inputClass} />
            </div>
            <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/30">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send Reset Link'}
            </Button>
          </form>
        </motion.div>
      );
    }

    // ----- OTP EMAIL -----
    if (view === 'otp-email') {
      return (
        <motion.div key="otp-email" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          <div className="space-y-5">
            <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-semibold transition-colors group">
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" /> Back
            </button>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">Login with Email OTP</h2>
              <p className="text-sm text-slate-500">We'll send a 6-digit code to your email.</p>
            </div>
            {renderErrors()}
            <div className="relative group">
              <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input type="email" placeholder="Email address" required value={email} onChange={e => setEmail(e.target.value)}
                className={inputClass} />
            </div>
            <Button onClick={() => handleSendOtp('email')} disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/30">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send OTP'}
            </Button>
          </div>
        </motion.div>
      );
    }

    // ----- OTP PHONE -----
    if (view === 'otp-phone') {
      return (
        <motion.div key="otp-phone" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
          <div className="space-y-5">
            <button onClick={goBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-semibold transition-colors group">
              <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" /> Back
            </button>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">Login with Mobile OTP</h2>
              <p className="text-sm text-slate-500">Enter your phone number with country code.</p>
            </div>
            {renderErrors()}
            <div className="relative group">
              <Phone className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input type="tel" placeholder="+919876543210" required value={phone} onChange={e => setPhone(e.target.value)}
                className={inputClass} />
            </div>
            <Button onClick={() => handleSendOtp('phone')} disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/30">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send OTP'}
            </Button>
          </div>
        </motion.div>
      );
    }

    // ----- SIGN UP / SIGN IN -----
    return (
      <motion.div key="auth-main" initial={{ opacity: 0, x: view === 'signup' ? -20 : 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
        <div className="space-y-5">
          {/* Tab Switcher */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => { setView('signin'); setErrors([]); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 ${
                view === 'signin'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setView('signup'); setErrors([]); }}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-200 ${
                view === 'signup'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
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
            <div className="relative group">
              <Mail className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input type="email" placeholder="Email address" required value={email} onChange={e => setEmail(e.target.value)}
                className={inputClass} />
            </div>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input type={showPassword ? 'text' : 'password'} placeholder="Password" required value={password} onChange={e => setPassword(e.target.value)}
                className={`${inputClass} pr-11`} />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {view === 'signup' && (
              <div className="relative group">
                <Phone className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input type="tel" placeholder="Phone (optional, e.g. +919876543210)" value={phone} onChange={e => setPhone(e.target.value)}
                  className={inputClass} />
              </div>
            )}
            <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (view === 'signup' ? 'Sign Up' : 'Sign In')}
            </Button>
          </form>

          {view === 'signin' && (
            <button onClick={() => setView('forgot-password')} className="w-full text-xs text-slate-500 hover:text-blue-600 font-semibold transition-colors">
              Forgot your password?
            </button>
          )}

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-3 text-slate-400 font-semibold tracking-wider">Or continue with</span></div>
          </div>

          {/* OTP + Google options */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setView('otp-email')}
              className="flex items-center justify-center gap-2 h-11 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
            >
              <KeyRound className="h-4 w-4 text-slate-500" /> Email OTP
            </button>
            <button
              type="button"
              onClick={() => setView('otp-phone')}
              className="flex items-center justify-center gap-2 h-11 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
            >
              <Phone className="h-4 w-4 text-slate-500" /> Mobile OTP
            </button>
          </div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-2.5 h-12 rounded-xl text-sm font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm transition-all duration-200"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-5 w-5" referrerPolicy="no-referrer" />
            Google
          </button>
        </div>
      </motion.div>
    );
  };

  // Don't render on server - use portal to render at document.body level
  if (!mounted) return null;

  const modalContent = (
    <AnimatePresence mode="wait">
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Authentication"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="relative w-full max-w-[440px] max-h-[90vh] overflow-y-auto rounded-2xl sm:rounded-3xl bg-white shadow-2xl shadow-black/20 ring-1 ring-black/5"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#e2e8f0 transparent' }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute right-3 top-3 sm:right-4 sm:top-4 rounded-full p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all duration-150 z-10"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Content */}
            <div className="p-6 sm:p-8">
              {/* Logo icon for main auth views */}
              {(view === 'signup' || view === 'signin') && (
                <div className="mb-5 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30">
                  <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
              )}

              <AnimatePresence mode="wait">
                {renderView()}
              </AnimatePresence>

              {/* Footer */}
              <p className="mt-6 text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5 font-medium">
                <Shield className="h-3 w-3" /> Secure & encrypted
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
