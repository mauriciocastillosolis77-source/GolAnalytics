import type { PlanPartido } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Plan de Partido + Recomendaciones de trabajo (Análisis del Rival). Mismo
// patrón que dafoRivalService.ts: la IA recibe el DAFO ya generado (la síntesis
// de fortalezas/debilidades/oportunidades/amenazas) más el resumen crudo de lo
// etiquetado, y convierte eso en un plan accionable. Se llama con un botón,
// como el DAFO — no se escribe desde cero.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
function getGeminiApiKey(): string {
  const env = (import.meta as any).env;
  const apiKey = env.VITE_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('Falta la API key de Gemini (VITE_API_KEY).');
  return apiKey;
}

const limpiarTexto = (v: any): string => String(v || '').replace(/\*\*(.*?)\*\*/g, '$1').trim();
const limpiarLista = (v: any, max: number): string[] =>
  Array.isArray(v) ? v.map(x => String(x).replace(/\*\*(.*?)\*\*/g, '$1').replace(/^[-•]\s*/, '').trim()).filter(Boolean).slice(0, max) : [];

export async function generarPlanPartidoRival(p: {
  equipo: string;
  rival: string;
  dafo?: { fortalezas: string[]; debilidades: string[]; oportunidades: string[]; amenazas: string[] } | null;
  resumenRival: string;     // lo etiquetado del rival (fases, balón parado — texto ya armado)
  resumenPartidos: string;  // nuestros partidos contra él
}): Promise<{ plan: PlanPartido; temas: string[] }> {
  const dafoTexto = p.dafo
    ? `FORTALEZAS del rival:\n${(p.dafo.fortalezas || []).map(f => `- ${f}`).join('\n')}\nDEBILIDADES del rival:\n${(p.dafo.debilidades || []).map(f => `- ${f}`).join('\n')}\nOPORTUNIDADES para nosotros:\n${(p.dafo.oportunidades || []).map(f => `- ${f}`).join('\n')}\nAMENAZAS para nosotros:\n${(p.dafo.amenazas || []).map(f => `- ${f}`).join('\n')}`
    : '(Todavía no se ha generado el DAFO de este rival — genera primero el DAFO para un mejor plan.)';

  const prompt = `Eres el analista táctico de ${p.equipo}, un equipo de fútbol juvenil. Con base en el DAFO ya generado y el detalle etiquetado del rival "${p.rival}", arma el plan de partido para enfrentarlo.

DAFO DEL RIVAL (ya generado):
${dafoTexto}

DETALLE ETIQUETADO DEL RIVAL (fases, balón parado):
${p.resumenRival || '(nada etiquetado todavía)'}

NUESTROS PARTIDOS CONTRA ESTE RIVAL:
${p.resumenPartidos || '(no hay partidos elegidos)'}

Genera:
- estrategia: 1 párrafo corto (2-3 oraciones) con la idea general del plan, basado en las oportunidades/amenazas del DAFO.
- adaptaciones: 3 a 4 ajustes tácticos concretos que le pedimos a ${p.equipo} para este partido.
- abpOfensivo: 1-2 oraciones de cómo aprovechar NUESTRAS jugadas de balón parado contra la forma en que el rival defiende (usa el dato de "cuando defiende" si existe).
- abpDefensivo: 1-2 oraciones de cómo defender SUS jugadas de balón parado, usando el dato real de cómo cobra (zona, pie, si existe).
- temas: 3 a 4 objetivos cortos de entrenamiento para esta semana, derivados de lo anterior (NO ejercicios armados, solo el objetivo — por ejemplo "Marcaje en córners al primer palo", no el ejercicio completo).

Reglas: usa solo los datos de arriba, no inventes cifras que no estén. Español, tono de cuerpo técnico, sin Markdown ni asteriscos.
Responde ÚNICAMENTE con JSON válido con esta forma exacta:
{"estrategia":"...","adaptaciones":["..."],"abpOfensivo":"...","abpDefensivo":"...","temas":["..."]}`;

  const response = await fetch(`${GEMINI_API_URL}?key=${getGeminiApiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
  });
  if (!response.ok) {
    console.error('Gemini API error (plan de partido):', await response.text());
    if (response.status === 429) throw new Error('Se agotó por ahora la cuota gratuita de Gemini. Intenta de nuevo en unos minutos.');
    throw new Error(`Error de Gemini: ${response.status}`);
  }
  const data = await response.json();
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  let json: any;
  try {
    json = JSON.parse(text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim());
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('La IA no devolvió el plan en el formato esperado. Intenta de nuevo.');
    json = JSON.parse(m[0]);
  }
  return {
    plan: {
      estrategia: limpiarTexto(json.estrategia),
      adaptaciones: limpiarLista(json.adaptaciones, 4),
      abpOfensivo: limpiarTexto(json.abpOfensivo),
      abpDefensivo: limpiarTexto(json.abpDefensivo),
    },
    temas: limpiarLista(json.temas, 4),
  };
}
