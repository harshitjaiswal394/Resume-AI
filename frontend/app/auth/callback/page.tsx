"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('Auth callback initiated...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Supabase getSession error:', error);
          throw error;
        }

        console.log('Session retrieved:', session ? 'Yes' : 'No');
        
        if (typeof window !== 'undefined') {
          if (window.opener) {
            console.log('Notifying opener window...');
            try {
              window.opener.postMessage({ type: 'SUPABASE_AUTH_SUCCESS' }, window.location.origin);
              console.log('Message sent successfully');
            } catch (postMsgErr) {
              console.error('Failed to postMessage to opener:', postMsgErr);
              // Fallback if postMessage fails
              router.push('/dashboard');
              return;
            }
            
            setTimeout(() => {
              console.log('Closing popup...');
              window.close();
            }, 1000);
          } else {
            console.log('No opener found, navigating to dashboard...');
            router.push('/dashboard');
          }
        }
      } catch (err: any) {
        console.error('Error during auth callback:', err);
        toast.error(err.message || 'Authentication failed');
        setTimeout(() => router.push('/'), 2000);
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-muted-foreground font-medium">Completing authentication...</p>
    </div>
  );
}
