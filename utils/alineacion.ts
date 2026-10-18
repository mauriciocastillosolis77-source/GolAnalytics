// ─────────────────────────────────────────────────────────────────────────────
// Alineación sugerida contra un rival (Análisis del Rival → "Alineación sugerida").
// Se guarda dentro del análisis del rival (columna `rival_analysis.alineacion`)
// y sale en el PDF del rival y en la sección "Próximo rival" del PowerPoint.
//
// Coordenadas en % de la cancha, con nuestro equipo atacando hacia ARRIBA:
// x = 0 izquierda → 100 derecha; y = 0 portería rival → 100 nuestra portería.
// Cada casilla se puede mover a mano; la formación solo da el punto de partida.
// ─────────────────────────────────────────────────────────────────────────────

export interface PuestoAlineacion {
  clave: string;               // identifica la casilla dentro de la formación (ej. "DCI")
  x: number;
  y: number;
  player_id: string | null;
  motivo: string;
}
export interface AlineacionSugerida {
  formacion: string;           // "4-4-2", "4-3-3", …
  puestos: PuestoAlineacion[];
  nota: string;
  updated_at?: string;
}

type Base = [clave: string, x: number, y: number];

// Línea defensiva de 4 y de 5, y portero (se repiten en varias formaciones).
const POR: Base = ['POR', 50, 90];
const DEF4: Base[] = [['LI', 14, 66], ['DCI', 38, 71], ['DCD', 62, 71], ['LD', 86, 66]];
const DEF5: Base[] = [['CAI', 9, 60], ['DCI', 30, 70], ['DC', 50, 73], ['DCD', 70, 70], ['CAD', 91, 60]];
const DEF3: Base[] = [['DCI', 28, 70], ['DC', 50, 73], ['DCD', 72, 70]];

export const FORMACIONES: Record<string, Base[]> = {
  '4-4-2': [['DI', 36, 12], ['DD', 64, 12], ['MI', 14, 38], ['MCI', 38, 43], ['MCD', 62, 43], ['MD', 86, 38], ...DEF4, POR],
  '4-3-3': [['EI', 17, 15], ['DC', 50, 10], ['ED', 83, 15], ['MCI', 28, 42], ['MC', 50, 46], ['MCD', 72, 42], ...DEF4, POR],
  '4-2-3-1': [['DC', 50, 10], ['EI', 16, 28], ['MP', 50, 29], ['ED', 84, 28], ['MCI', 38, 49], ['MCD', 62, 49], ...DEF4, POR],
  '4-1-4-1': [['DC', 50, 10], ['MI', 14, 32], ['MCI', 38, 35], ['MCD', 62, 35], ['MD', 86, 32], ['MCO', 50, 52], ...DEF4, POR],
  '5-3-2': [['DI', 36, 12], ['DD', 64, 12], ['MCI', 28, 38], ['MC', 50, 43], ['MCD', 72, 38], ...DEF5, POR],
  '5-4-1': [['DC', 50, 11], ['MI', 14, 36], ['MCI', 38, 40], ['MCD', 62, 40], ['MD', 86, 36], ...DEF5, POR],
  '3-5-2': [['DI', 36, 12], ['DD', 64, 12], ['CAI', 10, 40], ['MCI', 32, 46], ['MC', 50, 38], ['MCD', 68, 46], ['CAD', 90, 40], ...DEF3, POR],
  '3-4-3': [['EI', 17, 15], ['DC', 50, 10], ['ED', 83, 15], ['CAI', 12, 42], ['MCI', 38, 46], ['MCD', 62, 46], ['CAD', 88, 42], ...DEF3, POR],
};
export const LISTA_FORMACIONES = Object.keys(FORMACIONES);

