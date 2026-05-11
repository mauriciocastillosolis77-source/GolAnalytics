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

// ─── Análisis Táctico ────────────────────────────────────────────────────────

export type AnnotationType =
  | 'arrow'           // Flecha recta — dirección de jugador o balón
  | 'arrow_curved'    // Flecha curva — trayectoria arqueada
  | 'arrow_player'    // Línea punteada + punta — movimiento de jugador sin balón
  | 'line'            // Línea recta sin punta — distancias, referencias
  | 'line_dashed'     // Línea punteada — líneas de fuera de juego, referencias
  | 'zone_rect'       // Rectángulo semitransparente — zona de presión, carril
  | 'zone_ellipse'    // Elipse semitransparente — área de cobertura, radio de acción
  | 'spotlight'       // Círculo de foco — resalta un jugador oscureciendo el resto
  | 'player_circle'   // Círculo con número/letra — marca a un jugador específico
  | 'text';           // Caja de texto — etiqueta táctica

export interface TacticalAnnotation {
  id: string;
  type: AnnotationType;

  // Coordenadas normalizadas (0–1) relativas al tamaño del frame capturado.
  // Se reconstruyen sobre cualquier tamaño de canvas multiplicando por width/height.
  x1: number;
  y1: number;
  x2?: number;  // Extremo final — arrow, line, zone_rect, zone_ellipse
  y2?: number;

  color: string;
  strokeWidth?: number;

  // ── Campos específicos por tipo ──────────────────────────────────────────

  // arrow_curved: punto de control de la curva Bézier (normalizado 0–1)
  curvature?: number;   // Desplazamiento perpendicular al eje x1y1→x2y2 (-1 a 1)

  // zone_rect / zone_ellipse / spotlight: relleno semitransparente
  opacity?: number;     // 0–1, default 0.25 para zonas, 0.6 para spotlight
  filled?: boolean;     // true = relleno + borde, false = solo borde

  // player_circle: número o letra dentro del círculo
  label?: string;       // Ej. "6", "A", "GK"

  // text: contenido de la etiqueta
  text?: string;

  // arrow_player / line_dashed: indica al renderer que use trazado punteado
  // (se infiere del type, pero se puede forzar)
  dashed?: boolean;
}

export interface TacticalAnalysis {
  id: string;
  match_id: string;
  team_id: string;
  video_id: string;             // FK a tabla videos — identifica el archivo exacto
  timestamp_video: number;      // Segundos dentro del archivo de video (no absoluto)
  annotations: TacticalAnnotation[];
  description?: string;
  created_by: string;
  created_at: string;
  clip_storage_path?: string | null;  // Path en bucket tactical-clips — null si no se subió
}

export interface TacticalAnalysisInsert {
  match_id: string;
  team_id: string;
  video_id: string;             // Requerido — sin esto no sabemos a qué video pertenece
  timestamp_video: number;
  annotations: TacticalAnnotation[];
  description?: string;
  created_by: string;
  clip_storage_path?: string | null;
}



