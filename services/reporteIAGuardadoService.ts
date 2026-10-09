import { supabase } from './supabaseClient';
import type { TeamAnalysis } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Texto que escribe la IA para el Análisis Ejecutivo Post Partido, guardado
// por partido (tabla `match_report_ai`, una fila por partido).
//
// Para qué: generar el reporte hace 2 consultas a Gemini. Si el texto ya está
// guardado y el etiquetado no cambió, se reutiliza y no se consulta nada —
// ahorra cuota y permite sacar el reporte aunque Gemini esté caído.
//
// Si la tabla todavía no existe (no se ha corrido el SQL), todo esto falla en
// silencio: el reporte se genera igual que antes, solo que sin guardar.
// ─────────────────────────────────────────────────────────────────────────────

export interface TextoIAReporte {
  match_id: string;
  analysis: TeamAnalysis;
  lectura: string;
  tags_count: number;      // jugadas que tenía el partido cuando se escribió
  modelo: string | null;   // modelo de Gemini que lo escribió
  updated_at: string;
}

function esAnalisisValido(a: any): a is TeamAnalysis {
  return !!a
    && Array.isArray(a.fortalezasColectivas)
    && Array.isArray(a.areasDeMejoraColectivas)
    && Array.isArray(a.jugadoresDestacados)
    && Array.isArray(a.recomendacionesEntrenamiento);
}

export async function leerTextoIAReporte(matchId: string): Promise<TextoIAReporte | null> {
  try {
    const { data, error } = await supabase.from('match_report_ai').select('*').eq('match_id', matchId).maybeSingle();
    if (error || !data) {
      if (error) console.warn('No se pudo leer el texto de IA guardado (¿ya se corrió el SQL de match_report_ai?):', error.message);
      return null;
    }
    const row = data as TextoIAReporte;
    if (!esAnalisisValido(row.analysis) || !row.lectura) return null;
    return row;
  } catch (err) {
    console.warn('No se pudo leer el texto de IA guardado:', err);
    return null;
  }
}

export async function guardarTextoIAReporte(row: Omit<TextoIAReporte, 'updated_at'>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('match_report_ai')
      .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'match_id' });
    if (error) {
      console.warn('El reporte se generó, pero no se pudo guardar el texto de IA (¿ya se corrió el SQL de match_report_ai?):', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('El reporte se generó, pero no se pudo guardar el texto de IA:', err);
    return false;
  }
}

/** Cuántas jugadas tiene hoy el partido — para saber si el texto guardado sigue vigente. */
export async function contarJugadasPartido(matchId: string): Promise<number | null> {
  try {
    const { count, error } = await supabase.from('tags').select('id', { count: 'exact', head: true }).eq('match_id', matchId);
    if (error) return null;
    return count ?? null;
  } catch {
    return null;
  }
}
