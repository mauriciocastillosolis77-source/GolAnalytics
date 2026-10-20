import { supabase } from './supabaseClient';
import { calcularDetalleMinutosPartido } from './minutosService';
import type { Match, Tag } from '../types';
import type { PartidoJugador, Participacion } from '../utils/scouting';

// ─────────────────────────────────────────────────────────────────────────────
// Scouting: números del jugador por partido.
//  · Jugador de mi equipo → se calculan del etiquetado. Lo único manual son
//    las tarjetas, que se guardan en `scouting_partidos` ligadas al partido.
//  · Jugador de otro equipo → cada partido es una fila manual de `scouting_partidos`.
// ─────────────────────────────────────────────────────────────────────────────

interface FilaPartido {
  id: string;
  scouting_player_id: string;
  match_id: string | null;
  fecha: string | null;
  torneo: string | null;
  jornada: number | null;
  rival: string | null;
  estatus: string | null;
  minutos: number | null;
  goles: number | null;
  asistencias: number | null;
  amarillas: number | null;
  rojas: number | null;
}

function traducirError(error: any, accion: string): Error {
  const msg = String(error?.message || error || '');
  if (/scouting_partidos/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)) {
    return new Error('Falta crear la tabla de números de Scouting en Supabase. Corre el SQL de esta entrega y vuelve a intentar.');
  }
  return new Error(`No se pudo ${accion}. ${msg}`);
}

