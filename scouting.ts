// ─────────────────────────────────────────────────────────────────────────────
// Scouting: catálogos y cálculos de la ficha del jugador.
//
// La ficha sigue la plantilla "Informe individual" (portada, ficha, 5 secciones
// de cualidades del 1 al 10, comparación, video y valoración final).
// Scouting es independiente del etiquetado: sus jugadores viven en la tabla
// `scouting_players`, NO en `players`, así que nunca aparecen en el Etiquetador.
// ─────────────────────────────────────────────────────────────────────────────

export type SeccionClave = 'fisicas' | 'tecnicas' | 'tacticas' | 'cognitivas' | 'modelo';

export interface SeccionCualidades {
  clave: SeccionClave;
  /** Título completo, como en la plantilla. */
  titulo: string;
  /** Nombre corto para pestañas y resúmenes. */
  corto: string;
  lineas: Array<{ clave: string; label: string }>;
}

const linea = (label: string) => ({
  clave: label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  label,
});

// Las 46 líneas, en el mismo orden que la plantilla.
export const SECCIONES: SeccionCualidades[] = [
  {
    clave: 'fisicas', titulo: 'Cualidades físicas', corto: 'Físicas',
    lineas: ['Velocidad de desplazamiento', 'Aceleración', 'Fuerza', 'Resistencia', 'Agilidad', 'Coordinación', 'Velocidad de reacción', 'Potencia', 'Recuperación de fatiga', 'Tendencia a lesiones'].map(linea),
  },
  {
    clave: 'tecnicas', titulo: 'Cualidades técnicas', corto: 'Técnicas',
    lineas: ['Pierna menos dominante', 'Entrada', 'Despeje', 'Superficies de contacto', 'Conducción', 'Regate', 'Tiro', 'Control de balón', 'Pase largo', 'Pase corto'].map(linea),
  },
  {
    clave: 'tacticas', titulo: 'Cualidades tácticas', corto: 'Tácticas',
    lineas: ['Temporizaciones', 'Desmarques', 'Apoyos ofensivos', 'Vigilancias', 'Dominio de espacios', 'Marcajes', 'Ayudas defensivas', 'Repliegue', 'Cobertura', 'Posicionamiento'].map(linea),
  },
  {
    clave: 'cognitivas', titulo: 'Cualidades cognitivas', corto: 'Cognitivas',
    lineas: ['Personalidad', 'Comunicación', 'Inteligencia', 'Polivalencia', 'Agresividad', 'Mentalidad', 'Compañerismo', 'Competitividad', 'Carácter', 'Liderazgo'].map(linea),
  },
  {
    clave: 'modelo', titulo: 'Cualidades para el modelo de juego', corto: 'Modelo de juego',
    lineas: ['Evitar transiciones', 'Intensidad', 'Búsqueda de espacios', 'Segundas jugadas', 'Descarga a banda', 'Presión tras pérdida'].map(linea),
  },
];

// Puestos del 4-4-2 + portero: 11 puestos definidos, uno por cada caja de la
// cancha. Derecha e izquierda son puestos distintos a propósito (un central por
// derecha no rinde igual por izquierda), así que cada jugador lleva su posición
// real. En la vista ejecutiva cada caja muestra a los 3 mejor calificados de
// ESE puesto exacto; un jugador nunca aparece en la caja de otro puesto aunque
// su calificación sea más alta.
export const PUESTOS: Array<{ clave: string; label: string }> = [
  { clave: 'POR', label: 'Portero' },
  { clave: 'LD', label: 'Lateral derecho' },
  { clave: 'DCD', label: 'Central derecho' },
  { clave: 'DCI', label: 'Central izquierdo' },
  { clave: 'LI', label: 'Lateral izquierdo' },
  { clave: 'MD', label: 'Medio derecho' },
  { clave: 'MCD', label: 'Medio centro derecho' },
  { clave: 'MCI', label: 'Medio centro izquierdo' },
  { clave: 'MI', label: 'Medio izquierdo' },
  { clave: 'DD', label: 'Delantero derecho' },
  { clave: 'DI', label: 'Delantero izquierdo' },
];
export const puestoLabel = (clave?: string | null) => PUESTOS.find((p) => p.clave === clave)?.label || '';

export const TIPOS_JUGADOR = ['Estrella', 'Presente', 'Futuro', 'Fin contrato'];
export const PIERNAS = ['Diestro', 'Zurdo', 'Ambidiestro'];

