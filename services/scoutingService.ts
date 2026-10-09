import { supabase } from './supabaseClient';
import type { Player } from '../types';
import type { ScoutingPlayer } from '../utils/scouting';

// ─────────────────────────────────────────────────────────────────────────────
// Scouting: lectura y guardado de fichas (tabla `scouting_players`).
// Solo el admin puede leer y escribir (Supabase lo refuerza con RLS).
// ─────────────────────────────────────────────────────────────────────────────

/** Mensaje claro cuando falta correr el SQL de esta entrega. */
function traducirError(error: any, accion: string): Error {
  const msg = String(error?.message || error || '');
  if (/scouting_players/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)) {
    return new Error('Falta crear la tabla de Scouting en Supabase. Corre el SQL de esta entrega y vuelve a intentar.');
  }
  return new Error(`No se pudo ${accion}. ${msg}`);
}

// Para la lista no se trae la foto: así carga rápido aunque haya muchas fichas.
const COLUMNAS_LISTA = 'id, player_id, nombre, equipo, competicion, puesto, dorsal, tipo_jugador, valoracion, cualidades, updated_at';
export type ScoutingPlayerLista = Pick<ScoutingPlayer, 'id' | 'player_id' | 'nombre' | 'equipo' | 'competicion' | 'puesto' | 'dorsal' | 'tipo_jugador' | 'valoracion' | 'cualidades' | 'updated_at'>;

export async function fetchScoutingPlayers(): Promise<ScoutingPlayerLista[]> {
  const { data, error } = await supabase.from('scouting_players').select(COLUMNAS_LISTA).order('nombre', { ascending: true });
  if (error) throw traducirError(error, 'cargar las fichas');
  return (data || []) as unknown as ScoutingPlayerLista[];
}

export async function fetchScoutingPlayer(id: string): Promise<ScoutingPlayer> {
  const { data, error } = await supabase.from('scouting_players').select('*').eq('id', id).single();
  if (error || !data) throw traducirError(error, 'abrir la ficha');
  return { ...(data as ScoutingPlayer), cualidades: (data as any).cualidades || {} };
}

/** Crea la ficha (sin id) o la actualiza (con id). Regresa la ficha como quedó guardada. */
export async function guardarScoutingPlayer(ficha: Omit<ScoutingPlayer, 'id'> & { id?: string }): Promise<ScoutingPlayer> {
  const { id, created_at, updated_at, ...campos } = ficha as any;
  const fila = { ...campos, nombre: String(campos.nombre || '').trim(), updated_at: new Date().toISOString() };
  if (id) {
    const { data, error } = await supabase.from('scouting_players').update(fila).eq('id', id).select().single();
    if (error || !data) throw traducirError(error || 'Supabase no regresó la ficha (revisa los permisos).', 'guardar la ficha');
    return data as ScoutingPlayer;
  }
  const { data: sesion } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('scouting_players').insert({ ...fila, created_by: sesion?.user?.id ?? null }).select().single();
  if (error || !data) throw traducirError(error || 'Supabase no regresó la ficha (revisa los permisos).', 'crear la ficha');
  return data as ScoutingPlayer;
}

export async function eliminarScoutingPlayer(id: string): Promise<void> {
  const { error } = await supabase.from('scouting_players').delete().eq('id', id);
  if (error) throw traducirError(error, 'eliminar la ficha');
}

export type JugadorEquipo = Player & { equipoNombre: string };

/** Jugadores del equipo propio (tabla `players`), con el nombre de su equipo — para ligarlos a una ficha. */
export async function fetchJugadoresEquipo(): Promise<JugadorEquipo[]> {
  const [jug, eq] = await Promise.all([
    supabase.from('players').select('*').order('numero', { ascending: true }),
    supabase.from('teams').select('id, nombre'),
  ]);
  if (jug.error) throw traducirError(jug.error, 'cargar los jugadores del equipo');
  const nombres = new Map<string, string>(((eq.data || []) as Array<{ id: string; nombre: string }>).map((t) => [t.id, t.nombre]));
  return ((jug.data || []) as Player[]).map((p) => ({ ...p, equipoNombre: (p.team_id && nombres.get(p.team_id)) || '' }));
}

/**
 * Activo / inactivo de un jugador del equipo propio. Inactivo = deja de salir
 * en la lista del Etiquetador; su historial (Tablero, Rendimiento, reportes) se conserva.
 */
export async function setJugadorActivo(playerId: string, activo: boolean): Promise<void> {
  const { data, error } = await supabase.from('players').update({ activo }).eq('id', playerId).select('id');
  if (error) {
    if (/activo/.test(String(error.message))) throw new Error('Falta la columna "activo" en Supabase. Corre el SQL de esta entrega y vuelve a intentar.');
    throw new Error(`No se pudo cambiar el estado del jugador. ${error.message}`);
  }
  // Con RLS, un update sin permiso no marca error: simplemente no cambia nada.
  if (!data || data.length === 0) throw new Error('Supabase no permitió el cambio (falta el permiso de actualizar jugadores). Corre el SQL de esta entrega.');
}
