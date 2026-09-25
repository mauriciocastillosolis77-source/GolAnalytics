import type { DafoRival } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// DAFO del rival (Análisis del Rival). La IA recibe un resumen ya calculado de:
//  - lo etiquetado del rival en Análisis del Rival (momentos y notas), y
//  - los partidos propios contra ese rival (goles, zonas, balón parado).
// Devuelve 4 listas cortas, cada punto con el dato que lo respalda.
// Gemini, mismo patrón que el resto del repo; solo se llama con el botón.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
function getGeminiApiKey(): string {
    const env = (import.meta as any).env;
    const apiKey = env.VITE_API_KEY || env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
    if (!apiKey) throw new Error('Falta la API key de Gemini (VITE_API_KEY).');
    return apiKey;
}

const limpiarLista = (v: any): string[] =>
    Array.isArray(v) ? v.map(x => String(x).replace(/\*\*(.*?)\*\*/g, '$1').replace(/^[-•]\s*/, '').trim()).filter(Boolean).slice(0, 4) : [];

export async function generarDafoRival(p: {
    equipo: string;
    rival: string;
    resumenRival: string;     // lo etiquetado del rival (texto ya armado)
    resumenPartidos: string;  // datos de nuestros partidos contra él (texto ya armado)
    partidos: number;
    momentos: number;
}): Promise<DafoRival> {
    const prompt = `Eres el analista táctico de ${p.equipo}, un equipo de fútbol juvenil. Prepara el DAFO del rival "${p.rival}" para el próximo partido contra él.

LO QUE SE ETIQUETÓ DEL RIVAL (Análisis del Rival):
${p.resumenRival || '(nada etiquetado todavía)'}

NUESTROS PARTIDOS CONTRA ESTE RIVAL:
${p.resumenPartidos || '(no hay partidos elegidos)'}

Escribe el DAFO desde nuestro punto de vista:
- fortalezas: lo que el rival hace bien.
- debilidades: dónde falla el rival.
- oportunidades: cómo podemos aprovechar sus debilidades.
- amenazas: qué debemos cuidar para que no nos haga daño.

Reglas: de 2 a 4 puntos por cuadro; cada punto en una sola oración corta y con el dato que lo respalda entre paréntesis (por ejemplo "(4 de 7 córners al 1er palo)"). No inventes datos que no estén arriba; si un cuadro no tiene datos suficientes, pon un solo punto que lo diga. Español, tono de cuerpo técnico, sin Markdown.
Responde ÚNICAMENTE con JSON válido con esta forma exacta:
{"fortalezas":["..."],"debilidades":["..."],"oportunidades":["..."],"amenazas":["..."]}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${getGeminiApiKey()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    if (!response.ok) {
        console.error('Gemini API error (DAFO rival):', await response.text());
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
        if (!m) throw new Error('La IA no devolvió el DAFO en el formato esperado. Intenta de nuevo.');
        json = JSON.parse(m[0]);
    }
    return {
        fortalezas: limpiarLista(json.fortalezas),
        debilidades: limpiarLista(json.debilidades),
        oportunidades: limpiarLista(json.oportunidades),
        amenazas: limpiarLista(json.amenazas),
        generado: new Date().toISOString(),
        partidos: p.partidos,
        momentos: p.momentos,
    };
}
