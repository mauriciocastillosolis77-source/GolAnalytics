import type { Session, User, AuthError } from '@supabase/supabase-js';

export interface Match {
  id: string;
  torneo: string;
  nombre_equipo: string;
  categoria: string;
  fecha: string;
  rival: string;
  jornada: number;
  team_id?: string;
  created_at?: string;
}

export interface Player {
  id: string;
  nombre: string;
  numero: number;
  posicion: string;
  created_at?: string;
}

export interface Tag {
  id: string | number;
  match_id: string;
  player_id: string;
  accion: string;
  resultado: string;
  timestamp: number;
  // Nuevos campos añadidos para soportar videos y timestamps absolutos
  video_file?: string;
  timestamp_absolute?: number;
  created_at?: string;
}

export interface AISuggestion {
  timestamp: string;
  action: string;
  description: string;
}

export interface Profile {
  id: string;
  rol: 'admin' | 'auxiliar';
  username?: string;
  avatar_url?: string;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  logout: () => Promise<void>;
}
