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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center space-y-6">
          <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Password Updated</h1>
          <p className="text-sm text-slate-500">Your password has been successfully changed.</p>
          <Link href="/dashboard">
            <Button className="w-full h-12 rounded-xl text-base font-bold">Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full space-y-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50">
          <Sparkles className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 mb-1">Set new password</h1>
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
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input type="password" placeholder="New password" required value={password} onChange={e => setPassword(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            <input type="password" placeholder="Confirm new password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
          </div>
          <Button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-indigo-500/20">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}