const n = (v: any) => (typeof v === 'number' && isFinite(v) ? v : 0);
const ordenar = (filas: PartidoJugador[]) =>
  filas.sort((a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999') || (a.jornada ?? 999) - (b.jornada ?? 999));

async function fetchFilas(scoutingPlayerId: string): Promise<FilaPartido[]> {
  const { data, error } = await supabase.from('scouting_partidos').select('*').eq('scouting_player_id', scoutingPlayerId);
  if (error) throw traducirError(error, 'cargar los números');
  return (data || []) as FilaPartido[];
}

/** Todos los partidos del jugador, ya con sus números. `playerId` = su id en `players` si es de mi equipo. */
export async function fetchNumerosJugador(scoutingPlayerId: string, playerId: string | null): Promise<PartidoJugador[]> {
  const filas = await fetchFilas(scoutingPlayerId);

  if (!playerId) {
    return ordenar(filas.filter((f) => !f.match_id).map((f) => {
      const participacion = (['titular', 'suplente', 'no_jugo'].includes(f.estatus || '') ? f.estatus : null) as Participacion | null;
      return {
        key: `m-${f.id}`, origen: 'manual' as const, id: f.id, match_id: null,
        fecha: f.fecha, torneo: f.torneo || '', jornada: f.jornada, rival: f.rival || '',
        participacion, jugo: participacion === 'titular' || participacion === 'suplente' || (participacion === null && n(f.minutos) > 0),
        minutos: n(f.minutos), goles: n(f.goles), asistencias: n(f.asistencias), amarillas: n(f.amarillas), rojas: n(f.rojas),
      };
    }));
  }

  // Jugador de mi equipo: sus partidos son los de su equipo.
  const { data: jugador } = await supabase.from('players').select('id, team_id').eq('id', playerId).single();
  const teamId = (jugador as any)?.team_id;
  if (!teamId) return [];
  const { data: partidos, error: errPartidos } = await supabase.from('matches').select('*').eq('team_id', teamId);
  if (errPartidos) throw traducirError(errPartidos, 'cargar los partidos del equipo');
  const matches = (partidos || []) as Match[];
  if (matches.length === 0) return [];
  const ids = matches.map((m) => m.id);

  const [detalles, golesRes] = await Promise.all([
    Promise.all(ids.map((id) => calcularDetalleMinutosPartido(id).catch(() => null))),
    supabase.from('tags').select('id, match_id, player_id, accion, detalle').in('match_id', ids).eq('accion', 'Goles a favor'),
  ]);
  if (golesRes.error) throw traducirError(golesRes.error, 'cargar los goles');
  const goles = (golesRes.data || []) as Tag[];
  const tarjetas = new Map<string, FilaPartido>(filas.filter((f) => f.match_id).map((f) => [f.match_id as string, f]));

  const out: PartidoJugador[] = [];
  matches.forEach((m, i) => {
    const det = detalles[i]?.jugadores[playerId];
    const golesPartido = goles.filter((t) => t.match_id === m.id);
    const anotados = golesPartido.filter((t) => t.player_id === playerId).length;
    const asistidos = golesPartido.filter((t) => (t.detalle as any)?.asistencia === playerId).length;
    const tj = tarjetas.get(m.id);
    // Solo aparecen los partidos en los que el jugador tiene algo: alineación, gol, asistencia o tarjeta.
    if (!det && anotados === 0 && asistidos === 0 && !tj) return;
    let participacion: Participacion | null = null;
    if (det) participacion = det.estatus === 'suplente' ? (det.jugo ? 'suplente' : 'no_jugo') : (det.estatus as Participacion);
    out.push({
      key: `p-${m.id}`, origen: 'etiquetado', id: tj?.id, match_id: m.id,
      fecha: m.fecha ? String(m.fecha).slice(0, 10) : null, torneo: m.torneo || '', jornada: m.jornada ?? null, rival: m.rival || '',
      participacion, jugo: det ? det.jugo : (anotados + asistidos > 0),
      minutos: det?.minutos || 0, goles: anotados, asistencias: asistidos, amarillas: n(tj?.amarillas), rojas: n(tj?.rojas),
    });
  });
  return ordenar(out);
}

export interface PartidoManual {
  id?: string;
  fecha: string | null;
  torneo: string | null;
  jornada: number | null;
  rival: string | null;
  estatus: Participacion;
  minutos: number;
  goles: number;
  asistencias: number;
  amarillas: number;
  rojas: number;
}

/** Crea o actualiza un partido capturado a mano (jugadores de otros equipos). */
export async function guardarPartidoManual(scoutingPlayerId: string, p: PartidoManual): Promise<void> {
  const { id, ...campos } = p;
  const fila = { ...campos, scouting_player_id: scoutingPlayerId, match_id: null, updated_at: new Date().toISOString() };
  const res = id
    ? await supabase.from('scouting_partidos').update(fila).eq('id', id).select('id')
    : await supabase.from('scouting_partidos').insert(fila).select('id');
  if (res.error) throw traducirError(res.error, 'guardar el partido');
  if (!res.data || res.data.length === 0) throw new Error('Supabase no guardó el partido (revisa los permisos de la tabla).');
}

export async function eliminarPartidoManual(id: string): Promise<void> {
  const { error } = await supabase.from('scouting_partidos').delete().eq('id', id);
  if (error) throw traducirError(error, 'eliminar el partido');
}

/** Tarjetas de un jugador de mi equipo en un partido etiquetado (lo único que se escribe a mano). */
export async function guardarTarjetas(scoutingPlayerId: string, matchId: string, amarillas: number, rojas: number): Promise<void> {
  const { data: existentes, error: errSel } = await supabase.from('scouting_partidos').select('id').eq('scouting_player_id', scoutingPlayerId).eq('match_id', matchId);
  if (errSel) throw traducirError(errSel, 'guardar las tarjetas');
  const actual = (existentes || [])[0] as { id: string } | undefined;
  const res = actual
    ? await supabase.from('scouting_partidos').update({ amarillas, rojas, updated_at: new Date().toISOString() }).eq('id', actual.id).select('id')
    : await supabase.from('scouting_partidos').insert({ scouting_player_id: scoutingPlayerId, match_id: matchId, amarillas, rojas }).select('id');
  if (res.error) throw traducirError(res.error, 'guardar las tarjetas');
  if (!res.data || res.data.length === 0) throw new Error('Supabase no guardó las tarjetas (revisa los permisos de la tabla).');
}
