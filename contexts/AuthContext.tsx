
import React, { createContext, useState, useEffect, useContext } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import type { Profile, AuthContextType } from '../types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    const handleAuthChange = async (session: Session | null) => {
      try {
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        let userProfile: Profile | null = null;
        if (currentUser) {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

          if (error) {
            console.error('Error fetching user profile:', error.message);
          } else {
            userProfile = data;
          }
        }
        setProfile(userProfile);
      } catch (error) {
        console.error("An unexpected error occurred during auth state change:", error);
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    // Handle initial session load
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthChange(session);
    });
    
    // Listen for subsequent auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleAuthChange(session);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = (email: string, pass: string) => supabase.auth.signInWithPassword({ email, password: pass });
  const logout = () => supabase.auth.signOut();

  const value = {
    user,
    profile,
    loading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
