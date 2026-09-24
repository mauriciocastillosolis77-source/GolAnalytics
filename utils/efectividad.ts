import type { Tag, Player } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Reglas de efectividad de GolAnalytics (un solo lugar para toda la plataforma).
// Las usan: DashboardPage, RendimientoPage y geminiTeamAnalysisService.
//
// Efectividad = acciones verdes / (acciones verdes + acciones rojas) × 100
//
// VERDE: toda acción con resultado 'logrado', Transición ofensiva lograda,
//        Recuperación de balón, Tiros a portería, Goles a favor, Atajadas.
// ROJO:  toda acción con resultado 'fallado', Transición ofensiva no lograda,
//        Pérdida de balón (de un jugador real).
// NO CUENTAN en efectividad:
//   - Goles recibidos (se muestran solo como número).
//   - Cualquier acción del jugador ficticio "Perdida" (se usa solo para medir
//     tiempos de recuperación; no es una acción de nuestro equipo).
//
// Estas reglas NO cambian lo guardado en la base de datos, solo cómo se cuenta.
// ─────────────────────────────────────────────────────────────────────────────

export const ACCIONES_SIEMPRE_LOGRADA = new Set<string>([
    'Transición ofensiva lograda',
    'Recuperación de balón',
    'Tiros a portería',
    'Goles a favor',
    'Atajadas',
]);

export const ACCIONES_SIEMPRE_FALLADA = new Set<string>([
    'Transición ofensiva no lograda',
    'Pérdida de balón',
]);

export const ACCIONES_FUERA_DE_EFECTIVIDAD = new Set<string>([
    'Goles recibidos',
]);

// Quita espacios al inicio/final, pasa a minúsculas y quita acentos.
const normalizarNombre = (nombre: string | null | undefined): string =>
    (nombre || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// El jugador ficticio se llama "Perdida" (con o sin acento, mayúsculas o minúsculas).
// Coincidencia EXACTA: un jugador real cuyo nombre solo contenga esas letras no se excluye.
export const esJugadorFicticio = (nombre: string | null | undefined): boolean =>
    normalizarNombre(nombre) === 'perdida';

// Ids de los jugadores ficticios dentro de una lista de jugadores.
export const obtenerIdsJugadoresFicticios = (players: Player[]): Set<string> =>
    new Set(players.filter(p => esJugadorFicticio(p.nombre)).map(p => p.id));

// ¿La acción es de un jugador ficticio?
export const esTagDeJugadorFicticio = (tag: Tag, idsFicticios: Set<string>): boolean =>
    idsFicticios.has(tag.player_id);

// ¿La acción entra en el cálculo de efectividad?
export const cuentaEnEfectividad = (tag: Tag, idsFicticios: Set<string>): boolean => {
    if (esTagDeJugadorFicticio(tag, idsFicticios)) return false;
    if (ACCIONES_FUERA_DE_EFECTIVIDAD.has(tag.accion)) return false;
    return true;
};

// ¿La acción cuenta como verde? (usar solo sobre acciones que cuentan en efectividad)
export const esAccionLograda = (tag: Tag): boolean => {
    if (ACCIONES_SIEMPRE_LOGRADA.has(tag.accion)) return true;
    if (ACCIONES_SIEMPRE_FALLADA.has(tag.accion)) return false;
    return tag.resultado === 'logrado';
};

// Porcentaje de atajadas = atajadas / (atajadas + goles recibidos) × 100.
// Devuelve null si no hubo tiros del rival a portería (para mostrar "—").
export const calcularPorcentajeAtajadas = (atajadas: number, golesRecibidos: number): number | null => {
    const tirosRecibidos = atajadas + golesRecibidos;
    return tirosRecibidos > 0 ? (atajadas / tirosRecibidos) * 100 : null;
};
