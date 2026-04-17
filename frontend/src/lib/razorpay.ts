import React, { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { auth } from '@/lib/firebase';
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
          const idToken = await auth.currentUser?.getIdToken();
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
          
          const patchRes = await fetch(`${backendUrl}/api/users/me/plan`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              plan: 'pro',
              credits: 999999
            })
          });

          if (!patchRes.ok) throw new Error('Backend failed to update plan');

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
