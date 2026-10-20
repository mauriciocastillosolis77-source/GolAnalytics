import { supabase } from './supabaseClient';
import { fetchVideosForMatch } from './videosService';
import { ACCION_CAMBIO, detalleCambioDe } from '../utils/cambios';
import type { Tag, EstatusPartido } from '../types';

/**
 * Minutos jugados por jugador en UN partido — calculado, no capturado a mano.
 *
 * Regla (cada jugador tiene A LO MÁS una entrada y A LO MÁS una salida —
 * sigue sin haber "dobles cambios" donde el MISMO jugador entra, sale, y
 * vuelve a entrar; eso sigue sin estar soportado):
 *  - Titular sin tag de Cambio → jugó el partido completo (0 → fin).
 *  - Titular que aparece como "sale" en un Cambio → 0 → ese minuto.
 *  - Suplente que aparece como "entra" en un Cambio → ese minuto → fin,
 *    SALVO que también aparezca como "sale" en otro Cambio (lo volvieron a
 *    cambiar) — ahí es: ese minuto de entrada → ese minuto de salida.
 *  - Suplente sin ningún Cambio → nunca entró → 0 minutos.
 *  - No convocado / Lesionado / Falta → 0 minutos, no se calcula nada.
 *
 * "Fin del partido" = el punto más lejano cubierto por los videos del
 * partido (start_offset_seconds + duration_seconds del último video) — ya
 * incluye el tiempo agregado porque es la duración real de lo grabado.
 */
export async function calcularMinutosPartido(matchId: string): Promise<Record<string, number>> {
  const detalle = await calcularDetalleMinutosPartido(matchId);
  const minutos: Record<string, number> = {};
  Object.entries(detalle.jugadores).forEach(([playerId, j]) => { minutos[playerId] = j.minutos; });
  return minutos;
}

/** Lo que pasó con cada jugador en UN partido, más la duración del partido. */
export interface DetalleMinutosPartido {
  matchId: string;
  /** Duración del partido en minutos, según los videos registrados (0 si no hay duración capturada). */
  duracionMin: number;
  /** ¿Se capturó la alineación (titular/suplente/…) de este partido? */
  tieneAlineacion: boolean;
  jugadores: Record<string, { minutos: number; estatus: EstatusPartido; /** ¿Pisó la cancha? (titular, o suplente que entró de cambio) */ jugo: boolean }>;
}

/** Misma regla de siempre para los minutos — solo que además regresa el estatus y la duración. */
export async function calcularDetalleMinutosPartido(matchId: string): Promise<DetalleMinutosPartido> {
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

  const jugadores: DetalleMinutosPartido['jugadores'] = {};

  estatusRows.forEach((row) => {
    if (row.estatus === 'no_convocado' || row.estatus === 'lesionado' || row.estatus === 'falta') {
      jugadores[row.player_id] = { minutos: 0, estatus: row.estatus, jugo: false };
      return;
    }

    const entra = cambios.find((t) => t.player_id === row.player_id);
    const sale = cambios.find((t) => detalleCambioDe(t).sale === row.player_id);

    let segundos = 0;
    let jugo = false;
    if (row.estatus === 'titular') {
      jugo = true;
      // Un titular no "entra" — si nunca sale, jugó el partido completo.
      const inicioJugador = 0;
      const finJugador = sale ? (sale.timestamp_absolute ?? sale.timestamp) : finPartido;
      segundos = Math.max(0, finJugador - inicioJugador);
    } else if (row.estatus === 'suplente') {
      if (entra) {
        jugo = true;
        const inicioJugador = entra.timestamp_absolute ?? entra.timestamp;
        // Si también lo volvieron a cambiar (sale), su tramo termina ahí —
        // no en el fin del partido.
        const finJugador = sale ? (sale.timestamp_absolute ?? sale.timestamp) : finPartido;
        segundos = Math.max(0, finJugador - inicioJugador);
      } else {
        segundos = 0; // suplente que nunca entró
      }
    }
    jugadores[row.player_id] = { minutos: Math.round(segundos / 60), estatus: row.estatus, jugo };
  });

  return { matchId, duracionMin: Math.round(finPartido / 60), tieneAlineacion: estatusRows.length > 0, jugadores };
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

/** Acumulado de un jugador sobre varios partidos (un torneo, un rango de jornadas…). */
export interface ResumenMinutosJugador {
  minutos: number;
  /** Partidos en los que pisó la cancha (de inicio o de cambio). */
  pj: number;
  /** Partidos que inició como titular. */
  titular: number;
  /** Partidos en los que entró de cambio. */
  suplente: number;
}

export interface ResumenMinutos {
  porJugador: Record<string, ResumenMinutosJugador>;
  /** Suma de la duración de los partidos considerados: el 100% contra el que se mide el "% de minutos". */
  minutosPosibles: number;
  /** Partidos con alineación capturada y duración de video registrada. */
  partidosConsiderados: number;
  /** Partidos del filtro que NO entran al cálculo (sin alineación o sin duración de video). */
  partidosSinDatos: number;
}

/**
 * Acumulado por jugador sobre VARIOS partidos — minutos, partidos jugados, de
 * titular, de suplente — y los minutos posibles del periodo. Es lo que usa la
 * tabla "Minutos y ausencias — todo el equipo" de Rendimiento y su PDF.
 */
export async function calcularResumenMinutos(matchIds: string[]): Promise<ResumenMinutos> {
  const detalles = await Promise.all(matchIds.map((id) => calcularDetalleMinutosPartido(id).catch((err) => {
    console.error(`No se pudo calcular minutos del partido ${id}:`, err);
    return null;
  })));
  const resumen: ResumenMinutos = { porJugador: {}, minutosPosibles: 0, partidosConsiderados: 0, partidosSinDatos: 0 };
  detalles.forEach((d) => {
    if (!d || !d.tieneAlineacion || d.duracionMin <= 0) { resumen.partidosSinDatos++; }
    else { resumen.partidosConsiderados++; resumen.minutosPosibles += d.duracionMin; }
    if (!d) return;
    (Object.entries(d.jugadores) as Array<[string, DetalleMinutosPartido['jugadores'][string]]>).forEach(([playerId, j]) => {
      const acc = resumen.porJugador[playerId] || (resumen.porJugador[playerId] = { minutos: 0, pj: 0, titular: 0, suplente: 0 });
      acc.minutos += j.minutos;
      if (j.jugo) {
        acc.pj++;
        if (j.estatus === 'titular') acc.titular++; else acc.suplente++;
      }
    });
  });
  return resumen;
}