export type ValoracionFinal = 'incorporar' | 'seguimiento' | 'descartar';
export const VALORACIONES: Array<{ clave: ValoracionFinal; label: string; color: string }> = [
  { clave: 'incorporar', label: 'Incorporar', color: '#16a34a' },
  { clave: 'seguimiento', label: 'Continuar seguimiento', color: '#d97706' },
  { clave: 'descartar', label: 'Descartar', color: '#dc2626' },
];
export const valoracionDe = (clave?: string | null) => VALORACIONES.find((v) => v.clave === clave);

/** Calificaciones guardadas: { fisicas: { fuerza: 7, ... }, tecnicas: { ... }, ... } */
export type Cualidades = Partial<Record<SeccionClave, Record<string, number>>>;

/** Una fila de `scouting_players`. */
export interface ScoutingPlayer {
  id: string;
  /** Si es jugador del equipo propio: su id en `players`. Los de otros equipos lo llevan en null. */
  player_id: string | null;
  nombre: string;
  equipo: string | null;
  /** "Tipo de competición": texto libre con la liga o torneo en la que juega. */
  competicion: string | null;
  puesto: string | null;
  dorsal: number | null;
  altura_cm: number | null;
  peso_kg: number | null;
  pierna: string | null;
  fecha_nacimiento: string | null;
  nacionalidad: string | null;
  valor_mercado: string | null;
  tipo_jugador: string | null;
  /** Foto ya reducida, guardada como imagen en texto (data URL). */
  foto: string | null;
  video_url: string | null;
  cualidades: Cualidades;
  valoracion: string | null;
  descripcion: string | null;
  modelo_juego: string | null;
  puntos_fuertes: string | null;
  puntos_debiles: string | null;
  created_at?: string;
  updated_at?: string;
}

export const FICHA_VACIA: Omit<ScoutingPlayer, 'id'> = {
  player_id: null, nombre: '', equipo: null, competicion: null, puesto: null, dorsal: null,
  altura_cm: null, peso_kg: null, pierna: null, fecha_nacimiento: null, nacionalidad: null,
  valor_mercado: null, tipo_jugador: null, foto: null, video_url: null, cualidades: {},
  valoracion: null, descripcion: null, modelo_juego: null, puntos_fuertes: null, puntos_debiles: null,
};

const redondear1 = (n: number) => Math.round(n * 10) / 10;

/** Media de una sección: promedio de las líneas que ya tienen calificación. null si no hay ninguna. */
export function mediaSeccion(cualidades: Cualidades | null | undefined, seccion: SeccionClave): number | null {
  const sec = SECCIONES.find((s) => s.clave === seccion);
  const valores = (sec?.lineas || [])
    .map((l) => cualidades?.[seccion]?.[l.clave])
    .filter((v): v is number => typeof v === 'number' && v >= 1 && v <= 10);
  if (valores.length === 0) return null;
  return redondear1(valores.reduce((s, v) => s + v, 0) / valores.length);
}

/** Cuántas líneas de la sección ya están calificadas. */
export function lineasCalificadas(cualidades: Cualidades | null | undefined, seccion: SeccionClave): number {
  const sec = SECCIONES.find((s) => s.clave === seccion);
  return (sec?.lineas || []).filter((l) => typeof cualidades?.[seccion]?.[l.clave] === 'number').length;
}

/**
 * Promedio general: el promedio de las medias de las secciones calificadas
 * (las cinco pesan igual). Es el número que ordena a los jugadores DENTRO de su
 * puesto: en la cancha van los 3 con mejor promedio de cada puesto.
 */
export function mediaGeneral(cualidades: Cualidades | null | undefined): { media: number | null; secciones: number } {
  const medias = SECCIONES.map((s) => mediaSeccion(cualidades, s.clave)).filter((m): m is number => m !== null);
  if (medias.length === 0) return { media: null, secciones: 0 };
  return { media: redondear1(medias.reduce((s, v) => s + v, 0) / medias.length), secciones: medias.length };
}

export function edadDe(fechaNacimiento?: string | null): number | null {
  if (!fechaNacimiento) return null;
  const nac = new Date(fechaNacimiento + 'T00:00:00');
  if (isNaN(nac.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad >= 0 && edad < 100 ? edad : null;
}

/**
 * Reduce una foto a tamaño de credencial antes de guardarla (lado mayor de
 * `maxLado` px, JPEG). Así una foto pesa unos 20-30 KB y cabe en la base de
 * datos sin acercarse al límite del plan gratuito. La original no se toca.
 */
export function reducirFoto(archivo: File, maxLado = 320, calidad = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      try {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No se pudo procesar la imagen.');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Ese archivo no es una imagen que se pueda leer.')); };
    img.src = url;
  });
}
