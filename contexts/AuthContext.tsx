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
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const initializeAuth = async () => {
      setLoading(true);
      setAuthError(null);

      timeout = setTimeout(() => {
        setLoading(false);
        setAuthError('No se pudo recuperar la sesión. Recarga la página o inicia sesión nuevamente.');
      }, 6000);

      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setLoading(false);
          setAuthError('Error al obtener la sesión. Por favor, recarga la página o inicia sesión nuevamente.');
          clearTimeout(timeout);
          return;
        }

        setSession(session);
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          try {
            const { data: profileData, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', currentUser.id)
              .single();
            if (profileError) throw profileError;
            setProfile(profileData || null);
          } catch (error) {
            setAuthError('No se pudo obtener el perfil de usuario. Intenta recargar o iniciar sesión nuevamente.');
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            setProfile(null);
          }
        } else {
          setProfile(null);
        }
        setLoading(false);
        clearTimeout(timeout);
      } catch (error: any) {
        setLoading(false);
        setAuthError('Error inesperado en la autenticación. Intenta recargar o iniciar sesión nuevamente.');
        clearTimeout(timeout);
      }
    };

    initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setLoading(true);
      setAuthError(null);

      timeout = setTimeout(() => {
        setLoading(false);
        setAuthError('No se pudo recuperar la sesión. Recarga la página o inicia sesión nuevamente.');
      }, 6000);

      const newCurrentUser = newSession?.user ?? null;
      setSession(newSession);
      setUser(newCurrentUser);

      if (newCurrentUser) {
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', newCurrentUser.id)
            .single();
          if (profileError) throw profileError;
          setProfile(profileData || null);
        } catch (error) {
          setAuthError('No se pudo obtener el perfil de usuario. Intenta recargar o iniciar sesión nuevamente.');
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
      clearTimeout(timeout);
    });

    return () => {
      authListener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setAuthError(error.message);
    return { error };
  };

  const signUp = async (email: string, password: string): Promise<{ error: AuthError | null }> => {
    setLoading(true);
    setAuthError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) setAuthError(error.message);
    return { error };
  };

  const logout = async () => {
    setLoading(true);
    setAuthError(null);
    await supabase.auth.signOut();
    setLoading(false);
  };

  const value: AuthContextType & { authError: string | null } = {
    user,
    session,
    profile,
    loading,
    signIn,
    signUp,
    logout,
    authError,
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
