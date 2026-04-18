"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  plan: 'free' | 'pro' | 'enterprise';
  creditsRemaining: number;
  onboardingDone: boolean;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAuthReady: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const isFetchingRef = React.useRef(false);
  const profileCreatedRef = React.useRef(false);

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('Firebase Auth state changed:', currentUser?.email);
      
      setUser(currentUser);
      if (currentUser) {
        // Fetch ID token for backend authentication
        const idToken = await currentUser.getIdToken();
        fetchProfile(currentUser.uid, idToken);
      } else {
        setProfile(null);
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, idToken: string) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
    console.log('Fetching profile for user via Backend:', userId);
    
    try {
      const response = await fetch(`${backendUrl}/api/users/me/`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      const result = await response.json();

      if (result.success && result.profile) {
        const data = result.profile;
        setProfile({
          id: data.id,
          email: data.email,
          fullName: data.full_name,
          avatarUrl: data.avatar_url,
          plan: data.plan,
          creditsRemaining: data.credits_remaining,
          onboardingDone: data.onboarding_done,
          createdAt: data.created_at,
        });
      } else {
        // Profile doesn't exist, create it via Backend
        console.log('Profile not found, creating new profile via Backend...');
        const upsertResponse = await fetch(`${backendUrl}/api/users/me/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: auth.currentUser?.email,
            full_name: auth.currentUser?.displayName || '',
            avatar_url: auth.currentUser?.photoURL || '',
          })
        });
        const upsertResult = await upsertResponse.json();
        
        if (upsertResult.success) {
          // Fetch again to update state
          isFetchingRef.current = false;
          return fetchProfile(userId, idToken);
        }
      }
    } catch (err) {
      console.error('Error in fetchProfile:', err);
    } finally {
      setLoading(false);
      setIsAuthReady(true);
      isFetchingRef.current = false;
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};
