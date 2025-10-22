/**
 * videosService.ts
 * Helpers para gestionar registros de videos en la tabla `videos`.
 *
 * Notas:
 * - Importa el cliente `supabase` desde el mismo directorio.
 * - Usa la util `mmssToSeconds` para convertir MM:SS a segundos.
 * - Define un tipo local `Video` para no modificar otros archivos.
 */

import { supabase } from './supabaseClient';
import { mmssToSeconds } from '../utils/time';

export interface Video {
  id: string;
  match_id: string;
  video_file: string;
  start_offset_seconds: number;
  duration_seconds?: number | null;
  storage_path?: string | null;
  created_by?: string | null;
  created_at?: string | null;
}

/**
 * Devuelve la lista de videos asociados a un partido.
 */
export async function fetchVideosForMatch(matchId: string): Promise<Video[]> {
  const { data, error } = await supabase
    .from<Video>('videos')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Crea un registro de video para un partido.
 * - videoFileName: nombre/identificador del archivo (no hace upload de fichero aquí).
 * - offsetMmss: formato esperado MM:SS o HH:MM:SS o SS.
 */
export async function createVideoForMatch(matchId: string, videoFileName: string, offsetMmss: string, createdBy?: string | null): Promise<Video> {
  const start_offset_seconds = mmssToSeconds(offsetMmss || '0');

  const payload = {
    match_id: matchId,
    video_file: videoFileName,
    start_offset_seconds,
    created_by: createdBy || null
  };

  const { data, error } = await supabase
    .from<Video>('videos')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data as Video;
}

/**
 * Obtiene un video por su id (si existe).
 */
export async function getVideoById(videoId: string): Promise<Video | null> {
  const { data, error } = await supabase
    .from<Video>('videos')
    .select('*')
    .eq('id', videoId)
    .single();

  if (error) {
    // Si no existe, PostgREST devuelve error; devolvemos null en ese caso.
    // No todos los errores deben silenciarse: relanzamos otros errores inesperados.
    const code = (error as any)?.code || (error as any)?.status;
    if (code === 404 || code === 'PGRST116') return null;
    throw error;
  }
  return data || null;
}
