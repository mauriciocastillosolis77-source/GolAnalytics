import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import type { Profile, AuthContextType } from '../types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      // 1. Get initial session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error("Error getting session:", sessionError);
        setLoading(false);
        return;
      }
      
      setSession(session);
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      // 2. If user exists, get their profile
      if (currentUser) {
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
          if (profileError) {
            console.error("Error fetching initial profile:", profileError);
            setProfile(null);
          } else {
            setProfile(profileData || null);
          }
        } catch (error) {
           console.error("Error fetching initial profile:", error);
           setProfile(null);
        }
      }
      
      // 3. We are done loading initial data
      setLoading(false);
    };

    initializeAuth();

    // 4. Listen for future auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      // CRITICAL FIX: Only show spinner for actual sign-in/sign-out events
      // Ignore TOKEN_REFRESHED and other background events to prevent freezing when window loses focus
      console.log('[AuthContext] Auth event:', event, 'Session exists:', !!newSession);
      
      // Only process significant auth events, ignore token refreshes
      const shouldProcessEvent = event === 'SIGNED_IN' || event === 'SIGNED_OUT';
      
      if (!shouldProcessEvent) {
        // Update session silently without showing spinner
        setSession(newSession);
        setUser(newSession?.user ?? null);
        console.log('[AuthContext] Ignoring event:', event);
        return;
      }

      // Only show loading spinner for actual sign-in/sign-out
      console.log('[AuthContext] Processing significant event:', event);
      setLoading(true);
      setSession(newSession);
      const newCurrentUser = newSession?.user ?? null;
      setUser(newCurrentUser);

      if (newCurrentUser) {
        try {
          // Add timeout protection for profile fetch
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
          );
          
          const profilePromise = supabase
            .from('profiles')
            .select('*')
            .eq('id', newCurrentUser.id)
            .single();

          const { data: profileData } = await Promise.race([profilePromise, timeoutPromise]) as any;
          setProfile(profileData || null);
        } catch (error) {
          console.error('[AuthContext] Error fetching profile after auth event:', error);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
      console.log('[AuthContext] Event processing complete');
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: AuthError | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string): Promise<{ error: AuthError | null }> => {
    // Note: The profile is created automatically by the Supabase trigger.
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    loading,
    signIn,
    signUp,
    logout,
  };
  
  // The Provider *always* renders its children. 
  // The loading state is passed down for components to decide what to show.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
