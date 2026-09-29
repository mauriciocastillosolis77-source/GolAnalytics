import { supabase } from './supabaseClient';
import { fetchVideosForMatch } from './videosService';
import { ACCION_CAMBIO, detalleCambioDe } from '../utils/cambios';
import type { Tag, EstatusPartido } from '../types';

/**
 * Minutos jugados por jugador en UN partido — calculado, no capturado a mano.
 *
 * Regla (sin dobles cambios, confirmado con el usuario):
 *  - Titular sin tag de Cambio → jugó el partido completo (0 → fin).
 *  - Titular que aparece como "sale" en un Cambio → 0 → ese minuto.
 *  - Suplente que aparece como "entra" en un Cambio → ese minuto → fin.
 *  - Suplente sin ningún Cambio → nunca entró → 0 minutos.
 *  - No convocado / Lesionado / Falta → 0 minutos, no se calcula nada.
 *
 * "Fin del partido" = el punto más lejano cubierto por los videos del
 * partido (start_offset_seconds + duration_seconds del último video) — ya
 * incluye el tiempo agregado porque es la duración real de lo grabado.
 */
export async function calcularMinutosPartido(matchId: string): Promise<Record<string, number>> {
  const [estatusRes, tagsRes, videos] = await Promise.all([
    supabase.from('player_match_status').select('*').eq('match_id', matchId),
    supabase.from('tags').select('*').eq('match_id', matchId).eq('accion', ACCION_CAMBIO),
    fetchVideosForMatch(matchId),
  ]);
  if (estatusRes.error) throw estatusRes.error;
  if (tagsRes.error) throw tagsRes.error;

  const finPartido = videos.reduce((max, v) => {
    const fin = (v.start_offset_seconds || 0) + (v.duration_seconds || 0);
    return Math.max(max, fin);
  }, 0);

  const estatusRows = (estatusRes.data || []) as Array<{ player_id: string; estatus: EstatusPartido }>;
  const cambios = (tagsRes.data || []) as Tag[];

  const minutosPorJugador: Record<string, number> = {};

  estatusRows.forEach((row) => {
    if (row.estatus === 'no_convocado' || row.estatus === 'lesionado' || row.estatus === 'falta') {
      minutosPorJugador[row.player_id] = 0;
      return;
    }

    const entra = cambios.find((t) => t.player_id === row.player_id);
    const sale = cambios.find((t) => detalleCambioDe(t).sale === row.player_id);

    let segundos = 0;
    if (row.estatus === 'titular') {
      const finJugador = sale ? (sale.timestamp_absolute ?? sale.timestamp) : finPartido;
      segundos = Math.max(0, finJugador - 0);
    } else if (row.estatus === 'suplente') {
      if (entra) {
        const inicioJugador = entra.timestamp_absolute ?? entra.timestamp;
        segundos = Math.max(0, finPartido - inicioJugador);
      } else {
        segundos = 0; // suplente que nunca entró
      }
    }
    minutosPorJugador[row.player_id] = Math.round(segundos / 60);
  });

  return minutosPorJugador;
}

/**
 * Igual que arriba pero para VARIOS partidos a la vez (Rendimiento) — regresa
 * un mapa acumulado por jugador, sumando los minutos de todos los partidos.
 */
export async function calcularMinutosPorPartidos(matchIds: string[]): Promise<Record<string, number>> {
  const resultados = await Promise.all(matchIds.map((id) => calcularMinutosPartido(id).catch((err) => {
    console.error(`No se pudo calcular minutos del partido ${id}:`, err);
    return {} as Record<string, number>;
  })));
  const total: Record<string, number> = {};
  resultados.forEach((mapa) => {
    Object.entries(mapa).forEach(([playerId, min]) => {
      total[playerId] = (total[playerId] || 0) + min;
    });
  });
  return total;
}
