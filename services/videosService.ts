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
  team_id: string;
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
 * - teamId: ID del equipo asociado al partido.
 */
export async function createVideoForMatch(matchId: string, teamId: string, videoFileName: string, offsetMmss: string, createdBy?: string | null, durationMmss?: string): Promise<Video> {
  const start_offset_seconds = mmssToSeconds(offsetMmss || '0');
  // OJO: durante mucho tiempo este payload no incluía duration_seconds, así
  // que se guardaba en null — y los minutos jugados (services/minutosService.ts)
  // usan start_offset_seconds + duration_seconds del último video para saber
  // dónde termina el partido. Sin duración, el "fin del partido" calculado
  // caía en el START del último video, no en su fin — dando minutos cortados
  // en TODOS los jugadores. Por eso ahora se pide y se guarda siempre.
  const duration_seconds = durationMmss ? mmssToSeconds(durationMmss) : null;

  const payload = {
    match_id: matchId,
    team_id: teamId,
    video_file: videoFileName,
    start_offset_seconds,
    duration_seconds,
    created_by: createdBy || null
  };

  const { data, error } = await supabase
    .from('videos')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data as Video;
}

/**
 * Corrige la duración (y opcionalmente el inicio) de un video YA registrado
 * — para los videos que se crearon antes de que este campo existiera.
 */
export async function updateVideoMeta(videoId: string, durationMmss: string, offsetMmss?: string): Promise<Video> {
  const payload: Record<string, number> = { duration_seconds: mmssToSeconds(durationMmss || '0') };
  if (offsetMmss !== undefined) payload.start_offset_seconds = mmssToSeconds(offsetMmss);

  const { data, error } = await supabase
    .from('videos')
    .update(payload)
    .eq('id', videoId)
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