const NOMBRE_ES: Record<string, string> = {
  POR: 'Portero', LI: 'Lateral izquierdo', LD: 'Lateral derecho', DCI: 'Central izquierdo', DCD: 'Central derecho', DC: 'Central',
  CAI: 'Carrilero izquierdo', CAD: 'Carrilero derecho', MI: 'Medio izquierdo', MD: 'Medio derecho', MCI: 'Medio centro izquierdo',
  MCD: 'Medio centro derecho', MC: 'Medio centro', MCO: 'Medio centro defensivo', MP: 'Mediapunta', EI: 'Extremo izquierdo',
  ED: 'Extremo derecho', DI: 'Delantero izquierdo', DD: 'Delantero derecho',
};
const NOMBRE_EN: Record<string, string> = {
  POR: 'Goalkeeper', LI: 'Left-back', LD: 'Right-back', DCI: 'Left centre-back', DCD: 'Right centre-back', DC: 'Centre-back',
  CAI: 'Left wing-back', CAD: 'Right wing-back', MI: 'Left midfielder', MD: 'Right midfielder', MCI: 'Left central midfielder',
  MCD: 'Right central midfielder', MC: 'Central midfielder', MCO: 'Defensive midfielder', MP: 'Attacking midfielder', EI: 'Left winger',
  ED: 'Right winger', DI: 'Left striker', DD: 'Right striker',
};
// En las formaciones con un solo delantero, "DC" es el delantero centro, no un central.
const DELANTERO_CENTRO = new Set(['4-3-3', '4-2-3-1', '4-1-4-1', '5-4-1', '3-4-3']);

export function nombrePuesto(clave: string, formacion: string, idioma: 'es' | 'en' = 'es'): string {
  if (clave === 'DC' && DELANTERO_CENTRO.has(formacion)) return idioma === 'en' ? 'Centre-forward' : 'Delantero centro';
  return (idioma === 'en' ? NOMBRE_EN : NOMBRE_ES)[clave] || clave;
}

/** Alineación vacía con la formación elegida. */
export function alineacionNueva(formacion = '4-4-2'): AlineacionSugerida {
  return { formacion, puestos: (FORMACIONES[formacion] || FORMACIONES['4-4-2']).map(([clave, x, y]) => ({ clave, x, y, player_id: null, motivo: '' })), nota: '' };
}

/**
 * Cambia de formación conservando a los jugadores (y su motivo) de las casillas
 * que existen en las dos. Los demás jugadores pasan, en orden, a las casillas libres.
 */
export function cambiarFormacion(actual: AlineacionSugerida, formacion: string): AlineacionSugerida {
  const nueva = alineacionNueva(formacion);
  const usados = new Set<string>();
  nueva.puestos.forEach((p) => {
    const igual = actual.puestos.find((a) => a.clave === p.clave && a.player_id);
    if (igual) { p.player_id = igual.player_id; p.motivo = igual.motivo; usados.add(igual.clave); }
  });
  const sobrantes = actual.puestos.filter((a) => a.player_id && !usados.has(a.clave));
  nueva.puestos.filter((p) => !p.player_id).forEach((p) => {
    const s = sobrantes.shift();
    if (s) { p.player_id = s.player_id; p.motivo = s.motivo; }
  });
  return { ...nueva, nota: actual.nota };
}

/** Tiene algo que mostrar en los reportes. */
export function alineacionConContenido(a?: AlineacionSugerida | null): a is AlineacionSugerida {
  return !!a && Array.isArray(a.puestos) && a.puestos.some((p) => p.player_id);
}

/** Nombre corto para la cancha: las dos primeras palabras. */
/**
 * Fecha del partido tal como se registró ("2026-10-02" → 2 de octubre), leída
 * como fecha local. `new Date("2026-10-02")` la toma como medianoche UTC y en
 * México la muestra un día antes; por eso se arma con año, mes y día.
 */
export function fechaLocal(fecha: string | null | undefined): Date {
  const [a, m, d] = String(fecha || '').slice(0, 10).split('-').map(Number);
  return a && m && d ? new Date(a, m - 1, d) : new Date(String(fecha));
}

export const nombreCorto = (nombre: string) => nombre.trim().split(/\s+/).slice(0, 2).join(' ');
