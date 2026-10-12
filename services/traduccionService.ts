import { supabase } from './supabaseClient';
import { geminiApiUrl, modeloGeminiActual } from './geminiConfig';

// ─────────────────────────────────────────────────────────────────────────────
// Traducción al inglés de los textos que NO son fijos: lo que escribe la IA y
// lo que escribe el usuario a mano. Solo se usa al exportar en inglés.
//
// Reglas:
//  · Una sola consulta a Gemini por archivo.
//  · La traducción se guarda en Supabase (tabla `traducciones_en`): mientras el
//    texto en español no cambie, no se vuelve a consultar y sale igual en
//    cualquier computadora.
//  · Sin reintento automático. Si Gemini no responde, se lanza el error y NO se
//    genera el archivo: un reporte mitad inglés y mitad español no sirve.
//  · Si la tabla todavía no existe (no se corrió el SQL), la traducción funciona
//    igual, solo que no queda guardada (`guardada: false`).
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultadoTextos {
  textos: Record<string, string>;
  /** 'guardada' = salió de Supabase, sin consultar a Gemini. */
  origen: 'guardada' | 'nueva' | 'sin_texto';
  /** false = se tradujo, pero no se pudo guardar (falta el SQL o no hay permiso). */
  guardada: boolean;
}

export interface ResultadoObjeto<T> {
  datos: T;
  origen: ResultadoTextos['origen'];
  guardada: boolean;
}

/** Huella corta de un texto (para saber si el español cambió desde la última traducción). */
export function huella(texto: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function apiKeyGemini(): string {
  const env = (import.meta as any).env || {};
  const apiKey = env.VITE_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('Falta la llave de Gemini (VITE_API_KEY).');
  return apiKey;
}

async function leerGuardada(clave: string, firma: string): Promise<Record<string, string> | null> {
  try {
    const { data, error } = await supabase.from('traducciones_en').select('firma, contenido').eq('clave', clave).maybeSingle();
    if (error || !data) return null;
    const fila = data as { firma: string; contenido: Record<string, string> };
    return fila.firma === firma && fila.contenido && typeof fila.contenido === 'object' ? fila.contenido : null;
  } catch {
    return null;
  }
}

async function guardar(clave: string, firma: string, contenido: Record<string, string>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('traducciones_en')
      .upsert({ clave, firma, contenido, modelo: modeloGeminiActual(), updated_at: new Date().toISOString() }, { onConflict: 'clave' });
    if (error) {
      console.warn('La traducción no se pudo guardar (¿ya se corrió el SQL de traducciones_en?):', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('La traducción no se pudo guardar:', err);
    return false;
  }
}

async function pedirAGemini(textos: Record<string, string>, contexto: string): Promise<Record<string, string>> {
  const apiKey = apiKeyGemini();
  const prompt = `You are a football analyst writing for an international audience.
Translate the texts below from Spanish into natural football English, the way coaches, analysts and scouts actually write. The texts belong to: ${contexto}.
Use international (British) football vocabulary: football, pitch, match, matchday, centre-back, full-back, winger, striker, set piece, the box, off the ball, ball recoveries, success rate.
Keep the same meaning, the same tone and the same level of detail. Do not add, remove or soften anything.
Keep numbers, percentages, shirt numbers and the names of players, clubs and competitions exactly as written.
Return ONLY a JSON object with exactly the same keys as the input, each holding the translation of its text.

${JSON.stringify(textos)}`;

  const res = await fetch(`${geminiApiUrl()}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
  });
  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const data = await res.json();
  let json: any = null;
  try {
    json = JSON.parse(String(data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim());
  } catch {
    json = null;
  }
  const salida: Record<string, string> = {};
  const faltan = Object.keys(textos).filter((k) => {
    const v = json && typeof json[k] === 'string' ? json[k].trim() : '';
    if (v) salida[k] = v;
    return !v;
  });
  // Si falta aunque sea un texto no se acepta nada: el archivo saldría en dos idiomas.
  if (faltan.length > 0) throw new Error('Gemini regresó la traducción incompleta. Vuelve a intentar.');
  return salida;
}

/**
 * Traduce un grupo de textos (llave → texto en español). Los vacíos se ignoran.
 * `clave` identifica a qué pertenecen (ej. "scouting:<id>"): es la fila donde se guarda.
 */
export async function traducirTextos(clave: string, textos: Record<string, string>, contexto: string): Promise<ResultadoTextos> {
  const conTexto: Record<string, string> = {};
  Object.keys(textos).sort().forEach((k) => {
    const v = typeof textos[k] === 'string' ? textos[k].trim() : '';
    if (v) conTexto[k] = v;
  });
  if (Object.keys(conTexto).length === 0) return { textos: {}, origen: 'sin_texto', guardada: true };

  const firma = huella(JSON.stringify(conTexto));
  const guardada = await leerGuardada(clave, firma);
  if (guardada && Object.keys(conTexto).every((k) => typeof guardada[k] === 'string' && guardada[k].trim())) {
    return { textos: guardada, origen: 'guardada', guardada: true };
  }

  const en = await pedirAGemini(conTexto, contexto);
  const ok = await guardar(clave, firma, en);
  return { textos: en, origen: 'nueva', guardada: ok };
}

/**
 * Traduce todos los textos de un objeto (por ejemplo el análisis que escribió la IA)
 * y regresa una copia con la misma forma. Los números se dejan igual.
 * `omitir`: nombres de campo que no se traducen (ej. 'nombre', 'tendencia').
 * La fila donde se guarda es `prefijo` + la huella del contenido: cada análisis
 * distinto tiene su propia traducción.
 */
export async function traducirObjeto<T>(prefijo: string, objeto: T, contexto: string, omitir: string[] = []): Promise<ResultadoObjeto<T>> {
  const planos: Record<string, string> = {};
  const recorrer = (valor: any, ruta: string) => {
    if (typeof valor === 'string') { if (valor.trim()) planos[ruta] = valor; return; }
    if (Array.isArray(valor)) { valor.forEach((v, i) => recorrer(v, `${ruta}.${i}`)); return; }
    if (valor && typeof valor === 'object') {
      Object.keys(valor).forEach((k) => { if (!omitir.includes(k)) recorrer(valor[k], ruta ? `${ruta}.${k}` : k); });
    }
  };
  recorrer(objeto, '');

  const clave = `${prefijo}:${huella(JSON.stringify(planos))}`;
  const r = await traducirTextos(clave, planos, contexto);

  const copia = JSON.parse(JSON.stringify(objeto));
  Object.keys(r.textos).forEach((ruta) => {
    const partes = ruta.split('.').filter(Boolean);
    let nodo: any = copia;
    for (let i = 0; i < partes.length - 1; i++) { nodo = nodo?.[partes[i]]; if (nodo == null) return; }
    const ultima = partes[partes.length - 1];
    if (nodo && typeof nodo[ultima] === 'string') nodo[ultima] = r.textos[ruta];
  });
  return { datos: copia as T, origen: r.origen, guardada: r.guardada };
}

/** Aviso para la pantalla cuando la traducción salió bien pero no quedó guardada. */
export const AVISO_TRADUCCION_SIN_GUARDAR =
  'El archivo salió en inglés, pero la traducción no se pudo guardar (¿ya corriste el SQL de esta entrega?). La próxima vez se volverá a consultar a Gemini.';
