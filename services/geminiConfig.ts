// ─────────────────────────────────────────────────────────────────────────────
// Único lugar donde se decide qué modelo de Gemini usa la plataforma.
// Antes el nombre del modelo estaba copiado en 8 archivos; para cambiarlo
// ahora basta con tocar las dos constantes de abajo.
//
// PRINCIPAL: el que usan todos los botones de IA.
// RESPALDO:  solo se usa cuando el usuario lo pide a mano (botón "Intentar con
//            el modelo de respaldo" en Análisis Ejecutivo Post Partido) — nunca
//            se cambia ni se reintenta solo.
// ─────────────────────────────────────────────────────────────────────────────
export const GEMINI_MODELO_PRINCIPAL = 'gemini-3.8-flash';
export const GEMINI_MODELO_RESPALDO = 'gemini-3.5-flash-lite';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

let usandoRespaldo = false;

export function modeloGeminiActual(): string {
  return usandoRespaldo ? GEMINI_MODELO_RESPALDO : GEMINI_MODELO_PRINCIPAL;
}

/** Dirección a la que se manda la consulta (sin la llave). */
export function geminiApiUrl(): string {
  return `${GEMINI_BASE_URL}/${modeloGeminiActual()}:generateContent`;
}

/** Corre `fn` usando el modelo de respaldo y al terminar regresa al principal. */
export async function conModeloDeRespaldo<T>(fn: () => Promise<T>): Promise<T> {
  usandoRespaldo = true;
  try {
    return await fn();
  } finally {
    usandoRespaldo = false;
  }
}

export function esErrorDeGemini(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return /gemini/i.test(msg);
}

/** Traduce el error técnico de Gemini a algo que diga qué pasó y qué hacer. */
export function mensajeErrorGemini(err: unknown): string {
  const msg = String((err as any)?.message || err || '');
  if (!esErrorDeGemini(err)) return msg;
  if (/\b503\b/.test(msg)) return 'Los servidores de Google (Gemini) están saturados en este momento (error 503). No es tu cuota: es del lado de Google.';
  if (/\b429\b/.test(msg) || /cuota/i.test(msg)) return 'Se agotó por ahora la cuota gratuita de Gemini para este modelo (error 429).';
  if (/\b404\b/.test(msg)) return 'Gemini respondió que este modelo no está disponible para tu llave (error 404).';
  if (/\b40[03]\b/.test(msg)) return `Gemini rechazó la consulta (${msg}). Revisa que la llave VITE_API_KEY siga vigente.`;
  return msg;
}
