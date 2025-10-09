// FIX: Define interfaces for data models used throughout the application.
export interface Match {
  id: string;
  torneo: string;
  nombre_equipo: string;
  categoria: string;
  fecha: string;
  rival: string;
  jornada: number;
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
  id: string | number; // Can be a temporary string ID before saving
  match_id: string;
  player_id: string;
  accion: string;
  resultado: string;
  timestamp: number; // in seconds
  created_at?: string;
}

export interface AISuggestion {
  timestamp: string; // e.g., "01:25"
  action: string;
  description: string;
}

export interface Profile {
  id: string;
  rol: 'admin' | 'auxiliar';
  username?: string;
  avatar_url?: string;
}
