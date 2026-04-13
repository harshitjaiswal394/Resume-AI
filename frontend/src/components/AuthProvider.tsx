"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

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
    // Initial session check
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Initial session check error:', error);
        // If it's a refresh token error, sign out to clear locale storage
        if (error.message.includes('refresh_token')) {
          supabase.auth.signOut();
        }
        setLoading(false);
        setIsAuthReady(true);
        return;
      }
      
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
        setIsAuthReady(true);
      }
    }).catch(err => {
      console.error('Unhandled getSession error:', err);
      setLoading(false);
      setIsAuthReady(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event);
      
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);
        setIsAuthReady(true);
        return;
      }

      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id);
      } else {
        setProfile(null);
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    console.log('Fetching profile for user:', userId);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist, create it if we haven't already in this session
          if (profileCreatedRef.current) {
             isFetchingRef.current = false;
             return;
          }
          
          console.log('Profile not found, creating new profile...');
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            const { data: createdProfile, error: insertError } = await supabase
              .from('users')
              .insert({
                id: authUser.id,
                email: authUser.email!,
                full_name: authUser.user_metadata.full_name || authUser.user_metadata.name || '',
                avatar_url: authUser.user_metadata.avatar_url || authUser.user_metadata.picture || '',
                plan: 'free',
                credits_remaining: 3,
                onboarding_done: false,
              })
              .select()
              .single();
            
            if (insertError) {
              // If it's a duplicate key error, someone else (another tab/render) already created it
              if (insertError.code === '23505') {
                 console.log('Profile was created by another process, fetching again...');
                 isFetchingRef.current = false;
                 return fetchProfile(userId);
              }
              throw insertError;
            }

            if (createdProfile) {
              console.log('Profile created successfully');
              profileCreatedRef.current = true;
              setProfile({
                id: createdProfile.id,
                email: createdProfile.email,
                fullName: createdProfile.full_name,
                avatarUrl: createdProfile.avatar_url,
                plan: createdProfile.plan,
                creditsRemaining: createdProfile.credits_remaining,
                onboardingDone: createdProfile.onboarding_done,
                createdAt: createdProfile.created_at,
              });
            }
          }
        } else {
          throw error;
        }
      } else if (data) {
        console.log('Profile fetched successfully');
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
