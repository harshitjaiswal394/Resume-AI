"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Lock, Loader2, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const validatePassword = (pwd: string): string[] => {
    const errs: string[] = [];
    if (pwd.length < 8) errs.push('Min 8 characters');
    if (!/[A-Z]/.test(pwd)) errs.push('1 uppercase letter');
    if (!/[a-z]/.test(pwd)) errs.push('1 lowercase letter');
    if (!/\d/.test(pwd)) errs.push('1 number');
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    if (password !== confirmPassword) {
      setErrors(['Passwords do not match']);
      return;
    }

    const pwdErrors = validatePassword(password);
    if (pwdErrors.length > 0) {
      setErrors(pwdErrors);
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setIsSuccess(true);
      toast.success('Password updated successfully!');
    } catch (error: any) {
      if (error.message?.includes('same password')) {
        setErrors(['New password must be different from the old one.']);
      } else if (error.message?.includes('session')) {
        setErrors(['Reset link expired. Please request a new one.']);
      } else {
        setErrors([error.message || 'Failed to update password']);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-slate-50 flex items-center justify-center p-6">
        <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-amber-100/60 blur-3xl" />
        <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-10 text-center shadow-2xl shadow-brand-900/5 ring-1 ring-slate-100">
          <div className="h-1.5 w-full bg-gradient-to-r from-brand-500 via-brand-700 to-amber-400" />
          <div className="relative mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-lg shadow-brand-600/25 ring-1 ring-white/20">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-2xl font-black tracking-tight text-slate-900">Password Updated</h1>
          <p className="mt-2 text-sm text-slate-500">Your password has been successfully changed.</p>
          <Link href="/dashboard" className="mt-8 block">
            <Button className="w-full h-12 rounded-xl text-base font-bold bg-brand-600 hover:bg-brand-800 shadow-lg shadow-brand-600/25">
              Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 flex items-center justify-center p-6">
      <div className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-brand-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full bg-amber-100/60 blur-3xl" />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-10 shadow-2xl shadow-brand-900/5 ring-1 ring-slate-100 space-y-6">
        <div className="h-1.5 w-full bg-gradient-to-r from-brand-500 via-brand-700 to-amber-400" />
        <div className="relative mt-2 flex h-12 w-12 items-center justify-center">
          <div className="pointer-events-none absolute -inset-3 rounded-3xl bg-brand-100/60 blur-2xl" />
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-lg shadow-brand-600/30 ring-1 ring-white/20">
            <Sparkles className="h-6 w-6" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 mb-1">Set new password</h1>
          <p className="text-sm text-slate-500">Choose a strong password for your account.</p>
        </div>

        {errors.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1">
            {errors.map((err, i) => (
              <p key={i} className="text-rose-600 text-xs font-medium flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> {err}
              </p>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative group">
            <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
            <input type="password" placeholder="New password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50/80 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white outline-none transition-all" />
          </div>
          <div className="relative group">
            <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
            <input type="password" placeholder="Confirm new password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50/80 text-sm focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white outline-none transition-all" />
          </div>
          <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold bg-brand-600 hover:bg-brand-800 shadow-lg shadow-brand-600/25">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
