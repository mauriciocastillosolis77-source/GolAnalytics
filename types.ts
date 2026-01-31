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
  team_id?: string;
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
  team_id?: string | null;
  created_at?: string;
  // Campo para tracking de sugerencias de IA (entrenamiento de modelo)
  ai_suggested?: boolean;
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
  team_id?: string;
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

export interface AnalysisHistory {
  id: string;
  player_id: string;
  team_id?: string;
  analysis_data: {
    tendencia: 'mejorando' | 'estable' | 'bajando';
    tendenciaDescripcion: string;
    fortalezas: string[];
    areasDeMejora: string[];
    comparativoProfesional: {
      posicion: string;
      metricasReferencia: string[];
      analisis: string;
    };
    resumenGeneral: string;
  };
  filters_used?: {
    torneo?: string;
    categoria?: string;
    jornadaMin?: number;
    jornadaMax?: number;
  };
  total_acciones: number;
  efectividad_global: number;
  created_at: string;
}

export interface TeamAnalysis {
  tendencia: 'mejorando' | 'estable' | 'bajando';
  tendenciaDescripcion: string;
  fortalezasColectivas: string[];
  areasDeMejoraColectivas: string[];
  analisisPorLinea: {
    defensa: { efectividad: number; observacion: string };
    medio: { efectividad: number; observacion: string };
    ataque: { efectividad: number; observacion: string };
  };
  jugadoresDestacados: Array<{
    nombre: string;
    razon: string;
  }>;
  resumenEjecutivo: string;
  recomendacionesEntrenamiento: string[];
}

export interface TeamAnalysisHistory {
  id: string;
  team_id: string;
  team_name: string;
  analysis_data: TeamAnalysis;
  filters_used?: {
    torneo?: string;
    categoria?: string;
    jornadaMin?: number;
    jornadaMax?: number;
  };
  total_partidos: number;
  total_acciones: number;
  efectividad_global: number;
  created_at: string;
}

