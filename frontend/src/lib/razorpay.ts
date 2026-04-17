import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function useRazorpay() {
  const { user, profile } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  const initiatePayment = async (amount: number, planName: string) => {
    if (!user) {
      toast.error('Please login to continue');
      return;
    }

    setIsProcessing(true);

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, 
      amount: amount * 100, 
      currency: "INR",
      name: "ResuMatch AI",
      description: `Upgrade to ${planName}`,
      image: "https://picsum.photos/seed/resumatch/200",
      handler: async function (response: any) {
        try {
          const { error } = await supabase
            .from('users')
            .update({
              plan: 'pro',
              credits_remaining: 999999, // Effectively unlimited
            })
            .eq('id', user.uid);

          if (error) throw error;

          // Also log the payment
          await supabase.from('audit_logs').insert({
            user_id: user.uid,
            action: 'payment_success',
            details: {
              payment_id: response.razorpay_payment_id,
              plan: 'pro',
              amount
            }
          });

          toast.success('Welcome to Pro! Your account has been upgraded.');
          window.location.reload();
        } catch (error) {
          console.error('Failed to update plan', error);
          toast.error('Payment successful but failed to update account. Please contact support.');
        }
      },
      prefill: {
        name: profile?.fullName || "",
        email: user.email || "",
      },
      theme: {
        color: "#185FA5",
      },
    };

    const rzp1 = new window.Razorpay(options);
    rzp1.on('payment.failed', function (response: any) {
      toast.error(response.error.description);
    });
    rzp1.open();
    setIsProcessing(false);
  };

  return { initiatePayment, isProcessing };
}
