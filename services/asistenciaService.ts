import { supabase } from './supabaseClient';
import type { PlayerMatchStatus, EstatusPartido } from '../types';

// Alineación de UN partido — quién fue titular/suplente/no convocado/
// lesionado/falta. Los minutos ya NO se guardan aquí: se calculan solos en
// services/minutosService.ts a partir de las etiquetas de Cambio.
export async function fetchEstatusPartido(matchId: string): Promise<PlayerMatchStatus[]> {
  const { data, error } = await supabase.from('player_match_status').select('*').eq('match_id', matchId);
  if (error) throw error;
  return (data || []) as PlayerMatchStatus[];
}

export async function guardarEstatusPartido(
  matchId: string,
  filas: Array<{ player_id: string; estatus: EstatusPartido }>
): Promise<number> {
  if (filas.length === 0) return 0;
  const rows = filas.map((f) => ({ match_id: matchId, player_id: f.player_id, estatus: f.estatus }));
  const { error } = await supabase.from('player_match_status').upsert(rows, { onConflict: 'match_id,player_id' });
  if (error) throw error;
  return rows.length;
}

// Para Rendimiento: alineación de VARIOS partidos a la vez, para contar
// ausencias (lesión/no convocado/falta) por jugador o por equipo.
export async function fetchEstatusPorPartidos(matchIds: string[]): Promise<PlayerMatchStatus[]> {
  if (matchIds.length === 0) return [];
  const { data, error } = await supabase.from('player_match_status').select('*').in('match_id', matchIds);
  if (error) throw error;
  return (data || []) as PlayerMatchStatus[];
}
