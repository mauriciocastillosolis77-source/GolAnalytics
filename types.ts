import type { User } from '@supabase/supabase-js';

export enum UserRole {
  ADMIN = 'admin',
  AUXILIAR = 'auxiliar'
}

export interface Profile {
  id: string;
  rol: UserRole;
  full_name?: string; // Mejora: Añadido para mostrar el nombre del usuario.
  email?: string;     // Mejora: Añadido para referencia y gestión.
  created_at: string;
}

export interface Match {
  id: string;
  // Estructura final y consistente en español
  fecha: string;
  rival: string;
  torneo: string;
  categoria: string;
  jornada: number;
  nombre_equipo: string; // Columna para "Mi equipo"
  is_finalized: boolean;
  created_at: string;
  coach_uid: string;
}

export interface Player {
  id: string;
  nombre: string;
  numero: number;
  posicion: string;
}

export interface Tag {
  id?: string;
  match_id: string;
  player_id: string;
  timestamp: number; // in seconds
  accion: string;
  resultado: string; // 'logrado' o 'fallado'
}

export interface AISuggestion {
  timestamp: string; // e.g., "01:25"
  action: string;
  description: string;
}

export interface AuthContextType {
    user: User | null;
    profile: Profile | null;
    loading: boolean;
    login: (email: string, pass: string) => Promise<any>;
    logout: () => Promise<any>;
}